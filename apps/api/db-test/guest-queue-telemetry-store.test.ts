import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestQueueTelemetryStore,
  emptyGuestQueueOutcomeCounts,
  type GuestQueueTelemetryBatch,
} from "../src/guest-telemetry/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");
const pool = new Pool({
  application_name: "outscan-guest-queue-telemetry-test",
  connectionString,
  max: 4,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const FINISHED = 1_800_000_000n;

function batch(id: string, finished = FINISHED): GuestQueueTelemetryBatch {
  const counts = emptyGuestQueueOutcomeCounts();
  counts.COMMITTED = 2;
  return {
    batch_id: id,
    started_at_unix_seconds: finished - 10n,
    finished_at_unix_seconds: finished,
    counts,
    counter_saturated: false,
    alert_code: null,
  };
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});
beforeEach(async () => {
  await pool.query("TRUNCATE platform_guest_queue_telemetry_batches");
});
afterAll(async () => pool.end());

describe("PostgreSQL Guest queue telemetry store", () => {
  it("stores only minimized immutable operational counters", async () => {
    const store = createPostgresGuestQueueTelemetryStore(pool);
    await expect(store.recordAndPrune(batch("batch_01"))).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'platform_guest_queue_telemetry_batches'`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining([
        "guest_scan_id",
        "canonical_target",
        "payload",
        "organization_id",
      ]),
    );
    await expect(
      pool.query(
        `UPDATE platform_guest_queue_telemetry_batches
         SET committed = committed WHERE batch_id = 'batch_01'`,
      ),
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("acknowledges exact replay and denies conflicting identity", async () => {
    const store = createPostgresGuestQueueTelemetryStore(pool);
    const value = batch("batch_01");
    await store.recordAndPrune(value);
    await expect(store.recordAndPrune(value)).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
    const changed = emptyGuestQueueOutcomeCounts();
    changed.RETRY_COMMIT = 1;
    await expect(
      store.recordAndPrune({
        ...value,
        counts: changed,
        alert_code: "GUEST_QUEUE_RESULT_INGRESS_FAILURE",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE",
    });
  });

  it("enforces alert classification and exact 30-day pruning", async () => {
    await expect(
      pool.query(
        `INSERT INTO platform_guest_queue_telemetry_batches (
        batch_id, started_at, finished_at, committed, already_committed,
        terminal_acknowledged, not_acquirable_acknowledged, retry_lease_held,
        retry_persistence, retry_context, retry_start, retry_heartbeat,
        retry_supervisor, retry_rejection_sink, retry_commit,
        counter_saturated, alert_code, retention_deadline
      ) VALUES (
        'invalid', to_timestamp(1), to_timestamp(1), 1, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, false,
        'GUEST_QUEUE_DEPENDENCY_FAILURE', to_timestamp(1) + interval '30 days'
      )`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        `INSERT INTO platform_guest_queue_telemetry_batches (
          batch_id, started_at, finished_at, committed, already_committed,
          terminal_acknowledged, not_acquirable_acknowledged, retry_lease_held,
          retry_persistence, retry_context, retry_start, retry_heartbeat,
          retry_supervisor, retry_rejection_sink, retry_commit,
          counter_saturated, alert_code, retention_deadline
        ) VALUES (
          'null_alert', to_timestamp(1), to_timestamp(1), 0, 0, 0, 0, 0,
          0, 0, 0, 0, 0, 0, 1, false, NULL,
          to_timestamp(1) + interval '30 days'
        )`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
    const store = createPostgresGuestQueueTelemetryStore(pool);
    await store.recordAndPrune(batch("old"));
    await store.recordAndPrune(
      batch("current", FINISHED + BigInt(30 * 24 * 60 * 60)),
    );
    const rows = await pool.query<{ batch_id: string }>(
      "SELECT batch_id FROM platform_guest_queue_telemetry_batches",
    );
    expect(rows.rows).toEqual([{ batch_id: "current" }]);
  });

  it("rejects unknown input before acquiring a database client", async () => {
    let connected = false;
    const fakePool = {
      connect: async () => {
        connected = true;
        throw new Error("must not connect");
      },
    } as unknown as Pool;
    await expect(
      createPostgresGuestQueueTelemetryStore(fakePool).recordAndPrune({
        ...batch("batch_01"),
        target: "secret.example",
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(connected).toBe(false);
  });
});
