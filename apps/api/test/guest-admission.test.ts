import { describe, expect, it } from "vitest";

import {
  decideGuestScanAdmission,
  GUEST_ABUSE_POLICY,
} from "../src/guest-abuse/index.js";
import type { GuestResultTokenMetadata } from "../src/guest-crypto/index.js";
import {
  GUEST_IDEMPOTENCY_WINDOW_SECONDS,
  GUEST_SCAN_ENDPOINT_OPERATION,
  type GuestIdempotencyRecord,
} from "../src/guest-idempotency/index.js";

const NOW = 1_800_000_000n;
const KEY = Buffer.alloc(32, 0x71);
const SCOPE = `sha256:${"1".repeat(64)}`;
const REQUEST_HASH = `sha256:${"2".repeat(64)}`;

function idempotencyRequest(overrides: Record<string, unknown> = {}) {
  return {
    guest_session_scope: SCOPE,
    idempotency_key: "request-01",
    request_hash: REQUEST_HASH,
    now_unix_seconds: NOW,
    ...overrides,
  };
}

function tokenMetadata(
  createdAt = NOW,
  overrides: Partial<GuestResultTokenMetadata> = {},
): GuestResultTokenMetadata {
  return {
    guest_scan_id: "guest_scan_01",
    token_version: 1n,
    token_nonce: Buffer.alloc(32, 0x72),
    key_version: 4,
    result_access_expires_at_unix_seconds:
      createdAt + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
    result_access_revoked_at_unix_seconds: null,
    ...overrides,
  };
}

function record(createdAt = NOW): GuestIdempotencyRecord {
  return {
    principal_scope: `GUEST_SESSION:${SCOPE}`,
    endpoint_operation: GUEST_SCAN_ENDPOINT_OPERATION,
    idempotency_key: "request-01",
    request_hash: REQUEST_HASH,
    created_at_unix_seconds: createdAt,
    idempotency_expires_at_unix_seconds:
      createdAt + GUEST_IDEMPOTENCY_WINDOW_SECONDS,
    token_metadata: tokenMetadata(createdAt),
  };
}

function abuse(overrides: Record<string, unknown> = {}) {
  return {
    guest_session_scope: SCOPE,
    network_signal_digest: `hmac-sha256:${"3".repeat(64)}`,
    now_unix_seconds: NOW,
    service_state: "OPEN",
    usage: {
      session_burst: { count: 0, reset_at_unix_seconds: NOW + 600n },
      session_daily: { count: 0, reset_at_unix_seconds: NOW + 86_400n },
      network_burst: { count: 0, reset_at_unix_seconds: NOW + 600n },
      network_daily: { count: 0, reset_at_unix_seconds: NOW + 86_400n },
      session_active: 0,
      network_active: 0,
    },
    ...overrides,
  };
}

describe("Guest scan idempotency plus abuse admission", () => {
  it("allows CREATE only with a complete abuse reservation", () => {
    expect(
      decideGuestScanAdmission(idempotencyRequest(), null, new Map(), abuse()),
    ).toMatchObject({
      ok: true,
      action: "CREATE",
      abuse_reservation: { policy_id: GUEST_ABUSE_POLICY.policy_id },
    });
  });

  it("returns a live replay without reading or consuming abuse state", () => {
    const hostileAbuse = {};
    Object.defineProperty(hostileAbuse, "usage", {
      enumerable: true,
      get: () => {
        throw new Error("must not read");
      },
    });
    expect(
      decideGuestScanAdmission(
        idempotencyRequest({ now_unix_seconds: NOW + 10n }),
        record(),
        new Map([[4, KEY]]),
        hostileAbuse,
      ),
    ).toMatchObject({
      ok: true,
      action: "REPLAY",
      guest_scan_id: "guest_scan_01",
      result_token_expires_in_seconds: 1_790,
    });
  });

  it("applies current abuse policy to an expired-row replacement", () => {
    const createdAt = NOW - GUEST_IDEMPOTENCY_WINDOW_SECONDS;
    const saturated = abuse({
      usage: {
        ...abuse().usage,
        session_burst: {
          count: GUEST_ABUSE_POLICY.session_burst_limit,
          reset_at_unix_seconds: NOW + 60n,
        },
      },
    });
    expect(
      decideGuestScanAdmission(
        idempotencyRequest(),
        record(createdAt),
        new Map(),
        saturated,
      ),
    ).toEqual({
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: "SESSION_BURST_LIMIT",
      retry_after_seconds: 60,
    });
  });

  it("returns idempotency conflict before consulting abuse state", () => {
    expect(
      decideGuestScanAdmission(
        idempotencyRequest({ request_hash: `sha256:${"9".repeat(64)}` }),
        record(),
        new Map([[4, KEY]]),
        null,
      ),
    ).toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("fails closed when new-scan abuse state is invalid", () => {
    expect(
      decideGuestScanAdmission(idempotencyRequest(), null, new Map(), {
        ...abuse(),
        raw_ip: "192.0.2.1",
      }),
    ).toEqual({ ok: false, code: "INVALID_ABUSE_CONTEXT" });
  });

  it("binds a new-scan reservation to the same session and clock", () => {
    for (const context of [
      abuse({ guest_session_scope: `sha256:${"8".repeat(64)}` }),
      abuse({ now_unix_seconds: NOW + 1n }),
    ]) {
      expect(
        decideGuestScanAdmission(
          idempotencyRequest(),
          null,
          new Map(),
          context,
        ),
      ).toEqual({ ok: false, code: "INVALID_ABUSE_CONTEXT" });
    }
  });
});
