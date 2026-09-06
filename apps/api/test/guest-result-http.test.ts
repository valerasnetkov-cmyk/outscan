import { describe, expect, it } from "vitest";

import {
  authorizeGuestResultAccess,
  deriveGuestResultToken,
  GUEST_RESULT_SECURITY_HEADERS,
  type GuestResultTokenMetadata,
} from "../src/guest-crypto/index.js";

const NOW = 1_700_000_000n;
const KEY = Buffer.alloc(32, 0x22);

function metadata(
  overrides: Partial<GuestResultTokenMetadata> = {},
): GuestResultTokenMetadata {
  return {
    guest_scan_id: "guest_scan_01",
    token_version: 3n,
    token_nonce: Buffer.alloc(32, 0x33),
    key_version: 9,
    result_access_expires_at_unix_seconds: NOW + 1_800n,
    result_access_revoked_at_unix_seconds: null,
    ...overrides,
  };
}

function request(
  token = deriveGuestResultToken(metadata(), KEY),
  overrides: Record<string, unknown> = {},
) {
  return {
    authorization_header: `Bearer ${token}`,
    route_guest_scan_id: "guest_scan_01",
    query: {},
    now_unix_seconds: NOW,
    ...overrides,
  };
}

describe("Guest result HTTP authorization boundary", () => {
  it("authorizes a bound bearer token and returns mandatory privacy headers", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    const result = authorizeGuestResultAccess(
      request(token),
      metadata(),
      new Map([[9, KEY]]),
    );
    expect(result).toEqual({
      ok: true,
      access: {
        guest_scan_id: "guest_scan_01",
        result_access_expires_at_unix_seconds: NOW + 1_800n,
        result_token_expires_in_seconds: 1_800,
        response_headers: {
          "cache-control": "no-store",
          "referrer-policy": "no-referrer",
        },
      },
    });
    expect(result).not.toHaveProperty("access.result_token");
    expect(Object.isFrozen(GUEST_RESULT_SECURITY_HEADERS)).toBe(true);
    if (!result.ok) throw new Error("Expected result access.");
    expect(Object.isFrozen(result.access)).toBe(true);
  });

  it("accepts the case-insensitive Bearer scheme with one exact space", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    expect(
      authorizeGuestResultAccess(
        request(token, { authorization_header: `bearer ${token}` }),
        metadata(),
        new Map([[9, KEY]]),
      ),
    ).toMatchObject({ ok: true });
  });

  it.each([
    undefined,
    ["Bearer one", "Bearer two"],
    "",
    "Basic abc",
    "Bearer  token",
    `Bearer\t${"A".repeat(43)}`,
    `Bearer ${"A".repeat(43)} extra`,
    `Bearer ${"A".repeat(43)}=`,
    `Bearer ${"A".repeat(129)}`,
  ])("collapses malformed authorization %s to one denial", (authorization) => {
    expect(
      authorizeGuestResultAccess(
        request(undefined, { authorization_header: authorization }),
        metadata(),
        new Map([[9, KEY]]),
      ),
    ).toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
  });

  it.each([
    { resultToken: "secret" },
    { token: "secret" },
    { unrelated: "value" },
  ])(
    "rejects every query parameter, including URL token transport",
    (query) => {
      expect(
        authorizeGuestResultAccess(
          request(undefined, { query }),
          metadata(),
          new Map([[9, KEY]]),
        ),
      ).toEqual({ ok: false, code: "INVALID_RESULT_REQUEST" });
    },
  );

  it("requires a plain empty query object", () => {
    for (const query of [new Map(), [], null, new Date()]) {
      expect(
        authorizeGuestResultAccess(
          request(undefined, { query }),
          metadata(),
          new Map([[9, KEY]]),
        ),
      ).toEqual({ ok: false, code: "INVALID_RESULT_REQUEST" });
    }
    expect(
      authorizeGuestResultAccess(
        request(undefined, { query: Object.create(null) }),
        metadata(),
        new Map([[9, KEY]]),
      ),
    ).toMatchObject({ ok: true });
  });

  it("binds access to the route GuestScan identifier", () => {
    expect(
      authorizeGuestResultAccess(
        request(undefined, { route_guest_scan_id: "guest_scan_02" }),
        metadata(),
        new Map([[9, KEY]]),
      ),
    ).toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
  });

  it.each([
    [{ result_access_expires_at_unix_seconds: NOW }, new Map([[9, KEY]])],
    [{ result_access_revoked_at_unix_seconds: NOW - 1n }, new Map([[9, KEY]])],
    [{}, new Map<number, Uint8Array>()],
    [
      { result_access_expires_at_unix_seconds: NOW + 1_801n },
      new Map([[9, KEY]]),
    ],
  ])(
    "uses the same denial for expiry, revoke, key loss and invalid window",
    (change, keyring) => {
      const stored = metadata(change);
      const token = deriveGuestResultToken(
        metadata({
          result_access_expires_at_unix_seconds:
            stored.result_access_expires_at_unix_seconds,
        }),
        KEY,
      );
      expect(
        authorizeGuestResultAccess(request(token), stored, keyring),
      ).toEqual({
        ok: false,
        code: "RESULT_ACCESS_DENIED",
      });
    },
  );

  it("rejects a validly shaped but tampered token", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    expect(
      authorizeGuestResultAccess(
        request(tampered),
        metadata(),
        new Map([[9, KEY]]),
      ),
    ).toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
  });

  it("supports a retained rotation key and denies after emergency removal", () => {
    const rotated = new Map([
      [9, KEY],
      [10, Buffer.alloc(32, 0x44)],
    ]);
    expect(
      authorizeGuestResultAccess(request(), metadata(), rotated),
    ).toMatchObject({ ok: true });
    rotated.delete(9);
    expect(authorizeGuestResultAccess(request(), metadata(), rotated)).toEqual({
      ok: false,
      code: "RESULT_ACCESS_DENIED",
    });
  });

  it("contains hostile metadata and keyring implementations", () => {
    const hostile = metadata();
    Object.defineProperty(hostile, "guest_scan_id", {
      enumerable: true,
      get: () => {
        throw new Error("stored detail");
      },
    });
    expect(
      authorizeGuestResultAccess(request(), hostile, new Map([[9, KEY]])),
    ).toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });

    const keyring = {
      get: () => {
        throw new Error("secret keyring detail");
      },
    } as unknown as ReadonlyMap<number, Uint8Array>;
    expect(authorizeGuestResultAccess(request(), metadata(), keyring)).toEqual({
      ok: false,
      code: "RESULT_ACCESS_DENIED",
    });
  });

  it.each([
    { route_guest_scan_id: "" },
    { route_guest_scan_id: "x".repeat(513) },
    { now_unix_seconds: -1n },
    { now_unix_seconds: 0x1_0000_0000_0000_0000n },
    { extra: true },
  ])("rejects malformed request envelopes", (override) => {
    expect(
      authorizeGuestResultAccess(
        request(undefined, override),
        metadata(),
        new Map([[9, KEY]]),
      ),
    ).toEqual({ ok: false, code: "INVALID_RESULT_REQUEST" });
  });
});
