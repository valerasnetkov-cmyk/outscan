import type { Pool, PoolClient } from "pg";

import { releaseGuestAbuseReservation } from "./postgres-abuse.js";
import { LOAD_ATTEMPT_SQL } from "./postgres-lease-mutations.js";
import {
  acquireRequest,
  nowValue,
  transaction,
  validAttempt,
  validScan,
  type AttemptRow,
  type ScanRow,
} from "./postgres-lease-support.js";

export interface GuestCancellationDependencies {
  pool: Pool;
  now_unix_seconds(): number;
}

export type CancelGuestScanResult =
  | { ok: true; action: "CANCELLED" | "ALREADY_CANCELLED" }
  | {
      ok: false;
      code:
        "INVALID_REQUEST" | "NOT_CANCELLABLE" | "GUEST_PERSISTENCE_UNAVAILABLE";
    };

export interface GuestCancellationPersistence {
  cancel(value: unknown): Promise<CancelGuestScanResult>;
}

const LOAD_SCAN_SQL = `
  SELECT id, canonical_target, job_state, current_attempt_id,
    current_fence::text,
    extract(epoch FROM result_access_expires_at)::bigint::text
      AS result_access_expires_at,
    extract(epoch FROM deletion_deadline)::bigint::text AS deletion_deadline
  FROM guest_scans WHERE id = $1 FOR UPDATE`;

function snapshotDependencies(
  value: GuestCancellationDependencies,
): Readonly<GuestCancellationDependencies> | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    if (
      typeof value.pool?.connect !== "function" ||
      typeof value.now_unix_seconds !== "function"
    )
      return null;
    return Object.freeze({ ...value });
  } catch {
    return null;
  }
}

async function cancelCurrentAttempt(
  client: PoolClient,
  scan: ScanRow,
  now: bigint,
): Promise<void> {
  if (scan.current_attempt_id === null) return;
  const rows = await client.query<AttemptRow>(LOAD_ATTEMPT_SQL, [
    scan.id,
    scan.current_attempt_id,
  ]);
  const attempt = rows.rows[0];
  if (rows.rowCount !== 1 || !validAttempt(attempt))
    throw new Error("ATTEMPT_STATE");
  const nextState =
    attempt.attempt_state === "RUNNING"
      ? "CANCELLED"
      : attempt.attempt_state === "LEASED"
        ? "SUPERSEDED"
        : attempt.attempt_state === "CREATED"
          ? "CANCELLED"
          : null;
  if (!nextState) throw new Error("ATTEMPT_STATE");
  const updated = await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = $3,
      finished_at = to_timestamp($4::double precision),
      updated_at = to_timestamp($4::double precision)
     WHERE guest_scan_id = $1 AND id = $2 AND attempt_state = $5`,
    [scan.id, attempt.id, nextState, now.toString(), attempt.attempt_state],
  );
  if (updated.rowCount !== 1) throw new Error("ATTEMPT_CAS");
}

export function createPostgresGuestCancellationPersistence(
  dependenciesValue: GuestCancellationDependencies,
): GuestCancellationPersistence {
  const dependencies = snapshotDependencies(dependenciesValue);
  if (!dependencies)
    throw new Error("INVALID_GUEST_CANCELLATION_CONFIGURATION");
  return Object.freeze({
    async cancel(value: unknown): Promise<CancelGuestScanResult> {
      const guestScanId = acquireRequest(value);
      if (!guestScanId) return { ok: false, code: "INVALID_REQUEST" };
      const now = (() => {
        try {
          return nowValue(dependencies.now_unix_seconds());
        } catch {
          return null;
        }
      })();
      if (now === null)
        return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
      const result = await transaction(dependencies.pool, async (client) => {
        const rows = await client.query<ScanRow>(LOAD_SCAN_SQL, [guestScanId]);
        const scan = rows.rows[0];
        if (rows.rowCount !== 1 || !validScan(scan))
          return { ok: false, code: "NOT_CANCELLABLE" } as const;
        if (scan.job_state === "CANCELLED") {
          if (
            !(await releaseGuestAbuseReservation(
              client,
              scan.id,
              now,
              "CANCELLED",
            ))
          )
            throw new Error("ABUSE_RELEASE");
          return { ok: true, action: "ALREADY_CANCELLED" } as const;
        }
        if (scan.job_state !== "QUEUED" && scan.job_state !== "RUNNING")
          return { ok: false, code: "NOT_CANCELLABLE" } as const;
        await cancelCurrentAttempt(client, scan, now);
        const cancelled = await client.query(
          `UPDATE guest_scans SET job_state = 'CANCELLED',
            updated_at = to_timestamp($2::double precision)
           WHERE id = $1 AND job_state IN ('QUEUED', 'RUNNING')`,
          [scan.id, now.toString()],
        );
        if (cancelled.rowCount !== 1) throw new Error("JOB_CANCEL_CAS");
        if (
          !(await releaseGuestAbuseReservation(
            client,
            scan.id,
            now,
            "CANCELLED",
          ))
        )
          throw new Error("ABUSE_RELEASE");
        return { ok: true, action: "CANCELLED" } as const;
      });
      return result ?? { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
    },
  });
}
