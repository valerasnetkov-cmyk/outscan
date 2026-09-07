import { describe, expect, it } from "vitest";

import {
  decideGuestAbuseAdmission,
  decideGuestRetention,
  GUEST_ABUSE_POLICY,
  GUEST_RETENTION_MAX_SECONDS,
} from "../src/guest-abuse/index.js";

const NOW = 1_800_000_000n;
const SCOPE = `sha256:${"1".repeat(64)}`;
const NETWORK = `hmac-sha256:${"2".repeat(64)}`;

function window(count = 0, seconds = 600n) {
  return { count, reset_at_unix_seconds: NOW + seconds };
}

function usage(overrides: Record<string, unknown> = {}) {
  return {
    session_burst: window(0, 600n),
    session_daily: window(0, 86_400n),
    network_burst: window(0, 600n),
    network_daily: window(0, 86_400n),
    session_active: 0,
    network_active: 0,
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    guest_session_scope: SCOPE,
    network_signal_digest: NETWORK,
    now_unix_seconds: NOW,
    service_state: "OPEN",
    usage: usage(),
    ...overrides,
  };
}

describe("Guest abuse admission policy", () => {
  it("returns the complete atomic reservation for a new scan", () => {
    const result = decideGuestAbuseAdmission(request());
    expect(result).toEqual({
      ok: true,
      action: "ALLOW_NEW_SCAN",
      reservation: {
        policy_id: "outscan-guest-abuse-v1",
        guest_session_scope: SCOPE,
        network_signal_digest: NETWORK,
        observed_at_unix_seconds: NOW,
        dimensions: [
          "SESSION_BURST",
          "SESSION_DAILY",
          "NETWORK_BURST",
          "NETWORK_DAILY",
          "SESSION_ACTIVE",
          "NETWORK_ACTIVE",
        ],
      },
    });
    if (!result.ok) throw new Error(result.code);
    expect(Object.isFrozen(result.reservation)).toBe(true);
    expect(Object.isFrozen(result.reservation.dimensions)).toBe(true);
  });

  it.each([
    [
      { session_active: GUEST_ABUSE_POLICY.session_concurrency_limit },
      "SESSION_CONCURRENCY_LIMIT",
      undefined,
    ],
    [
      {
        session_burst: window(GUEST_ABUSE_POLICY.session_burst_limit),
      },
      "SESSION_BURST_LIMIT",
      600,
    ],
    [
      {
        session_daily: window(GUEST_ABUSE_POLICY.session_daily_limit, 86_400n),
      },
      "SESSION_DAILY_LIMIT",
      86_400,
    ],
    [
      { network_active: GUEST_ABUSE_POLICY.network_concurrency_limit },
      "NETWORK_CONCURRENCY_LIMIT",
      undefined,
    ],
    [
      { network_burst: window(GUEST_ABUSE_POLICY.network_burst_limit) },
      "NETWORK_BURST_LIMIT",
      600,
    ],
    [
      {
        network_daily: window(GUEST_ABUSE_POLICY.network_daily_limit, 86_400n),
      },
      "NETWORK_DAILY_LIMIT",
      86_400,
    ],
  ])("denies saturated usage %#", (change, code, retry) => {
    expect(
      decideGuestAbuseAdmission(request({ usage: usage(change) })),
    ).toEqual({
      ok: false,
      code,
      ...(retry === undefined ? {} : { retry_after_seconds: retry }),
    });
  });

  it("denies a server-owned Guest pause independently of usage", () => {
    expect(
      decideGuestAbuseAdmission(request({ service_state: "PAUSED" })),
    ).toEqual({ ok: false, code: "GUEST_SCANNING_PAUSED" });
  });

  it.each([
    { guest_session_scope: "invalid" },
    { network_signal_digest: "192.0.2.1" },
    { now_unix_seconds: -1n },
    { now_unix_seconds: 0x1_0000_0000_0000_0000n },
    { service_state: "DEGRADED" },
    { raw_ip: "192.0.2.1" },
    { user_agent: "browser" },
    { usage: usage({ session_active: -1 }) },
    { usage: usage({ network_active: 1.5 }) },
    { usage: usage({ session_burst: window(0, 0n) }) },
    { usage: usage({ session_burst: window(0, 601n) }) },
    { usage: { ...usage(), extra: true } },
  ])("rejects malformed or privacy-expanding context %#", (change) => {
    expect(decideGuestAbuseAdmission(request(change))).toEqual({
      ok: false,
      code: "INVALID_ABUSE_CONTEXT",
    });
  });

  it("contains throwing and changing usage getters", () => {
    const changing = usage();
    let reads = 0;
    Object.defineProperty(changing, "session_active", {
      enumerable: true,
      get: () => (++reads === 1 ? 0 : 100),
    });
    expect(
      decideGuestAbuseAdmission(request({ usage: changing })),
    ).toMatchObject({ ok: true });
    expect(reads).toBe(1);

    const hostile = request();
    Object.defineProperty(hostile, "usage", {
      enumerable: true,
      get: () => {
        throw new Error("storage detail");
      },
    });
    expect(decideGuestAbuseAdmission(hostile)).toEqual({
      ok: false,
      code: "INVALID_ABUSE_CONTEXT",
    });
  });
});

function retentionRecord(overrides: Record<string, unknown> = {}) {
  return {
    guest_scan_id: "guest_scan_01",
    created_at_unix_seconds: NOW,
    result_access_expires_at_unix_seconds: NOW + 1_800n,
    deletion_deadline_unix_seconds: NOW + GUEST_RETENTION_MAX_SECONDS,
    ...overrides,
  };
}

describe("Guest 24-hour retention decision", () => {
  it("keeps only until the fixed deletion deadline", () => {
    expect(decideGuestRetention(retentionRecord(), NOW)).toEqual({
      ok: true,
      action: "KEEP",
      delete_in_seconds: 86_400,
    });
    expect(
      decideGuestRetention(
        retentionRecord(),
        NOW + GUEST_RETENTION_MAX_SECONDS - 1n,
      ),
    ).toEqual({ ok: true, action: "KEEP", delete_in_seconds: 1 });
  });

  it("requires deletion at and after the exact deadline", () => {
    for (const now of [
      NOW + GUEST_RETENTION_MAX_SECONDS,
      NOW + GUEST_RETENTION_MAX_SECONDS + 1n,
    ]) {
      expect(decideGuestRetention(retentionRecord(), now)).toEqual({
        ok: true,
        action: "DELETE_NOW",
      });
    }
  });

  it.each([
    { guest_scan_id: "bad id" },
    { created_at_unix_seconds: NOW + 1n },
    { result_access_expires_at_unix_seconds: NOW },
    {
      result_access_expires_at_unix_seconds:
        NOW + GUEST_RETENTION_MAX_SECONDS + 1n,
    },
    {
      deletion_deadline_unix_seconds: NOW + GUEST_RETENTION_MAX_SECONDS - 1n,
    },
    { extra: true },
  ])("rejects inconsistent retention metadata %#", (change) => {
    expect(decideGuestRetention(retentionRecord(change), NOW)).toEqual({
      ok: false,
      code: "INVALID_RETENTION_CONTEXT",
    });
  });

  it("contains hostile records and invalid clocks", () => {
    const hostile = retentionRecord();
    Object.defineProperty(hostile, "deletion_deadline_unix_seconds", {
      enumerable: true,
      get: () => {
        throw new Error("database detail");
      },
    });
    expect(decideGuestRetention(hostile, NOW)).toEqual({
      ok: false,
      code: "INVALID_RETENTION_CONTEXT",
    });
    expect(decideGuestRetention(retentionRecord(), -1n)).toEqual({
      ok: false,
      code: "INVALID_RETENTION_CONTEXT",
    });
  });
});
