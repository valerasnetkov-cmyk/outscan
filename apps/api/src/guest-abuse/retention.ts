import { GUEST_IDEMPOTENCY_WINDOW_SECONDS } from "../guest-idempotency/index.js";

export const GUEST_RETENTION_MAX_SECONDS = 86_400n;

const RECORD_KEYS = [
  "guest_scan_id",
  "created_at_unix_seconds",
  "result_access_expires_at_unix_seconds",
  "deletion_deadline_unix_seconds",
] as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export type GuestRetentionDecision =
  | {
      ok: true;
      action: "KEEP";
      delete_in_seconds: number;
    }
  | { ok: true; action: "DELETE_NOW" }
  | { ok: false; code: "INVALID_RETENTION_CONTEXT" };

function exactRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === RECORD_KEYS.length &&
      actual.every(
        (key) =>
          typeof key === "string" && RECORD_KEYS.some((item) => item === key),
      )
    );
  } catch {
    return false;
  }
}

function u64(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= UINT64_MAX;
}

export function decideGuestRetention(
  value: unknown,
  nowUnixSeconds: unknown,
): GuestRetentionDecision {
  if (!exactRecord(value) || !u64(nowUnixSeconds)) {
    return { ok: false, code: "INVALID_RETENTION_CONTEXT" };
  }
  try {
    const guestScanId = value.guest_scan_id;
    const createdAt = value.created_at_unix_seconds;
    const resultExpiresAt = value.result_access_expires_at_unix_seconds;
    const deletionDeadline = value.deletion_deadline_unix_seconds;
    if (
      typeof guestScanId !== "string" ||
      !ID_PATTERN.test(guestScanId) ||
      !u64(createdAt) ||
      !u64(resultExpiresAt) ||
      !u64(deletionDeadline) ||
      createdAt > nowUnixSeconds ||
      createdAt > UINT64_MAX - GUEST_RETENTION_MAX_SECONDS ||
      deletionDeadline !== createdAt + GUEST_RETENTION_MAX_SECONDS ||
      resultExpiresAt !== createdAt + GUEST_IDEMPOTENCY_WINDOW_SECONDS ||
      resultExpiresAt > deletionDeadline
    ) {
      return { ok: false, code: "INVALID_RETENTION_CONTEXT" };
    }
    if (nowUnixSeconds >= deletionDeadline) {
      return { ok: true, action: "DELETE_NOW" };
    }
    return {
      ok: true,
      action: "KEEP",
      delete_in_seconds: Number(deletionDeadline - nowUnixSeconds),
    };
  } catch {
    return { ok: false, code: "INVALID_RETENTION_CONTEXT" };
  }
}
