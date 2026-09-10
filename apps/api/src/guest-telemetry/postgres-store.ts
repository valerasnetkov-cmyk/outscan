import type { Pool, PoolClient } from "pg";

import type {
  GuestQueueTelemetryBatch,
  GuestQueueTelemetryStore,
  GuestQueueTelemetryStoreResult,
} from "./model.js";
import { validateGuestQueueTelemetryBatch } from "./validation.js";

const RECORD_SQL = `
  WITH inserted AS (
    INSERT INTO platform_guest_queue_telemetry_batches (
      batch_id, started_at, finished_at, committed, already_committed,
      terminal_acknowledged, not_acquirable_acknowledged, retry_lease_held,
      retry_persistence, retry_context, retry_start, retry_heartbeat,
      retry_supervisor, retry_rejection_sink, retry_commit,
      counter_saturated, alert_code, retention_deadline
    ) VALUES (
      $1, to_timestamp($2::double precision), to_timestamp($3::double precision),
      $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      to_timestamp($3::double precision) + interval '30 days'
    ) ON CONFLICT (batch_id) DO NOTHING RETURNING true AS inserted
  )
  SELECT EXISTS (SELECT 1 FROM inserted) AS inserted,
    EXISTS (SELECT 1 FROM inserted) OR EXISTS (
      SELECT 1 FROM platform_guest_queue_telemetry_batches
      WHERE batch_id = $1
        AND started_at = to_timestamp($2::double precision)
        AND finished_at = to_timestamp($3::double precision)
        AND committed = $4 AND already_committed = $5
        AND terminal_acknowledged = $6
        AND not_acquirable_acknowledged = $7 AND retry_lease_held = $8
        AND retry_persistence = $9 AND retry_context = $10
        AND retry_start = $11 AND retry_heartbeat = $12
        AND retry_supervisor = $13 AND retry_rejection_sink = $14
        AND retry_commit = $15 AND counter_saturated = $16
        AND alert_code IS NOT DISTINCT FROM $17::text
    ) AS matches`;

function parameters(record: Readonly<GuestQueueTelemetryBatch>): unknown[] {
  const counts = record.counts;
  return [
    record.batch_id,
    record.started_at_unix_seconds.toString(),
    record.finished_at_unix_seconds.toString(),
    counts.COMMITTED,
    counts.ALREADY_COMMITTED,
    counts.TERMINAL_ACKNOWLEDGED,
    counts.NOT_ACQUIRABLE_ACKNOWLEDGED,
    counts.RETRY_LEASE_HELD,
    counts.RETRY_PERSISTENCE,
    counts.RETRY_CONTEXT,
    counts.RETRY_START,
    counts.RETRY_HEARTBEAT,
    counts.RETRY_SUPERVISOR,
    counts.RETRY_REJECTION_SINK,
    counts.RETRY_COMMIT,
    record.counter_saturated,
    record.alert_code,
  ];
}

async function persist(
  client: PoolClient,
  record: Readonly<GuestQueueTelemetryBatch>,
) {
  await client.query("BEGIN");
  try {
    await client.query(
      `DELETE FROM platform_guest_queue_telemetry_batches
       WHERE retention_deadline <= to_timestamp($1::double precision)`,
      [record.finished_at_unix_seconds.toString()],
    );
    const result = await client.query<{ inserted: boolean; matches: boolean }>(
      RECORD_SQL,
      parameters(record),
    );
    if (result.rowCount !== 1 || result.rows[0]?.matches !== true) {
      throw new Error("QUEUE_TELEMETRY_BATCH_ID_CONFLICT");
    }
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the stable storage failure below.
    }
    throw error;
  }
}

export function createPostgresGuestQueueTelemetryStore(
  pool: Pool,
): GuestQueueTelemetryStore {
  if (typeof pool?.connect !== "function") {
    throw new Error("INVALID_QUEUE_TELEMETRY_STORE_CONFIGURATION");
  }
  return Object.freeze({
    async recordAndPrune(
      value: unknown,
    ): Promise<GuestQueueTelemetryStoreResult> {
      const record = validateGuestQueueTelemetryBatch(value);
      if (!record) return { ok: false, code: "INVALID_REQUEST" };
      let client: PoolClient;
      try {
        client = await pool.connect();
      } catch {
        return { ok: false, code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE" };
      }
      try {
        const result = await persist(client, record);
        return Object.freeze({
          ok: true as const,
          duplicate: !result.inserted,
        });
      } catch {
        return { ok: false, code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE" };
      } finally {
        client.release();
      }
    },
  });
}
