import { describe, expect, it } from "vitest";

import {
  deriveGuestResultToken,
  type GuestResultTokenMetadata,
} from "../src/guest-crypto/index.js";
import {
  decideGuestScanIdempotency,
  GUEST_IDEMPOTENCY_WINDOW_SECONDS,
  GUEST_SCAN_ENDPOINT_OPERATION,
  type GuestIdempotencyRecord,
} from "../src/guest-idempotency/index.js";

const NOW = 1_700_000_000n;
const KEY = Buffer.alloc(32, 0x44);
const SCOPE = `sha256:${"1".repeat(64)}`;
const REQUEST_HASH = `sha256:${"2".repeat(64)}`;

function request(overrides: Record<string, unknown> = {}) {
  return {
    guest_session_scope: SCOPE,
    idempotency_key: "request-01",
    request_hash: REQUEST_HASH,
    now_unix_seconds: NOW,
    ...overrides,
  };
}

function tokenMetadata(
  overrides: Partial<GuestResultTokenMetadata> = {},
): GuestResultTokenMetadata {
  return {
    guest_scan_id: "guest_scan_01",
    token_version: 1n,
    token_nonce: Buffer.alloc(32, 0x55),
    key_version: 4,
    result_access_expires_at_unix_seconds:
      NOW + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
    result_access_revoked_at_unix_seconds: null,
    ...overrides,
  };
}

function record(
  overrides: Record<string, unknown> = {},
): GuestIdempotencyRecord {
  return {
    principal_scope: `GUEST_SESSION:${SCOPE}`,
    endpoint_operation: GUEST_SCAN_ENDPOINT_OPERATION,
    idempotency_key: "request-01",
    request_hash: REQUEST_HASH,
    created_at_unix_seconds: NOW,
    idempotency_expires_at_unix_seconds: NOW + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
    token_metadata: tokenMetadata(),
    ...overrides,
  } as GuestIdempotencyRecord;
}

describe("Guest scan idempotency decision", () => {
  it("creates a 30-minute window scoped only by authenticated Guest session", () => {
    expect(decideGuestScanIdempotency(request(), null, new Map())).toEqual({
      ok: true,
      action: "CREATE",
      lookup: {
        principal_scope: `GUEST_SESSION:${SCOPE}`,
        endpoint_operation: GUEST_SCAN_ENDPOINT_OPERATION,
        idempotency_key: "request-01",
      },
      request_hash: REQUEST_HASH,
      idempotency_expires_at_unix_seconds:
        NOW + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
    });
  });

  it("replays the original scan and deterministic token without extending expiry", () => {
    const now = NOW + 600n;
    const existing = record();
    const result = decideGuestScanIdempotency(
      request({ now_unix_seconds: now }),
      existing,
      new Map([[4, KEY]]),
    );
    expect(result).toEqual({
      ok: true,
      action: "REPLAY",
      guest_scan_id: "guest_scan_01",
      result_token: deriveGuestResultToken(existing.token_metadata, KEY),
      result_access_expires_at_unix_seconds:
        NOW + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
      result_token_expires_in_seconds: 1_200,
    });
  });

  it("conflicts on the same live key with a different request hash", () => {
    expect(
      decideGuestScanIdempotency(
        request({ request_hash: `sha256:${"3".repeat(64)}` }),
        record(),
        new Map([[4, KEY]]),
      ),
    ).toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("replaces the prior row at the exact expiry boundary", () => {
    expect(
      decideGuestScanIdempotency(
        request({
          now_unix_seconds: NOW + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
          request_hash: `sha256:${"3".repeat(64)}`,
        }),
        record({
          token_metadata: tokenMetadata({
            result_access_revoked_at_unix_seconds: NOW + 10n,
          }),
        }),
        new Map(),
      ),
    ).toMatchObject({
      ok: true,
      action: "REPLACE_EXPIRED",
      idempotency_expires_at_unix_seconds:
        NOW + 2n * GUEST_IDEMPOTENCY_WINDOW_SECONDS,
    });
  });

  it("blocks replay after explicit result-access revocation", () => {
    expect(
      decideGuestScanIdempotency(
        request(),
        record({
          token_metadata: tokenMetadata({
            result_access_revoked_at_unix_seconds: NOW,
          }),
        }),
        new Map([[4, KEY]]),
      ),
    ).toEqual({ ok: false, code: "RESULT_ACCESS_REVOKED" });
  });

  it("keeps retired keys replayable and fails closed after invalidation", () => {
    const rotated = new Map([
      [4, KEY],
      [5, Buffer.alloc(32, 0x66)],
    ]);
    expect(
      decideGuestScanIdempotency(request(), record(), rotated),
    ).toMatchObject({
      ok: true,
      action: "REPLAY",
    });
    rotated.delete(4);
    expect(decideGuestScanIdempotency(request(), record(), rotated)).toEqual({
      ok: false,
      code: "RESULT_TOKEN_UNAVAILABLE",
    });
  });

  it("uses the same decision after a concurrent unique-key winner is read", () => {
    const winner = record();
    expect(
      decideGuestScanIdempotency(request(), winner, new Map([[4, KEY]])),
    ).toMatchObject({ ok: true, action: "REPLAY" });
    expect(
      decideGuestScanIdempotency(
        request({ request_hash: `sha256:${"3".repeat(64)}` }),
        winner,
        new Map([[4, KEY]]),
      ),
    ).toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("cannot replay a record from another Guest-session scope", () => {
    const otherScope = `sha256:${"9".repeat(64)}`;
    expect(
      decideGuestScanIdempotency(
        request({ guest_session_scope: otherScope }),
        record(),
        new Map([[4, KEY]]),
      ),
    ).toEqual({ ok: false, code: "INVALID_RECORD" });
    expect(
      decideGuestScanIdempotency(
        request({ guest_session_scope: otherScope }),
        null,
        new Map(),
      ),
    ).toMatchObject({
      ok: true,
      action: "CREATE",
      lookup: { principal_scope: `GUEST_SESSION:${otherScope}` },
    });
  });

  it.each([
    { guest_session_scope: "sha256:ABC" },
    { idempotency_key: "" },
    { idempotency_key: "contains space" },
    { idempotency_key: "a".repeat(129) },
    { request_hash: "not-a-hash" },
    { now_unix_seconds: -1n },
    { now_unix_seconds: 0x1_0000_0000_0000_0000n },
    { extra: true },
  ])("rejects malformed current request input", (override) => {
    expect(
      decideGuestScanIdempotency(request(override), null, new Map()),
    ).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it.each([
    { endpoint_operation: "POST:/wrong" },
    { principal_scope: "GUEST_SESSION:invalid" },
    { request_hash: "invalid" },
    { created_at_unix_seconds: NOW + 1n },
    { idempotency_expires_at_unix_seconds: NOW + 1_799n },
    {
      token_metadata: tokenMetadata({
        result_access_expires_at_unix_seconds: NOW + 1_799n,
      }),
    },
    { token_metadata: { ...tokenMetadata(), token_nonce: Buffer.alloc(31) } },
    { extra: true },
  ])("rejects malformed or inconsistent stored records", (override) => {
    expect(
      decideGuestScanIdempotency(
        request(),
        record(override),
        new Map([[4, KEY]]),
      ),
    ).toEqual({ ok: false, code: "INVALID_RECORD" });
  });

  it("contains hostile records and keyrings without leaking details", () => {
    const hostile = record();
    Object.defineProperty(hostile, "request_hash", {
      enumerable: true,
      get: () => {
        throw new Error("stored secret");
      },
    });
    expect(decideGuestScanIdempotency(request(), hostile, new Map())).toEqual({
      ok: false,
      code: "INVALID_RECORD",
    });
    const keyring = {
      get: () => {
        throw new Error("key detail");
      },
    } as unknown as ReadonlyMap<number, Uint8Array>;
    expect(decideGuestScanIdempotency(request(), record(), keyring)).toEqual({
      ok: false,
      code: "RESULT_TOKEN_UNAVAILABLE",
    });
  });

  it("snapshots changing request and record getters exactly once", () => {
    let requestReads = 0;
    const unstableRequest = request();
    Object.defineProperty(unstableRequest, "request_hash", {
      enumerable: true,
      get: () => (++requestReads === 1 ? REQUEST_HASH : "invalid"),
    });
    expect(
      decideGuestScanIdempotency(unstableRequest, null, new Map()),
    ).toMatchObject({ ok: true, action: "CREATE", request_hash: REQUEST_HASH });
    expect(requestReads).toBe(1);

    let recordReads = 0;
    const unstableRecord = record();
    Object.defineProperty(unstableRecord, "request_hash", {
      enumerable: true,
      get: () => (++recordReads === 1 ? REQUEST_HASH : "invalid"),
    });
    expect(
      decideGuestScanIdempotency(
        request(),
        unstableRecord,
        new Map([[4, KEY]]),
      ),
    ).toMatchObject({ ok: true, action: "REPLAY" });
    expect(recordReads).toBe(1);
  });

  it("rejects a create window that would overflow U64", () => {
    expect(
      decideGuestScanIdempotency(
        request({ now_unix_seconds: 0xffff_ffff_ffff_ffffn }),
        null,
        new Map(),
      ),
    ).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });
});
