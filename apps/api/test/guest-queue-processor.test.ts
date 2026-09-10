import { describe, expect, it, vi } from "vitest";

import {
  createGuestQueueProcessor,
  type GuestQueueProcessorDependencies,
} from "../src/guest-queue/index.js";
import type { GuestAttemptLease } from "../src/guest-persistence/index.js";

const LEASE: Readonly<GuestAttemptLease> = Object.freeze({
  guest_scan_id: "scan_01",
  attempt_id: "attempt_01",
  attempt_no: 1,
  monotonic_fence: 7,
  lease_version: 1,
  canonical_target: "example.com",
  lease_expires_at_unix_seconds: 1_800_000_015,
  hard_deadline_unix_seconds: 1_800_000_045,
});

const CONTEXT = Object.freeze({
  envelope: Object.freeze({ schema_version: 1 }),
  trusted: Object.freeze({ now_unix_seconds: 1_800_000_000 }),
});

function harness(overrides: Partial<GuestQueueProcessorDependencies> = {}) {
  const outcomes: string[] = [];
  const dependencies = {
    leases: {
      acquire: vi.fn(async () => ({
        ok: true as const,
        action: "LEASE_ACQUIRED" as const,
        lease: LEASE,
      })),
      start: vi.fn(async () => ({
        ok: true as const,
        action: "STARTED" as const,
      })),
      renew: vi.fn(async () => ({
        ok: true as const,
        action: "LEASE_RENEWED" as const,
        lease_version: 2,
        lease_expires_at_unix_seconds: 1_800_000_020,
      })),
    },
    contexts: { load: vi.fn(async () => CONTEXT) },
    runner: {
      run: vi.fn(async () => ({
        ok: true as const,
        signed_result: {},
        projection: {},
        read_submission: () => ({ signed: "submission" }),
      })),
    },
    committer: {
      commit: vi.fn(async () => ({
        ok: true as const,
        action: "PRIMARY_COMMIT" as const,
        stored_new_result: true,
      })),
    },
    result_rejections: {
      record: vi.fn(async () => ({
        ok: true as const,
        action: "RECORDED" as const,
        security_relevant: true,
      })),
    },
    telemetry: { record: (outcome: string) => outcomes.push(outcome) },
    heartbeat_interval_ms: 100,
    ...overrides,
  } as unknown as GuestQueueProcessorDependencies;
  return { dependencies, outcomes };
}

const MESSAGE = { schema_version: 1, guest_scan_id: "scan_01" };

describe("Guest queue processor", () => {
  it("acquires and starts the database attempt before trusted execution", async () => {
    const test = harness();
    const result = await createGuestQueueProcessor(test.dependencies)(MESSAGE);
    expect(result).toEqual({ outcome: "COMMITTED" });
    expect(test.dependencies.leases.acquire).toHaveBeenCalledWith({
      guest_scan_id: "scan_01",
    });
    expect(test.dependencies.leases.start).toHaveBeenCalledWith({
      guest_scan_id: "scan_01",
      attempt_id: "attempt_01",
      monotonic_fence: 7,
      lease_version: 1,
    });
    expect(test.dependencies.contexts.load).toHaveBeenCalledWith(LEASE);
    expect(test.dependencies.committer.commit).toHaveBeenCalledWith({
      signed: "submission",
    });
    expect(test.outcomes).toEqual(["COMMITTED"]);
  });

  it("acknowledges terminal and non-acquirable records without execution", async () => {
    for (const acquired of [
      { ok: true, action: "JOB_TERMINATED", terminal_state: "FAILED" },
      { ok: false, code: "NOT_ACQUIRABLE" },
    ] as const) {
      const test = harness({
        leases: {
          ...harness().dependencies.leases,
          acquire: vi.fn(async () => acquired),
        },
      });
      const result = await createGuestQueueProcessor(test.dependencies)(
        MESSAGE,
      );
      expect(result.outcome).toMatch(/ACKNOWLEDGED$/u);
      expect(test.dependencies.runner.run).not.toHaveBeenCalled();
    }
  });

  it("retries a held lease instead of creating a competing attempt", async () => {
    const test = harness({
      leases: {
        ...harness().dependencies.leases,
        acquire: vi.fn(async () => ({
          ok: false as const,
          code: "LEASE_HELD" as const,
          retry_after_seconds: 10,
        })),
      },
    });
    await expect(
      createGuestQueueProcessor(test.dependencies)(MESSAGE),
    ).rejects.toMatchObject({
      name: "GuestQueueRetryableError",
      outcome: "RETRY_LEASE_HELD",
    });
    expect(test.dependencies.leases.start).not.toHaveBeenCalled();
    expect(test.outcomes).toEqual(["RETRY_LEASE_HELD"]);
  });

  it("aborts execution and refuses commit when the heartbeat loses its lease", async () => {
    const renew = vi.fn(async () => ({
      ok: false as const,
      code: "STALE_LEASE" as const,
    }));
    const run = vi.fn(
      async (_context: unknown, signal: AbortSignal) =>
        new Promise<{ ok: false; code: "RUN_ABORTED" }>((resolve) => {
          signal.addEventListener(
            "abort",
            () => resolve({ ok: false, code: "RUN_ABORTED" }),
            { once: true },
          );
        }),
    );
    const base = harness();
    const test = harness({
      leases: { ...base.dependencies.leases, renew },
      runner: { run },
    });
    await expect(
      createGuestQueueProcessor(test.dependencies)(MESSAGE),
    ).rejects.toMatchObject({ outcome: "RETRY_HEARTBEAT" });
    expect(renew).toHaveBeenCalledWith({
      guest_scan_id: "scan_01",
      attempt_id: "attempt_01",
      monotonic_fence: 7,
      lease_version: 1,
    });
    expect(test.dependencies.committer.commit).not.toHaveBeenCalled();
  });

  it("retries failed supervisor runs and persistence exceptions", async () => {
    const failedRun = harness({
      runner: {
        run: vi.fn(async () => ({
          ok: false as const,
          code: "SCANNER_PROCESS_FAILED" as const,
        })),
      },
    });
    await expect(
      createGuestQueueProcessor(failedRun.dependencies)(MESSAGE),
    ).rejects.toMatchObject({ outcome: "RETRY_SUPERVISOR" });

    const unavailable = harness({
      leases: {
        ...harness().dependencies.leases,
        acquire: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      },
    });
    await expect(
      createGuestQueueProcessor(unavailable.dependencies)(MESSAGE),
    ).rejects.toMatchObject({ outcome: "RETRY_PERSISTENCE" });
  });

  it("durably records a rejected commit before queue retry", async () => {
    const record = vi.fn(async () => ({
      ok: true as const,
      action: "RECORDED" as const,
      security_relevant: true,
    }));
    const test = harness({
      committer: {
        commit: vi.fn(async () => ({
          ok: false as const,
          code: "RESULT_DIGEST_CONFLICT" as const,
          emit_security_audit: true,
        })),
      },
      result_rejections: { record },
    });
    await expect(
      createGuestQueueProcessor(test.dependencies)(MESSAGE),
    ).rejects.toMatchObject({ outcome: "RETRY_COMMIT" });
    expect(record).toHaveBeenCalledWith({
      schema_version: 1,
      guest_scan_id: "scan_01",
      attempt_id: "attempt_01",
      monotonic_fence: 7,
      rejection_code: "RESULT_DIGEST_CONFLICT",
    });
    expect(test.outcomes).toEqual(["RETRY_COMMIT"]);
  });

  it("fails closed when rejection evidence cannot be recorded", async () => {
    const test = harness({
      committer: {
        commit: vi.fn(async () => ({
          ok: false as const,
          code: "RESULT_DIGEST_CONFLICT" as const,
          emit_security_audit: true,
        })),
      },
      result_rejections: {
        record: vi.fn(async () => ({
          ok: false as const,
          code: "GUEST_PERSISTENCE_UNAVAILABLE" as const,
        })),
      },
    });
    await expect(
      createGuestQueueProcessor(test.dependencies)(MESSAGE),
    ).rejects.toMatchObject({ outcome: "RETRY_REJECTION_SINK" });
    expect(test.outcomes).toEqual(["RETRY_REJECTION_SINK"]);
  });
});
