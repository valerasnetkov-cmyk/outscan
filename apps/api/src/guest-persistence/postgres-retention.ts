import type { Pool, PoolClient } from "pg";

const MAX_BATCH_SIZE = 1_000;

export interface GuestRetentionWorkerDependencies {
  pool: Pool;
  now_unix_seconds(): number;
}

export interface GuestRetentionBatchRequest {
  batch_size: number;
}

export type GuestRetentionBatchResult =
  | {
      ok: true;
      observed_at_unix_seconds: bigint;
      due_scans_selected: number;
      scans_deleted: number;
      active_counter_decrements: number;
      stale_windows_deleted: number;
      inconsistencies: number;
      more_work: boolean;
      alert_required: boolean;
    }
  | {
      ok: false;
      code: "INVALID_REQUEST" | "GUEST_RETENTION_UNAVAILABLE";
    };

export interface GuestRetentionWorker {
  runBatch(value: unknown): Promise<GuestRetentionBatchResult>;
}

interface DueScanRow {
  id: string;
}

interface ReservationRow {
  guest_session_scope: Uint8Array;
  network_signal_digest: Uint8Array;
  released_at: Date | null;
}

const DUE_SCANS_SQL = `
  SELECT id FROM guest_scans
  WHERE deletion_deadline <= to_timestamp($1::double precision)
  ORDER BY deletion_deadline, id
  LIMIT $2
  FOR UPDATE SKIP LOCKED`;

const RESERVATION_SQL = `
  SELECT guest_session_scope, network_signal_digest, released_at
  FROM guest_abuse_reservations
  WHERE guest_scan_id = $1
  FOR UPDATE`;

const DELETE_STALE_WINDOWS_SQL = `
  WITH stale AS (
    SELECT scope_kind, scope_digest, dimension
    FROM guest_abuse_window_counters
    WHERE reset_at <= to_timestamp($1::double precision)
    ORDER BY reset_at, scope_kind, scope_digest, dimension
    LIMIT $2
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM guest_abuse_window_counters AS counters
  USING stale
  WHERE counters.scope_kind = stale.scope_kind
    AND counters.scope_digest = stale.scope_digest
    AND counters.dimension = stale.dimension`;

const MORE_WORK_SQL = `
  SELECT
    EXISTS (
      SELECT 1 FROM guest_scans
      WHERE deletion_deadline <= to_timestamp($1::double precision)
    ) OR EXISTS (
      SELECT 1 FROM guest_abuse_window_counters
      WHERE reset_at <= to_timestamp($1::double precision)
    ) AS more_work`;

function batchRequest(value: unknown): GuestRetentionBatchRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 1 || keys[0] !== "batch_size") return null;
    const batchSize = Reflect.get(value, "batch_size");
    if (
      !Number.isSafeInteger(batchSize) ||
      (batchSize as number) < 1 ||
      (batchSize as number) > MAX_BATCH_SIZE
    ) {
      return null;
    }
    return Object.freeze({ batch_size: batchSize as number });
  } catch {
    return null;
  }
}

function trustedNow(value: unknown): bigint | null {
  if (!Number.isSafeInteger(value) || (value as number) < 0) return null;
  return BigInt(value as number);
}

async function decrementActiveCounter(
  client: PoolClient,
  scopeKind: "SESSION" | "NETWORK",
  scopeDigest: Uint8Array,
  dimension: "SESSION_ACTIVE" | "NETWORK_ACTIVE",
  now: bigint,
): Promise<boolean> {
  const decremented = await client.query<{ active_count: number }>(
    `UPDATE guest_abuse_active_counters
     SET active_count = active_count - 1,
       updated_at = to_timestamp($4::double precision)
     WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3
       AND active_count > 0
     RETURNING active_count`,
    [scopeKind, Buffer.from(scopeDigest), dimension, now.toString()],
  );
  if (decremented.rowCount !== 1) return false;
  if (decremented.rows[0]?.active_count === 0) {
    const removed = await client.query(
      `DELETE FROM guest_abuse_active_counters
       WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3
         AND active_count = 0`,
      [scopeKind, Buffer.from(scopeDigest), dimension],
    );
    if (removed.rowCount !== 1) throw new Error("ACTIVE_COUNTER_RACE");
  }
  return true;
}

async function releaseDueReservation(
  client: PoolClient,
  guestScanId: string,
  now: bigint,
): Promise<{ decrements: number; inconsistencies: number }> {
  const found = await client.query<ReservationRow>(RESERVATION_SQL, [
    guestScanId,
  ]);
  if (found.rowCount !== 1) return { decrements: 0, inconsistencies: 1 };
  const reservation = found.rows[0];
  if (!reservation) return { decrements: 0, inconsistencies: 1 };
  if (reservation.released_at !== null) {
    return { decrements: 0, inconsistencies: 0 };
  }
  if (
    !(reservation.guest_session_scope instanceof Uint8Array) ||
    !(reservation.network_signal_digest instanceof Uint8Array) ||
    reservation.guest_session_scope.byteLength !== 32 ||
    reservation.network_signal_digest.byteLength !== 32
  ) {
    return { decrements: 0, inconsistencies: 1 };
  }
  let decrements = 0;
  let inconsistencies = 0;
  if (
    await decrementActiveCounter(
      client,
      "SESSION",
      reservation.guest_session_scope,
      "SESSION_ACTIVE",
      now,
    )
  ) {
    decrements += 1;
  } else {
    inconsistencies += 1;
  }
  if (
    await decrementActiveCounter(
      client,
      "NETWORK",
      reservation.network_signal_digest,
      "NETWORK_ACTIVE",
      now,
    )
  ) {
    decrements += 1;
  } else {
    inconsistencies += 1;
  }
  return { decrements, inconsistencies };
}

function snapshotDependencies(
  value: GuestRetentionWorkerDependencies,
): Readonly<GuestRetentionWorkerDependencies> | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    if (
      typeof value.pool?.connect !== "function" ||
      typeof value.now_unix_seconds !== "function"
    ) {
      return null;
    }
    return Object.freeze({
      pool: value.pool,
      now_unix_seconds: value.now_unix_seconds,
    });
  } catch {
    return null;
  }
}

export function createPostgresGuestRetentionWorker(
  dependenciesValue: GuestRetentionWorkerDependencies,
): GuestRetentionWorker {
  const dependencies = snapshotDependencies(dependenciesValue);
  if (!dependencies) throw new Error("INVALID_GUEST_RETENTION_CONFIGURATION");
  return Object.freeze({
    async runBatch(value: unknown): Promise<GuestRetentionBatchResult> {
      const request = batchRequest(value);
      if (!request) return { ok: false, code: "INVALID_REQUEST" };
      let now: bigint | null;
      try {
        now = trustedNow(dependencies.now_unix_seconds());
      } catch {
        now = null;
      }
      if (now === null)
        return { ok: false, code: "GUEST_RETENTION_UNAVAILABLE" };
      let client: PoolClient;
      try {
        client = await dependencies.pool.connect();
      } catch {
        return { ok: false, code: "GUEST_RETENTION_UNAVAILABLE" };
      }
      try {
        await client.query("BEGIN");
        const due = await client.query<DueScanRow>(DUE_SCANS_SQL, [
          now.toString(),
          request.batch_size,
        ]);
        let activeCounterDecrements = 0;
        let inconsistencies = 0;
        let scansDeleted = 0;
        for (const scan of due.rows) {
          const release = await releaseDueReservation(client, scan.id, now);
          activeCounterDecrements += release.decrements;
          inconsistencies += release.inconsistencies;
          const deleted = await client.query(
            `DELETE FROM guest_scans
             WHERE id = $1
               AND deletion_deadline <= to_timestamp($2::double precision)`,
            [scan.id, now.toString()],
          );
          if (deleted.rowCount !== 1) throw new Error("GUEST_DELETE_RACE");
          scansDeleted += 1;
        }
        const staleWindows = await client.query(DELETE_STALE_WINDOWS_SQL, [
          now.toString(),
          request.batch_size,
        ]);
        const remaining = await client.query<{ more_work: boolean }>(
          MORE_WORK_SQL,
          [now.toString()],
        );
        if (remaining.rowCount !== 1) throw new Error("GUEST_RETENTION_STATE");
        await client.query("COMMIT");
        return Object.freeze({
          ok: true as const,
          observed_at_unix_seconds: now,
          due_scans_selected: due.rowCount ?? 0,
          scans_deleted: scansDeleted,
          active_counter_decrements: activeCounterDecrements,
          stale_windows_deleted: staleWindows.rowCount ?? 0,
          inconsistencies,
          more_work: remaining.rows[0]?.more_work === true,
          alert_required: inconsistencies > 0,
        });
      } catch {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the closed failure code from the original operation.
        }
        return { ok: false, code: "GUEST_RETENTION_UNAVAILABLE" };
      } finally {
        client.release();
      }
    },
  });
}
