import { describe, expect, it, vi } from "vitest";

import {
  type DnsAddressResolver,
  IP_DESTINATION_POLICY_VERSION,
  resolveAndClassifyHostname,
} from "../src/target/index.js";

function dnsError(code: string): Error & { code: string } {
  return Object.assign(new Error("redacted DNS failure"), { code });
}

function resolver(
  ipv4: unknown | Error,
  ipv6: unknown | Error,
): DnsAddressResolver {
  return {
    resolve4: vi.fn(async () => {
      if (ipv4 instanceof Error) throw ipv4;
      return ipv4;
    }),
    resolve6: vi.fn(async () => {
      if (ipv6 instanceof Error) throw ipv6;
      return ipv6;
    }),
  };
}

const NO_DATA = dnsError("ENODATA");
const NOW_UNIX_MS = 1_700_000_000_000;

describe("A/AAAA resolver boundary", () => {
  it("combines both families, applies minimum TTL and freezes the result", async () => {
    const client = resolver(
      [
        { address: "8.8.8.8", ttl: 300 },
        { address: "8.8.8.8", ttl: 120 },
      ],
      [{ address: "2001:4860:4860:0:0:0:0:8888", ttl: 180 }],
    );

    const result = await resolveAndClassifyHostname(
      "example.com",
      client,
      [],
      NOW_UNIX_MS,
    );

    expect(result).toEqual({
      ok: true,
      target: {
        canonical_host: "example.com",
        policy_version: IP_DESTINATION_POLICY_VERSION,
        minimum_ttl_seconds: 120,
        resolved_at_unix_ms: NOW_UNIX_MS,
        expires_at_unix_ms: NOW_UNIX_MS + 120_000,
        addresses: [
          { address: "8.8.8.8", family: 4 },
          { address: "2001:4860:4860::8888", family: 6 },
        ],
      },
    });
    if (!result.ok) throw new Error("Expected a resolved target.");
    expect(Object.isFrozen(result.target)).toBe(true);
    expect(Object.isFrozen(result.target.addresses)).toBe(true);
    expect(Object.isFrozen(result.target.addresses[0])).toBe(true);
    expect(client.resolve4).toHaveBeenCalledWith("example.com", { ttl: true });
    expect(client.resolve6).toHaveBeenCalledWith("example.com", { ttl: true });
  });

  it("allows one address family to have no data", async () => {
    await expect(
      resolveAndClassifyHostname(
        "example.com",
        resolver([{ address: "1.1.1.1", ttl: 60 }], NO_DATA),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("starts both family queries before waiting for either result", async () => {
    const calls: string[] = [];
    let releaseIpv4: ((value: unknown) => void) | undefined;
    let releaseIpv6: ((value: unknown) => void) | undefined;
    const client: DnsAddressResolver = {
      resolve4: async () => {
        calls.push("A");
        return await new Promise((resolve) => {
          releaseIpv4 = resolve;
        });
      },
      resolve6: async () => {
        calls.push("AAAA");
        return await new Promise((resolve) => {
          releaseIpv6 = resolve;
        });
      },
    };

    const pending = resolveAndClassifyHostname("example.com", client);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["A", "AAAA"]);
    releaseIpv4?.([{ address: "8.8.8.8", ttl: 60 }]);
    releaseIpv6?.([]);
    await expect(pending).resolves.toMatchObject({ ok: true });
  });

  it("does not query DNS for non-canonical host input", async () => {
    const client = resolver([], []);
    await expect(
      resolveAndClassifyHostname("Example.COM.", client),
    ).resolves.toEqual({ ok: false, code: "INVALID_CANONICAL_HOST" });
    expect(client.resolve4).not.toHaveBeenCalled();
    expect(client.resolve6).not.toHaveBeenCalled();
  });

  it("rejects invalid resolution time before querying DNS", async () => {
    for (const now of [-1, 1.5, Number.NaN]) {
      const client = resolver([], []);
      await expect(
        resolveAndClassifyHostname("example.com", client, [], now),
      ).resolves.toEqual({ ok: false, code: "INVALID_RESOLUTION_TIME" });
      expect(client.resolve4).not.toHaveBeenCalled();
      expect(client.resolve6).not.toHaveBeenCalled();
    }
  });

  it("fails closed when TTL expiry would exceed safe integer time", async () => {
    const client = resolver([{ address: "8.8.8.8", ttl: 1 }], NO_DATA);
    await expect(
      resolveAndClassifyHostname(
        "example.com",
        client,
        [],
        Number.MAX_SAFE_INTEGER,
      ),
    ).resolves.toEqual({ ok: false, code: "INVALID_RESOLUTION_TIME" });
  });

  it.each([
    [dnsError("ETIMEOUT"), NO_DATA],
    [dnsError("ESERVFAIL"), [{ address: "8.8.8.8", ttl: 60 }]],
    [dnsError("EREFUSED"), dnsError("EREFUSED")],
  ])("fails closed for operational DNS errors", async (ipv4, ipv6) => {
    await expect(
      resolveAndClassifyHostname("example.com", resolver(ipv4, ipv6)),
    ).resolves.toEqual({ ok: false, code: "DNS_LOOKUP_FAILED" });
  });

  it("distinguishes not-found from inconsistent family answers", async () => {
    await expect(
      resolveAndClassifyHostname(
        "example.com",
        resolver(dnsError("ENOTFOUND"), NO_DATA),
      ),
    ).resolves.toEqual({ ok: false, code: "HOST_NOT_FOUND" });
    await expect(
      resolveAndClassifyHostname(
        "example.com",
        resolver(dnsError("ENOTFOUND"), []),
      ),
    ).resolves.toEqual({ ok: false, code: "HOST_NOT_FOUND" });
    await expect(
      resolveAndClassifyHostname(
        "example.com",
        resolver(dnsError("ENOTFOUND"), [
          { address: "2001:4860:4860::8888", ttl: 60 },
        ]),
      ),
    ).resolves.toEqual({
      ok: false,
      code: "INCONSISTENT_DNS_RESPONSE",
    });
  });

  it("validates a fulfilled family payload before NXDOMAIN reconciliation", async () => {
    await expect(
      resolveAndClassifyHostname(
        "example.com",
        resolver(dnsError("ENOTFOUND"), "malformed"),
      ),
    ).resolves.toEqual({ ok: false, code: "INVALID_DNS_RESPONSE" });
  });

  it("rejects an empty combined result", async () => {
    await expect(
      resolveAndClassifyHostname("example.com", resolver([], NO_DATA)),
    ).resolves.toEqual({ ok: false, code: "NO_ADDRESS_RECORDS" });
  });

  it.each([
    ["non-array", []],
    [[{ address: "8.8.8.8", ttl: -1 }], []],
    [[{ address: "8.8.8.8", ttl: 0x1_0000_0000 }], []],
    [[{ address: "8.8.8.8", ttl: 1, extra: true }], []],
    [[{ address: "2001:4860:4860::8888", ttl: 1 }], []],
    [[], [{ address: "8.8.8.8", ttl: 1 }]],
    [new Array(1), []],
    [Array(65).fill({ address: "8.8.8.8", ttl: 1 }), []],
  ])("rejects malformed resolver output", async (ipv4, ipv6) => {
    await expect(
      resolveAndClassifyHostname("example.com", resolver(ipv4, ipv6)),
    ).resolves.toEqual({ ok: false, code: "INVALID_DNS_RESPONSE" });
  });

  it("passes the entire mixed set through destination policy", async () => {
    const result = await resolveAndClassifyHostname(
      "example.com",
      resolver(
        [
          { address: "8.8.8.8", ttl: 60 },
          { address: "10.0.0.1", ttl: 60 },
        ],
        NO_DATA,
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      code: "DESTINATION_POLICY_REJECTED",
      policy_decision: {
        code: "FORBIDDEN_ADDRESS",
        blocked_addresses: [{ address: "10.0.0.1", reason: "PRIVATE" }],
      },
    });
  });

  it("fails closed when configured internal CIDRs are invalid or matched", async () => {
    const client = resolver([{ address: "8.8.8.8", ttl: 60 }], NO_DATA);
    await expect(
      resolveAndClassifyHostname("example.com", client, "invalid"),
    ).resolves.toMatchObject({
      code: "DESTINATION_POLICY_REJECTED",
      policy_decision: { code: "INVALID_INTERNAL_RANGE" },
    });
    await expect(
      resolveAndClassifyHostname("example.com", client, ["8.8.8.0/24"]),
    ).resolves.toMatchObject({
      code: "DESTINATION_POLICY_REJECTED",
      policy_decision: { code: "FORBIDDEN_ADDRESS" },
    });
  });

  it("redacts hostile error details from the decision", async () => {
    const hostile = Object.assign(new Error("secret resolver detail"), {
      code: "ESERVFAIL",
      secret: "must-not-escape",
    });
    const result = await resolveAndClassifyHostname(
      "example.com",
      resolver(hostile, NO_DATA),
    );

    expect(result).toEqual({ ok: false, code: "DNS_LOOKUP_FAILED" });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
