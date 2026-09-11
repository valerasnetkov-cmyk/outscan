import type { Pool, PoolClient } from "pg";

import type {
  GuestRetentionRunRecord,
  GuestRetentionRunStore,
  GuestRetentionRunStoreResult,
} from "./model.js";
import { validateGuestRetentionRunRecord } from "./validation.js";

const RECORD_SQL = `
  WITH inserted AS (
    INSERT INTO platform_guest_retention_runs (
      run_id, started_at, finished_at, status, observed_at, batch_count,
      due_scans_selected, scans_deleted, active_counter_decrements,
      stale_windows_deleted, session_revocations_deleted, inconsistencies,
      more_work, failure_code, alert_code, retention_deadline
    ) VALUES (
      $1, to_timestamp($2::double precision), to_timestamp($3::double precision),
      $4, CASE WHEN $5::text IS NULL THEN NULL
        ELSE to_timestamp($5::double precision) END,
      $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      to_timestamp($3::double precision) + interval '30 days'
    )
    ON CONFLICT (run_id) DO NOTHING
    RETURNING true AS inserted
  )
  SELECT
    EXISTS (SELECT 1 FROM inserted) AS inserted,
    EXISTS (SELECT 1 FROM inserted) OR EXISTS (
        SELECT 1 FROM platform_guest_retention_runs
        WHERE run_id = $1
          AND started_at = to_timestamp($2::double precision)
          AND finished_at = to_timestamp($3::double precision)
          AND status = $4
          AND observed_at IS NOT DISTINCT FROM CASE WHEN $5::text IS NULL
            THEN NULL ELSE to_timestamp($5::double precision) END
          AND batch_count = $6 AND due_scans_selected = $7
          AND scans_deleted = $8 AND active_counter_decrements = $9
          AND stale_windows_deleted = $10
          AND session_revocations_deleted = $11 AND inconsistencies = $12
          AND more_work IS NOT DISTINCT FROM $13::boolean
          AND failure_code IS NOT DISTINCT FROM $14::text
          AND alert_code IS NOT DISTINCT FROM $15::text
      ) AS matches`;

function parameters(record: Readonly<GuestRetentionRunRecord>): unknown[] {
  return [
    record.run_id,
    record.started_at_unix_seconds.toString(),
    record.finished_at_unix_seconds.toString(),
    record.status,
    record.observed_at_unix_seconds?.toString() ?? null,
    record.batch_count,
    record.due_scans_selected,
    record.scans_deleted,
    record.active_counter_decrements,
    record.stale_windows_deleted,
    record.session_revocations_deleted,
    record.inconsistencies,
    record.more_work,
    record.failure_code,
    record.alert_code,
  ];
}

async function persist(
  client: PoolClient,
  record: Readonly<GuestRetentionRunRecord>,
): Promise<{ inserted: boolean; matches: boolean }> {
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM platform_guest_retention_runs
       WHERE retention_deadline <= to_timestamp($1::double precision)`,
      [record.finished_at_unix_seconds.toString()],
    );
    const result = await client.query<{ inserted: boolean; matches: boolean }>(
      RECORD_SQL,
      parameters(record),
    );
    if (result.rowCount !== 1 || result.rows[0]?.matches !== true) {
      throw new Error("RETENTION_RUN_ID_CONFLICT");
    }
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the closed storage failure below.
    }
    throw error;
  }
}

export function createPostgresGuestRetentionRunStore(
  pool: Pool,
): GuestRetentionRunStore {
  if (typeof pool?.connect !== "function") {
    throw new Error("INVALID_RETENTION_RUN_STORE_CONFIGURATION");
  }
  return Object.freeze({
    async recordAndPrune(
      value: unknown,
    ): Promise<GuestRetentionRunStoreResult> {
      const record = validateGuestRetentionRunRecord(value);
      if (!record) return { ok: false, code: "INVALID_REQUEST" };
      let client: PoolClient;
      try {
        client = await pool.connect();
      } catch {
        return { ok: false, code: "RETENTION_RUN_STORE_UNAVAILABLE" };
      }
      try {
        const result = await persist(client, record);
        return Object.freeze({
          ok: true as const,
          duplicate: !result.inserted,
        });
      } catch {
        return { ok: false, code: "RETENTION_RUN_STORE_UNAVAILABLE" };
      } finally {
        client.release();
      }
    },
  });
}
