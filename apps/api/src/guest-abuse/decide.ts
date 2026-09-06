import {
  GUEST_ABUSE_POLICY,
  GUEST_ABUSE_RESERVATION_DIMENSIONS,
  type GuestAbuseDecision,
  type GuestAbuseRequest,
  type GuestAbuseUsageSnapshot,
  type GuestAbuseWindowUsage,
} from "./model.js";

const REQUEST_KEYS = [
  "guest_session_scope",
  "network_signal_digest",
  "now_unix_seconds",
  "service_state",
  "usage",
] as const;
const USAGE_KEYS = [
  "session_burst",
  "session_daily",
  "network_burst",
  "network_daily",
  "session_active",
  "network_active",
] as const;
const WINDOW_KEYS = ["count", "reset_at_unix_seconds"] as const;
const SCOPE_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const NETWORK_PATTERN = /^hmac-sha256:[0-9a-f]{64}$/u;
const MAX_COUNTER_VALUE = 1_000_000;

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length &&
      actual.every((key) => typeof key === "string" && keys.includes(key))
    );
  } catch {
    return false;
  }
}

function counter(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_COUNTER_VALUE
  );
}

function windowUsage(
  value: unknown,
  now: bigint,
  maximumWindowSeconds: bigint,
): GuestAbuseWindowUsage | null {
  if (!exactRecord(value, WINDOW_KEYS)) return null;
  try {
    const count = value.count;
    const resetAt = value.reset_at_unix_seconds;
    if (
      !counter(count) ||
      typeof resetAt !== "bigint" ||
      resetAt <= now ||
      resetAt > now + maximumWindowSeconds
    ) {
      return null;
    }
    return Object.freeze({ count, reset_at_unix_seconds: resetAt });
  } catch {
    return null;
  }
}

function usageSnapshot(
  value: unknown,
  now: bigint,
): Readonly<GuestAbuseUsageSnapshot> | null {
  if (!exactRecord(value, USAGE_KEYS)) return null;
  try {
    const sessionBurst = windowUsage(
      value.session_burst,
      now,
      GUEST_ABUSE_POLICY.session_burst_window_seconds,
    );
    const sessionDaily = windowUsage(
      value.session_daily,
      now,
      GUEST_ABUSE_POLICY.session_daily_window_seconds,
    );
    const networkBurst = windowUsage(
      value.network_burst,
      now,
      GUEST_ABUSE_POLICY.network_burst_window_seconds,
    );
    const networkDaily = windowUsage(
      value.network_daily,
      now,
      GUEST_ABUSE_POLICY.network_daily_window_seconds,
    );
    const sessionActive = value.session_active;
    const networkActive = value.network_active;
    if (
      !sessionBurst ||
      !sessionDaily ||
      !networkBurst ||
      !networkDaily ||
      !counter(sessionActive) ||
      !counter(networkActive)
    ) {
      return null;
    }
    return Object.freeze({
      session_burst: sessionBurst,
      session_daily: sessionDaily,
      network_burst: networkBurst,
      network_daily: networkDaily,
      session_active: sessionActive,
      network_active: networkActive,
    });
  } catch {
    return null;
  }
}

function snapshotRequest(value: unknown): Readonly<GuestAbuseRequest> | null {
  if (!exactRecord(value, REQUEST_KEYS)) return null;
  try {
    const sessionScope = value.guest_session_scope;
    const networkDigest = value.network_signal_digest;
    const now = value.now_unix_seconds;
    const serviceState = value.service_state;
    if (
      typeof sessionScope !== "string" ||
      !SCOPE_PATTERN.test(sessionScope) ||
      typeof networkDigest !== "string" ||
      !NETWORK_PATTERN.test(networkDigest) ||
      typeof now !== "bigint" ||
      now < 0n ||
      (serviceState !== "OPEN" && serviceState !== "PAUSED")
    ) {
      return null;
    }
    const usage = usageSnapshot(value.usage, now);
    if (!usage) return null;
    return Object.freeze({
      guest_session_scope: sessionScope,
      network_signal_digest: networkDigest,
      now_unix_seconds: now,
      service_state: serviceState,
      usage,
    });
  } catch {
    return null;
  }
}

function retryAfter(now: bigint, resetAt: bigint): number {
  return Number(resetAt - now);
}

export function decideGuestAbuseAdmission(
  value: unknown,
): GuestAbuseDecision {
  const request = snapshotRequest(value);
  if (!request) return { ok: false, code: "INVALID_ABUSE_CONTEXT" };
  const usage = request.usage;
  if (request.service_state === "PAUSED") {
    return { ok: false, code: "GUEST_SCANNING_PAUSED" };
  }
  if (usage.session_active >= GUEST_ABUSE_POLICY.session_concurrency_limit) {
    return { ok: false, code: "SESSION_CONCURRENCY_LIMIT" };
  }
  if (usage.session_burst.count >= GUEST_ABUSE_POLICY.session_burst_limit) {
    return {
      ok: false,
      code: "SESSION_BURST_LIMIT",
      retry_after_seconds: retryAfter(
        request.now_unix_seconds,
        usage.session_burst.reset_at_unix_seconds,
      ),
    };
  }
  if (usage.session_daily.count >= GUEST_ABUSE_POLICY.session_daily_limit) {
    return {
      ok: false,
      code: "SESSION_DAILY_LIMIT",
      retry_after_seconds: retryAfter(
        request.now_unix_seconds,
        usage.session_daily.reset_at_unix_seconds,
      ),
    };
  }
  if (usage.network_active >= GUEST_ABUSE_POLICY.network_concurrency_limit) {
    return { ok: false, code: "NETWORK_CONCURRENCY_LIMIT" };
  }
  if (usage.network_burst.count >= GUEST_ABUSE_POLICY.network_burst_limit) {
    return {
      ok: false,
      code: "NETWORK_BURST_LIMIT",
      retry_after_seconds: retryAfter(
        request.now_unix_seconds,
        usage.network_burst.reset_at_unix_seconds,
      ),
    };
  }
  if (usage.network_daily.count >= GUEST_ABUSE_POLICY.network_daily_limit) {
    return {
      ok: false,
      code: "NETWORK_DAILY_LIMIT",
      retry_after_seconds: retryAfter(
        request.now_unix_seconds,
        usage.network_daily.reset_at_unix_seconds,
      ),
    };
  }
  return {
    ok: true,
    action: "ALLOW_NEW_SCAN",
    reservation: Object.freeze({
      policy_id: GUEST_ABUSE_POLICY.policy_id,
      dimensions: GUEST_ABUSE_RESERVATION_DIMENSIONS,
    }),
  };
}
