import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  guestRedisConnectionConfig,
  type GuestQueueProcessResult,
} from "../src/guest-queue/index.js";
import {
  createGuestWorkerRuntime,
  type GuestWorkerDependencies,
  type GuestWorkerTransportFactory,
} from "../src/guest-worker/index.js";
import {
  createValidatedGuestArtifactApprovalProvider,
  createValidatedResultSigningKeyProvider,
} from "../src/supervisor/index.js";

const KEY = Buffer.alloc(32, 0x61);

function dependencies(): GuestWorkerDependencies {
  return {
    pool: { connect: vi.fn() } as unknown as Pool,
    redis_connection: guestRedisConnectionConfig({
      OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/0",
      OUTSCAN_REDIS_TLS: "disable",
    }),
    approval_provider: createValidatedGuestArtifactApprovalProvider({
      read: () => null,
    }),
    launcher: { launch: async () => null },
    signing_key_provider: createValidatedResultSigningKeyProvider({
      read: () => ({ key_version: 1, key: KEY }),
    }),
    result_verification_keyring: new Map([[1, KEY]]),
    telemetry: {
      record: vi.fn(),
      flush: vi.fn(async () => ({
        ok: true as const,
        action: "EMPTY" as const,
        duplicate: false,
      })),
    },
    on_telemetry_outcome: vi.fn(),
    create_attempt_id: () => "attempt_01",
    now_unix_seconds: () => 1_800_000_000,
  };
}

function transport(overrides: Record<string, unknown> = {}) {
  const waitUntilReady = vi.fn(async () => undefined);
  const close = vi.fn(async () => undefined);
  let process: ((value: unknown) => Promise<GuestQueueProcessResult>) | null =
    null;
  const start = vi.fn(
    (
      _connection: unknown,
      value: (input: unknown) => Promise<GuestQueueProcessResult>,
      _options: Readonly<{ concurrency: number }>,
    ) => {
      void _options;
      process = value;
      return { waitUntilReady, close, ...overrides };
    },
  );
  return {
    factory: { start } as unknown as GuestWorkerTransportFactory,
    start,
    waitUntilReady,
    close,
    process: () => process,
  };
}

describe("Guest worker runtime composition", () => {
  it("wires bounded defaults and provides idempotent lifecycle methods", async () => {
    const queue = transport();
    const deps = dependencies();
    const runtime = createGuestWorkerRuntime(deps, {}, queue.factory);

    expect(queue.start).toHaveBeenCalledTimes(1);
    expect(queue.start.mock.calls[0]?.[2]).toEqual({ concurrency: 1 });
    await Promise.all([runtime.ready(), runtime.ready()]);
    await Promise.all([runtime.close(), runtime.close()]);
    expect(queue.waitUntilReady).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledTimes(1);
    expect(queue.close).toHaveBeenCalledWith(false);
    expect(deps.telemetry.flush).toHaveBeenCalledTimes(1);

    const process = queue.process();
    if (!process) throw new Error("processor not captured");
    await expect(process({ unsafe: true })).rejects.toThrow(
      "INVALID_GUEST_QUEUE_MESSAGE",
    );
  });

  it("forwards only validated concurrency to the queue transport", () => {
    const queue = transport();
    createGuestWorkerRuntime(
      dependencies(),
      {
        concurrency: 8,
        heartbeat_interval_ms: 1_000,
        termination_grace_ms: 2_000,
        telemetry_flush_interval_ms: 30_000,
      },
      queue.factory,
    );
    expect(queue.start.mock.calls[0]?.[2]).toEqual({ concurrency: 8 });
  });

  it.each([
    { concurrency: 0 },
    { concurrency: 65 },
    { heartbeat_interval_ms: 99 },
    { heartbeat_interval_ms: 10_001 },
    { termination_grace_ms: -1 },
    { termination_grace_ms: 10_001 },
    { telemetry_flush_interval_ms: 999 },
    { telemetry_flush_interval_ms: 300_001 },
    { extra: true },
  ])("rejects invalid runtime options before worker start", (options) => {
    const queue = transport();
    expect(() =>
      createGuestWorkerRuntime(dependencies(), options, queue.factory),
    ).toThrow("INVALID_GUEST_WORKER_CONFIGURATION");
    expect(queue.start).not.toHaveBeenCalled();
  });

  it("rejects invalid verification keys and Redis options before start", () => {
    for (const override of [
      { result_verification_keyring: new Map() },
      { result_verification_keyring: new Map([[1, Buffer.alloc(31)]]) },
      {
        redis_connection: {
          ...dependencies().redis_connection,
          maxRetriesPerRequest: 1,
        },
      },
    ]) {
      const queue = transport();
      expect(() =>
        createGuestWorkerRuntime(
          { ...dependencies(), ...override } as GuestWorkerDependencies,
          {},
          queue.factory,
        ),
      ).toThrow("INVALID_GUEST_WORKER_CONFIGURATION");
      expect(queue.start).not.toHaveBeenCalled();
    }
  });

  it("contains transport construction and lifecycle errors", async () => {
    expect(() =>
      createGuestWorkerRuntime(
        dependencies(),
        {},
        {
          start: () => {
            throw new Error("redis credential detail");
          },
        },
      ),
    ).toThrow("GUEST_WORKER_START_FAILED");

    const brokenReady = transport({
      waitUntilReady: async () => {
        throw new Error("redis credential detail");
      },
    });
    const starting = createGuestWorkerRuntime(
      dependencies(),
      {},
      brokenReady.factory,
    );
    await expect(starting.ready()).rejects.toThrow("GUEST_WORKER_START_FAILED");

    const brokenClose = transport({
      close: async () => {
        throw new Error("redis credential detail");
      },
    });
    const stopping = createGuestWorkerRuntime(
      dependencies(),
      {},
      brokenClose.factory,
    );
    await expect(stopping.close()).rejects.toThrow("GUEST_WORKER_STOP_FAILED");
  });

  it("flushes telemetry on close and surfaces a closed failure", async () => {
    const deps = dependencies();
    const queue = transport();
    const runtime = createGuestWorkerRuntime(deps, {}, queue.factory);
    await runtime.close();
    expect(deps.telemetry.flush).toHaveBeenCalledTimes(1);
    expect(deps.on_telemetry_outcome).toHaveBeenCalledWith({
      ok: true,
      action: "EMPTY",
      duplicate: false,
    });

    const failed = dependencies();
    failed.telemetry.flush = vi.fn(async () => ({
      ok: false as const,
      code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE" as const,
      alert_required: true as const,
    }));
    const failing = createGuestWorkerRuntime(failed, {}, transport().factory);
    await expect(failing.close()).rejects.toThrow(
      "GUEST_WORKER_TELEMETRY_FLUSH_FAILED",
    );
  });

  it("force-closes a malformed transport handle", async () => {
    const close = vi.fn(async () => undefined);
    expect(() =>
      createGuestWorkerRuntime(
        dependencies(),
        {},
        {
          start: () => ({ close }),
        },
      ),
    ).toThrow("GUEST_WORKER_START_FAILED");
    await vi.waitFor(() => expect(close).toHaveBeenCalledWith(true));
  });
});
