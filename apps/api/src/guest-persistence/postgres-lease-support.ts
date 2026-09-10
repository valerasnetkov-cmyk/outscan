import type { Pool, PoolClient } from "pg";

export const GUEST_ATTEMPT_LEASE_SECONDS = 15n;
export const GUEST_ATTEMPT_HARD_DEADLINE_SECONDS = 45n;
export const GUEST_MAX_ATTEMPTS = 3;

const MAX_TRANSACTION_ATTEMPTS = 3;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export interface GuestLeaseDependencies {
  pool: Pool;
  create_attempt_id(): string;
  now_unix_seconds(): number;
}

export interface GuestAttemptLease {
  guest_scan_id: string;
  attempt_id: string;
  attempt_no: number;
  monotonic_fence: number;
  lease_version: number;
  canonical_target: string;
  lease_expires_at_unix_seconds: number;
  hard_deadline_unix_seconds: number;
}

export type AcquireGuestLeaseResult =
  | { ok: true; action: "LEASE_ACQUIRED"; lease: Readonly<GuestAttemptLease> }
  | {
      ok: true;
      action: "JOB_TERMINATED";
      terminal_state: "FAILED" | "EXPIRED";
    }
  | {
      ok: false;
      code:
        | "INVALID_REQUEST"
        | "NOT_ACQUIRABLE"
        | "LEASE_HELD"
        | "GUEST_PERSISTENCE_UNAVAILABLE";
      retry_after_seconds?: number;
    };

export type StartGuestAttemptResult =
  | { ok: true; action: "STARTED" | "ALREADY_RUNNING" }
  | {
      ok: false;
      code:
        | "INVALID_REQUEST"
        | "STALE_LEASE"
        | "LEASE_EXPIRED"
        | "ATTEMPT_DEADLINE_EXCEEDED"
        | "GUEST_PERSISTENCE_UNAVAILABLE";
    };

export type RenewGuestLeaseResult =
  | {
      ok: true;
      action: "LEASE_RENEWED";
      lease_version: number;
      lease_expires_at_unix_seconds: number;
    }
  | {
      ok: false;
      code:
        | "INVALID_REQUEST"
        | "STALE_LEASE"
        | "LEASE_EXPIRED"
        | "ATTEMPT_DEADLINE_EXCEEDED"
        | "LEASE_NOT_EXTENDED"
        | "GUEST_PERSISTENCE_UNAVAILABLE";
    };

export interface GuestLeasePersistence {
  acquire(value: unknown): Promise<AcquireGuestLeaseResult>;
  start(value: unknown): Promise<StartGuestAttemptResult>;
  renew(value: unknown): Promise<RenewGuestLeaseResult>;
}

export interface ScanRow {
  id: string;
  canonical_target: string;
  job_state: string;
  current_attempt_id: string | null;
  current_fence: string;
  result_access_expires_at: string;
  deletion_deadline: string;
}

export interface AttemptRow {
  id: string;
  attempt_no: number;
  monotonic_fence: string;
  lease_version: string;
  lease_expires_at: string | null;
  hard_deadline: string;
  attempt_state: string;
}

export interface LeaseCommand {
  guest_scan_id: string;
  attempt_id: string;
  monotonic_fence: number;
  lease_version: number;
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function integer(value: unknown, allowZero = false): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null;
  }
  try {
    const parsed = BigInt(value);
    if (parsed > MAX_SAFE || (!allowZero && parsed === 0n)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function nowValue(value: unknown): bigint | null {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
  return BigInt(value as number);
}

export function acquireRequest(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const id = Reflect.get(value, "guest_scan_id");
    return keys.length === 1 && keys[0] === "guest_scan_id" && validId(id)
      ? (id as string)
      : null;
  } catch {
    return null;
  }
}

export function leaseCommand(value: unknown): LeaseCommand | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const expected = [
      "guest_scan_id",
      "attempt_id",
      "monotonic_fence",
      "lease_version",
    ];
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expected.length ||
      !keys.every((key) => typeof key === "string" && expected.includes(key))
    ) {
      return null;
    }
    const guestScanId = Reflect.get(value, "guest_scan_id");
    const attemptId = Reflect.get(value, "attempt_id");
    const fence = Reflect.get(value, "monotonic_fence");
    const version = Reflect.get(value, "lease_version");
    if (
      !validId(guestScanId) ||
      !validId(attemptId) ||
      !Number.isSafeInteger(fence) ||
      (fence as number) < 1 ||
      !Number.isSafeInteger(version) ||
      (version as number) < 1
    ) {
      return null;
    }
    return Object.freeze({
      guest_scan_id: guestScanId,
      attempt_id: attemptId,
      monotonic_fence: fence as number,
      lease_version: version as number,
    });
  } catch {
    return null;
  }
}

function retryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = Reflect.get(error, "code");
  return code === "40001" || code === "40P01";
}

export async function transaction<T>(
  pool: Pool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch {
      return null;
    }
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original transaction outcome.
      }
      if (!retryable(error) || attempt === MAX_TRANSACTION_ATTEMPTS)
        return null;
    } finally {
      client.release();
    }
  }
  return null;
}

export function validScan(row: ScanRow | undefined): row is ScanRow {
  if (!row || !validId(row.id) || typeof row.canonical_target !== "string") {
    return false;
  }
  const fence = integer(row.current_fence, true);
  const accessExpiry = integer(row.result_access_expires_at);
  const deletion = integer(row.deletion_deadline);
  return (
    fence !== null &&
    accessExpiry !== null &&
    deletion !== null &&
    accessExpiry < deletion &&
    ((row.current_attempt_id === null && fence === 0n) ||
      (validId(row.current_attempt_id) && fence > 0n))
  );
}

export function validAttempt(row: AttemptRow | undefined): row is AttemptRow {
  if (!row || !validId(row.id) || !Number.isSafeInteger(row.attempt_no)) {
    return false;
  }
  return (
    row.attempt_no > 0 &&
    integer(row.monotonic_fence) !== null &&
    integer(row.lease_version, true) !== null &&
    integer(row.hard_deadline) !== null &&
    (row.lease_expires_at === null || integer(row.lease_expires_at) !== null)
  );
}

export function immutableLease(
  scan: ScanRow,
  attemptId: string,
  attemptNo: number,
  fence: bigint,
  leaseVersion: bigint,
  leaseExpiry: bigint,
  hardDeadline: bigint,
): Readonly<GuestAttemptLease> {
  return Object.freeze({
    guest_scan_id: scan.id,
    attempt_id: attemptId,
    attempt_no: attemptNo,
    monotonic_fence: Number(fence),
    lease_version: Number(leaseVersion),
    canonical_target: scan.canonical_target,
    lease_expires_at_unix_seconds: Number(leaseExpiry),
    hard_deadline_unix_seconds: Number(hardDeadline),
  });
}

export function snapshotDependencies(
  value: GuestLeaseDependencies,
): Readonly<GuestLeaseDependencies> | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    if (
      typeof value.pool?.connect !== "function" ||
      typeof value.create_attempt_id !== "function" ||
      typeof value.now_unix_seconds !== "function"
    ) {
      return null;
    }
    return Object.freeze({ ...value });
  } catch {
    return null;
  }
}
