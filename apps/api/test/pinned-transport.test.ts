import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executePinnedRequest,
  IP_DESTINATION_POLICY_VERSION,
  type PinnedDispatchers,
  type RequestDispatcher,
  type ResolvedTarget,
} from "../src/target/index.js";

const RESOLVED_AT = 1_700_000_000_000;

function target(overrides: Record<string, unknown> = {}): ResolvedTarget {
  return {
    canonical_host: "example.com",
    policy_version: IP_DESTINATION_POLICY_VERSION,
    minimum_ttl_seconds: 60,
    resolved_at_unix_ms: RESOLVED_AT,
    expires_at_unix_ms: RESOLVED_AT + 60_000,
    addresses: [{ address: "8.8.8.8", family: 4 }],
    ...overrides,
  } as ResolvedTarget;
}

function spec(overrides: Record<string, unknown> = {}) {
  return {
    protocol: "https:",
    method: "GET",
    path: "/",
    pinned_address: "8.8.8.8",
    now_unix_ms: RESOLVED_AT + 1_000,
    ...overrides,
  };
}

function limits(overrides: Record<string, unknown> = {}) {
  return {
    timeout_ms: 1_000,
    max_response_bytes: 1_024,
    max_header_pairs: 10,
    max_header_bytes: 1_024,
    ...overrides,
  };
}

class FakeRequest extends EventEmitter {
  ended = false;
  destroyed = false;

  end() {
    this.ended = true;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

class FakeResponse extends EventEmitter {
  complete = true;
  destroyed = false;

  constructor(
    readonly statusCode: number | undefined,
    readonly rawHeaders: unknown,
  ) {
    super();
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

interface Scenario {
  address?: unknown;
  status?: number;
  headers?: unknown;
  chunks?: unknown[];
  complete?: boolean;
  responseFirst?: boolean;
  event?: "aborted" | "request-error" | "response-error";
}

function harness(scenario: Scenario = {}) {
  const request = new FakeRequest();
  const response = new FakeResponse(
    scenario.status ?? 200,
    scenario.headers ?? ["Content-Type", "text/plain", "Content-Length", "2"],
  );
  response.complete = scenario.complete ?? true;
  const socket = new EventEmitter() as EventEmitter & {
    remoteAddress?: unknown;
  };
  socket.remoteAddress = Object.hasOwn(scenario, "address")
    ? scenario.address
    : "8.8.8.8";
  const observed: { options?: RequestOptions } = {};

  const dispatcher: RequestDispatcher = (options, callback) => {
    observed.options = options;
    queueMicrotask(() => {
      if (scenario.event === "request-error") {
        request.emit("error", new Error("secret upstream detail"));
        return;
      }
      request.emit("socket", socket);
      if (scenario.responseFirst)
        callback(response as unknown as IncomingMessage);
      socket.emit(options.protocol === "https:" ? "secureConnect" : "connect");
      if (!scenario.responseFirst)
        callback(response as unknown as IncomingMessage);
      if (scenario.event === "aborted") {
        response.emit("aborted");
        return;
      }
      if (scenario.event === "response-error") {
        response.emit("error", new Error("secret response detail"));
        return;
      }
      for (const chunk of scenario.chunks ?? [Buffer.from("ok")]) {
        response.emit("data", chunk);
      }
      response.emit("end");
    });
    return request as unknown as ClientRequest;
  };
  return {
    request,
    response,
    observed,
    dispatchers: {
      http: dispatcher,
      https: dispatcher,
    } satisfies PinnedDispatchers,
  };
}

afterEach(() => vi.useRealTimers());

describe("pinned transport", () => {
  it("dispatches HTTPS to the pin and returns a bounded response", async () => {
    const fake = harness({
      status: 302,
      headers: ["Location", "/next", "Content-Length", "2"],
    });
    const result = await executePinnedRequest(
      target(),
      spec(),
      limits(),
      [],
      fake.dispatchers,
    );

    expect(result).toEqual({
      ok: true,
      response: {
        status_code: 302,
        headers: [
          { name: "location", value: "/next" },
          { name: "content-length", value: "2" },
        ],
        body: Buffer.from("ok"),
        connected_address: "8.8.8.8",
      },
    });
    expect(fake.observed.options).toMatchObject({
      hostname: "example.com",
      servername: "example.com",
      maxHeaderSize: 1_024,
      agent: false,
    });
    expect(fake.request.ended).toBe(true);
  });

  it("accepts equivalent canonical IPv6 socket addresses", async () => {
    const approved = "2001:4860:4860::8888";
    const fake = harness({ address: "2001:4860:4860:0:0:0:0:8888" });
    const result = await executePinnedRequest(
      target({ addresses: [{ address: approved, family: 6 }] }),
      spec({ pinned_address: approved }),
      limits(),
      [],
      fake.dispatchers,
    );
    expect(result).toMatchObject({
      ok: true,
      response: { connected_address: approved },
    });
  });

  it.each(["1.1.1.1", "127.0.0.1", undefined])(
    "fails closed for an unexpected socket address %s",
    async (address) => {
      const fake = harness({ address });
      await expect(
        executePinnedRequest(target(), spec(), limits(), [], fake.dispatchers),
      ).resolves.toEqual({ ok: false, code: "PIN_MISMATCH" });
      expect(fake.request.destroyed).toBe(true);
    },
  );

  it("rejects a response delivered before socket validation", async () => {
    const fake = harness({ responseFirst: true });
    await expect(
      executePinnedRequest(target(), spec(), limits(), [], fake.dispatchers),
    ).resolves.toEqual({ ok: false, code: "PIN_MISMATCH" });
  });

  it.each([
    [["Content-Length", "0", "Transfer-Encoding", "chunked"], [], true],
    [["Content-Length", "2", "Content-Length", "2"], ["ok"], true],
    [["Content-Length", "+2"], ["ok"], true],
    [["Content-Length", "0"], ["x"], true],
    [["Content-Length", "2"], ["x"], true],
    [["Content-Length", "2"], ["ok"], false],
  ])(
    "rejects ambiguous or incomplete HTTP framing",
    async (headers, chunks, complete) => {
      const fake = harness({ headers, chunks, complete });
      await expect(
        executePinnedRequest(target(), spec(), limits(), [], fake.dispatchers),
      ).resolves.toEqual({ ok: false, code: "INVALID_RESPONSE" });
    },
  );

  it("rejects declared and streamed bodies beyond the configured limit", async () => {
    for (const scenario of [
      { headers: ["Content-Length", "3"], chunks: [] },
      { headers: [], chunks: ["abc"] },
    ]) {
      const fake = harness(scenario);
      await expect(
        executePinnedRequest(
          target(),
          spec(),
          limits({ max_response_bytes: 2 }),
          [],
          fake.dispatchers,
        ),
      ).resolves.toEqual({ ok: false, code: "RESPONSE_TOO_LARGE" });
    }
  });

  it.each([
    [["Bad Name", "x"], {}],
    [["X-Test", "line\r\nbreak"], {}],
    [["A", "1", "B", "2"], { max_header_pairs: 1 }],
    [["Long", "value"], { max_header_bytes: 2 }],
  ])("rejects hostile response headers", async (headers, override) => {
    const fake = harness({ headers, chunks: [] });
    await expect(
      executePinnedRequest(
        target(),
        spec(),
        limits(override),
        [],
        fake.dispatchers,
      ),
    ).resolves.toEqual({ ok: false, code: "RESPONSE_HEADERS_REJECTED" });
  });

  it.each(["request-error", "response-error", "aborted"] as const)(
    "redacts %s details behind a stable transport code",
    async (event) => {
      const fake = harness({ event });
      await expect(
        executePinnedRequest(target(), spec(), limits(), [], fake.dispatchers),
      ).resolves.toEqual({ ok: false, code: "TRANSPORT_ERROR" });
    },
  );

  it("enforces a wall-clock deadline", async () => {
    vi.useFakeTimers();
    const request = new FakeRequest();
    const silent: RequestDispatcher = () => request as unknown as ClientRequest;
    const pending = executePinnedRequest(target(), spec(), limits(), [], {
      http: silent,
      https: silent,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ ok: false, code: "TIMEOUT" });
    expect(request.destroyed).toBe(true);
  });

  it("maps synchronous setup failures to a redacted code", async () => {
    const throws: RequestDispatcher = () => {
      throw new Error("secret setup detail");
    };
    await expect(
      executePinnedRequest(target(), spec(), limits(), [], {
        http: throws,
        https: throws,
      }),
    ).resolves.toEqual({ ok: false, code: "TRANSPORT_INIT_FAILED" });
  });

  it.each([
    { timeout_ms: 99 },
    { max_response_bytes: 0 },
    { max_header_pairs: 101 },
    { max_header_bytes: 65_537 },
    { extra: true },
  ])("rejects invalid limits", async (override) => {
    await expect(
      executePinnedRequest(target(), spec(), limits(override)),
    ).resolves.toEqual({ ok: false, code: "INVALID_LIMITS" });
  });

  it("contains hostile limit access and propagates pin-plan denials", async () => {
    const hostile = limits();
    Object.defineProperty(hostile, "timeout_ms", {
      enumerable: true,
      get: () => {
        throw new Error("hostile getter");
      },
    });
    await expect(
      executePinnedRequest(target(), spec(), hostile),
    ).resolves.toEqual({
      ok: false,
      code: "INVALID_LIMITS",
    });
    await expect(
      executePinnedRequest(
        target(),
        spec({ pinned_address: "1.1.1.1" }),
        limits(),
      ),
    ).resolves.toEqual({ ok: false, code: "PIN_NOT_APPROVED" });
  });

  it("uses an immutable snapshot when a limit getter changes", async () => {
    let reads = 0;
    const unstable = limits();
    Object.defineProperty(unstable, "max_response_bytes", {
      enumerable: true,
      get: () => (++reads === 1 ? 2 : 1),
    });
    const fake = harness();
    await expect(
      executePinnedRequest(target(), spec(), unstable, [], fake.dispatchers),
    ).resolves.toMatchObject({ ok: true });
    expect(reads).toBe(1);
  });
});
