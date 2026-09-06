import type { LookupAddress, LookupOptions } from "node:dns";
import type { DetailedPeerCertificate } from "node:tls";
import { describe, expect, it } from "vitest";

import {
  createPinnedRequestOptions,
  IP_DESTINATION_POLICY_VERSION,
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
    addresses: [
      { address: "8.8.8.8", family: 4 },
      { address: "2001:4860:4860::8888", family: 6 },
    ],
    ...overrides,
  } as ResolvedTarget;
}

function spec(overrides: Record<string, unknown> = {}) {
  return {
    protocol: "https:",
    method: "GET",
    path: "/status?probe=tls",
    pinned_address: "8.8.8.8",
    now_unix_ms: RESOLVED_AT + 1_000,
    ...overrides,
  };
}

describe("pinned HTTP/TLS request options", () => {
  it("pins lookup while preserving Host, SNI and certificate verification", () => {
    const result = createPinnedRequestOptions(target(), spec());
    expect(result).toMatchObject({
      ok: true,
      options: {
        protocol: "https:",
        hostname: "example.com",
        host: "example.com",
        port: 443,
        method: "GET",
        path: "/status?probe=tls",
        headers: {
          host: "example.com",
          connection: "close",
        },
        family: 4,
        agent: false,
        insecureHTTPParser: false,
        rejectUnauthorized: true,
        servername: "example.com",
      },
    });
    if (!result.ok) throw new Error("Expected pinned options.");
    expect(Object.isFrozen(result.options)).toBe(true);
    expect(Object.isFrozen(result.options.headers)).toBe(true);
  });

  it("returns only the pinned address from lookup", () => {
    const result = createPinnedRequestOptions(target(), spec());
    if (!result.ok || !result.options.lookup) {
      throw new Error("Expected pinned lookup.");
    }
    const single: unknown[][] = [];
    result.options.lookup(
      "example.com",
      { family: 4, all: false } as LookupOptions,
      (...values) => single.push(values),
    );
    expect(single).toEqual([[null, "8.8.8.8", 4]]);

    const all: unknown[][] = [];
    result.options.lookup(
      "example.com",
      { family: 4, all: true } as LookupOptions,
      (...values) => all.push(values),
    );
    expect(all).toEqual([
      [null, [{ address: "8.8.8.8", family: 4 } as LookupAddress]],
    ]);
  });

  it("rejects lookup substitution and family changes", () => {
    const result = createPinnedRequestOptions(target(), spec());
    if (!result.ok || !result.options.lookup) {
      throw new Error("Expected pinned lookup.");
    }
    for (const [hostname, family] of [
      ["attacker.example", 4],
      ["example.com", 6],
    ] as const) {
      const calls: unknown[][] = [];
      result.options.lookup(
        hostname,
        { family, all: false } as LookupOptions,
        (...values) => calls.push(values),
      );
      expect(calls[0]?.[0]).toMatchObject({ code: "EPERM" });
    }
  });

  it("verifies HTTPS certificates against canonical host, not callback input", () => {
    const result = createPinnedRequestOptions(target(), spec());
    if (!result.ok || !result.options.checkServerIdentity) {
      throw new Error("Expected TLS verifier.");
    }
    const matching = {
      subjectaltname: "DNS:example.com",
    } as DetailedPeerCertificate;
    const mismatching = {
      subjectaltname: "DNS:attacker.example",
    } as DetailedPeerCertificate;

    expect(
      result.options.checkServerIdentity("attacker.example", matching),
    ).toBeUndefined();
    expect(
      result.options.checkServerIdentity("example.com", mismatching),
    ).toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
  });

  it("builds HTTP options without TLS-only fields", () => {
    const result = createPinnedRequestOptions(
      target(),
      spec({ protocol: "http:", method: "HEAD" }),
    );
    expect(result).toMatchObject({
      ok: true,
      options: { protocol: "http:", port: 80, method: "HEAD" },
    });
    if (!result.ok) throw new Error("Expected HTTP options.");
    expect(result.options.servername).toBeUndefined();
    expect(result.options.checkServerIdentity).toBeUndefined();
  });

  it.each([
    ["/", true],
    ["/robots.txt?x=1", true],
    ["", false],
    ["relative", false],
    ["//attacker.example/path", false],
    ["/path#fragment", false],
    ["/back\\slash", false],
    ["/line\r\nbreak", false],
    [`/${"a".repeat(2_048)}`, false],
  ])("validates origin-form path %s", (path, accepted) => {
    expect(createPinnedRequestOptions(target(), spec({ path })).ok).toBe(
      accepted,
    );
  });

  it.each([
    { method: "POST" },
    { protocol: "ftp:" },
    { now_unix_ms: -1 },
    { pinned_address: 8 },
    { extra: true },
  ])("rejects malformed request spec", (override) => {
    expect(createPinnedRequestOptions(target(), spec(override))).toEqual({
      ok: false,
      code: "INVALID_REQUEST",
    });
  });

  it("rejects expired resolution at the exact boundary", () => {
    expect(
      createPinnedRequestOptions(
        target(),
        spec({ now_unix_ms: RESOLVED_AT + 60_000 }),
      ),
    ).toEqual({ ok: false, code: "STALE_RESOLUTION" });
  });

  it("rejects a request time before the resolution was created", () => {
    expect(
      createPinnedRequestOptions(
        target(),
        spec({ now_unix_ms: RESOLVED_AT - 1 }),
      ),
    ).toEqual({ ok: false, code: "INVALID_TARGET" });
  });

  it("rejects a pin outside the approved set", () => {
    expect(
      createPinnedRequestOptions(target(), spec({ pinned_address: "1.1.1.1" })),
    ).toEqual({ ok: false, code: "PIN_NOT_APPROVED" });
  });

  it("revalidates destination policy including configured internal CIDRs", () => {
    expect(
      createPinnedRequestOptions(target(), spec(), ["8.8.8.0/24"]),
    ).toEqual({ ok: false, code: "DESTINATION_POLICY_REJECTED" });
    expect(
      createPinnedRequestOptions(
        target({ addresses: [{ address: "10.0.0.1", family: 4 }] }),
        spec({ pinned_address: "10.0.0.1" }),
      ),
    ).toEqual({ ok: false, code: "DESTINATION_POLICY_REJECTED" });
  });

  it.each([
    { policy_version: "old-policy" },
    { canonical_host: "Example.COM" },
    { minimum_ttl_seconds: -1 },
    { resolved_at_unix_ms: -1 },
    { expires_at_unix_ms: RESOLVED_AT + 59_999 },
    { addresses: [] },
    {
      addresses: [{ address: "8.8.8.8", family: 6 }],
    },
    { extra: true },
  ])("rejects malformed or forged resolved targets", (override) => {
    expect(createPinnedRequestOptions(target(override), spec())).toEqual({
      ok: false,
      code: "INVALID_TARGET",
    });
  });
});
