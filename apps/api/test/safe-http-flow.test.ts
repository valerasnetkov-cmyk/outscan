import { describe, expect, it, vi } from "vitest";

import {
  executeSafeHttpFlow,
  type DnsAddressResolver,
  type PinnedTransportExecutor,
  type PinnedTransportResponse,
} from "../src/target/index.js";

const NOW = 1_700_000_000_000;

function noData() {
  return Object.assign(new Error("no data"), { code: "ENODATA" });
}

function resolver(addresses: string[] = ["8.8.8.8"]) {
  let index = 0;
  const client: DnsAddressResolver = {
    resolve4: vi.fn(async () => [
      {
        address: addresses[Math.min(index++, addresses.length - 1)]!,
        ttl: 60,
      },
    ]),
    resolve6: vi.fn(async () => {
      throw noData();
    }),
  };
  return client;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    canonical_host: "example.com",
    protocol: "https:",
    method: "GET",
    path: "/start",
    deadline_unix_ms: NOW + 30_000,
    max_redirects: 5,
    max_retries: 2,
    max_total_response_bytes: 8_192,
    transport_limits: {
      timeout_ms: 1_000,
      max_response_bytes: 1_024,
      max_header_pairs: 10,
      max_header_bytes: 1_024,
    },
    ...overrides,
  };
}

function response(
  status = 200,
  headers: Array<{ name: string; value: string }> = [],
  body = "ok",
): PinnedTransportResponse {
  return {
    status_code: status,
    headers,
    body: Buffer.from(body),
    connected_address: "8.8.8.8",
  };
}

function transportSequence(
  outcomes: Array<
    | { ok: true; response: PinnedTransportResponse }
    | { ok: false; code: "TRANSPORT_ERROR" | "PIN_MISMATCH" | "TIMEOUT" }
  >,
) {
  let index = 0;
  return vi.fn<PinnedTransportExecutor>(
    async () => outcomes[Math.min(index++, outcomes.length - 1)]!,
  );
}

const clock = () => NOW;

describe("safe HTTP retry and redirect flow", () => {
  it("re-resolves, revalidates and selects a fresh pin for a same-host redirect", async () => {
    const dns = resolver(["8.8.8.8", "1.1.1.1"]);
    const transport = transportSequence([
      {
        ok: true,
        response: response(302, [
          { name: "location", value: "/next?q=1#ignored" },
        ]),
      },
      { ok: true, response: response() },
    ]);

    const result = await executeSafeHttpFlow(input(), dns, [], {
      now: clock,
      transport,
    });

    expect(result).toMatchObject({
      ok: true,
      request_count: 2,
      redirect_count: 1,
      stop_reason: "COMPLETE",
    });
    expect(dns.resolve4).toHaveBeenCalledTimes(2);
    expect(dns.resolve6).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      path: "/start",
      pinned_address: "8.8.8.8",
    });
    expect(transport.mock.calls[1]?.[1]).toMatchObject({
      path: "/next?q=1",
      pinned_address: "1.1.1.1",
    });
  });

  it("normalizes an absolute same-host HTTP-to-HTTPS redirect", async () => {
    const transport = transportSequence([
      {
        ok: true,
        response: response(301, [
          { name: "location", value: "https://EXAMPLE.com:443/final" },
        ]),
      },
      { ok: true, response: response() },
    ]);
    await expect(
      executeSafeHttpFlow(input({ protocol: "http:" }), resolver(), [], {
        now: clock,
        transport,
      }),
    ).resolves.toMatchObject({ ok: true, redirect_count: 1 });
    expect(transport.mock.calls[1]?.[1]).toMatchObject({
      protocol: "https:",
      path: "/final",
    });
  });

  it("reports a cross-host redirect without following or resolving it", async () => {
    const dns = resolver();
    const transport = transportSequence([
      {
        ok: true,
        response: response(302, [
          { name: "location", value: "https://other.example/path" },
        ]),
      },
    ]);
    await expect(
      executeSafeHttpFlow(input(), dns, [], { now: clock, transport }),
    ).resolves.toMatchObject({
      ok: true,
      request_count: 1,
      redirect_count: 0,
      stop_reason: "CROSS_HOST_REDIRECT",
    });
    expect(dns.resolve4).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["http://example.com/plain", "REDIRECT_DOWNGRADE"],
    ["https://user@example.com/path", "INVALID_REDIRECT"],
    ["https://example.com:8443/path", "INVALID_REDIRECT"],
    ["ftp://example.com/file", "INVALID_REDIRECT"],
    ["/bad\\path", "INVALID_REDIRECT"],
  ])("rejects unsafe redirect %s", async (location, code) => {
    const transport = transportSequence([
      {
        ok: true,
        response: response(302, [{ name: "location", value: location }]),
      },
    ]);
    await expect(
      executeSafeHttpFlow(input(), resolver(), [], { now: clock, transport }),
    ).resolves.toEqual({ ok: false, code });
  });

  it("rejects duplicate Location fields and redirect budget overflow", async () => {
    const duplicate = transportSequence([
      {
        ok: true,
        response: response(302, [
          { name: "location", value: "/one" },
          { name: "location", value: "/two" },
        ]),
      },
    ]);
    await expect(
      executeSafeHttpFlow(input(), resolver(), [], {
        now: clock,
        transport: duplicate,
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REDIRECT" });

    const redirect = transportSequence([
      {
        ok: true,
        response: response(302, [{ name: "location", value: "/next" }]),
      },
    ]);
    await expect(
      executeSafeHttpFlow(input({ max_redirects: 0 }), resolver(), [], {
        now: clock,
        transport: redirect,
      }),
    ).resolves.toEqual({ ok: false, code: "REDIRECT_LIMIT_EXCEEDED" });
  });

  it("re-resolves before a retry and can select another approved address", async () => {
    const dns = resolver(["8.8.8.8", "1.1.1.1"]);
    const transport = transportSequence([
      { ok: false, code: "TRANSPORT_ERROR" },
      { ok: true, response: response() },
    ]);
    await expect(
      executeSafeHttpFlow(input(), dns, [], { now: clock, transport }),
    ).resolves.toMatchObject({ ok: true, request_count: 2 });
    expect(dns.resolve4).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[1]?.[1]).toMatchObject({
      pinned_address: "1.1.1.1",
    });
  });

  it("retries a redacted DNS operational failure with a fresh dual query", async () => {
    let ipv4Calls = 0;
    const dns: DnsAddressResolver = {
      resolve4: vi.fn(async () => {
        ipv4Calls += 1;
        if (ipv4Calls === 1)
          throw Object.assign(new Error("fail"), { code: "ETIMEOUT" });
        return [{ address: "8.8.8.8", ttl: 60 }];
      }),
      resolve6: vi.fn(async () => {
        throw noData();
      }),
    };
    const transport = transportSequence([{ ok: true, response: response() }]);
    await expect(
      executeSafeHttpFlow(input(), dns, [], { now: clock, transport }),
    ).resolves.toMatchObject({ ok: true, request_count: 1 });
    expect(dns.resolve4).toHaveBeenCalledTimes(2);
    expect(dns.resolve6).toHaveBeenCalledTimes(2);
  });

  it("does not retry a pin mismatch", async () => {
    const dns = resolver();
    const transport = transportSequence([{ ok: false, code: "PIN_MISMATCH" }]);
    await expect(
      executeSafeHttpFlow(input(), dns, [], { now: clock, transport }),
    ).resolves.toEqual({ ok: false, code: "PIN_MISMATCH" });
    expect(dns.resolve4).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("enforces the aggregate response budget across redirects", async () => {
    const transport = transportSequence([
      {
        ok: true,
        response: response(302, [{ name: "location", value: "/next" }], "ab"),
      },
      { ok: true, response: response(200, [], "cd") },
    ]);
    await expect(
      executeSafeHttpFlow(
        input({
          max_total_response_bytes: 3,
          transport_limits: {
            ...input().transport_limits,
            max_response_bytes: 2,
          },
        }),
        resolver(),
        [],
        { now: clock, transport },
      ),
    ).resolves.toEqual({ ok: false, code: "TOTAL_RESPONSE_LIMIT_EXCEEDED" });
  });

  it("enforces the flow deadline before and after dependencies", async () => {
    const transport = transportSequence([{ ok: true, response: response() }]);
    await expect(
      executeSafeHttpFlow(input({ deadline_unix_ms: NOW }), resolver(), [], {
        now: clock,
        transport,
      }),
    ).resolves.toEqual({ ok: false, code: "FLOW_DEADLINE_EXCEEDED" });
    expect(transport).not.toHaveBeenCalled();

    const times = [NOW, NOW, NOW + 30_000];
    await expect(
      executeSafeHttpFlow(input(), resolver(), [], {
        now: () => times.shift()!,
        transport,
      }),
    ).resolves.toEqual({ ok: false, code: "FLOW_DEADLINE_EXCEEDED" });
  });

  it.each([
    { canonical_host: "Example.com" },
    { protocol: "ftp:" },
    { path: "//other.example" },
    { max_redirects: 6 },
    { max_retries: 3 },
    { deadline_unix_ms: -1 },
    { max_total_response_bytes: 1 },
    { extra: true },
  ])("rejects an invalid flow before DNS", async (override) => {
    const dns = resolver();
    await expect(executeSafeHttpFlow(input(override), dns)).resolves.toEqual({
      ok: false,
      code: "INVALID_FLOW",
    });
    expect(dns.resolve4).not.toHaveBeenCalled();
  });

  it("contains hostile clock and transport failures", async () => {
    await expect(
      executeSafeHttpFlow(input(), resolver(), [], {
        now: () => {
          throw new Error("clock detail");
        },
      }),
    ).resolves.toEqual({ ok: false, code: "ORCHESTRATION_FAILED" });
    await expect(
      executeSafeHttpFlow(input(), resolver(), [], {
        now: clock,
        transport: async () => {
          throw new Error("transport detail");
        },
      }),
    ).resolves.toEqual({ ok: false, code: "ORCHESTRATION_FAILED" });
  });

  it("treats a redirect status without Location as a final response", async () => {
    const transport = transportSequence([
      { ok: true, response: response(304) },
    ]);
    await expect(
      executeSafeHttpFlow(input(), resolver(), [], { now: clock, transport }),
    ).resolves.toMatchObject({ ok: true, stop_reason: "COMPLETE" });
  });
});
