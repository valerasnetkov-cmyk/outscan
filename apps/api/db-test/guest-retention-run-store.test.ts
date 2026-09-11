import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestRetentionRunStore,
  type GuestRetentionRunRecord,
} from "../src/guest-retention/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-retention-run-store-test",
  connectionString,
  max: 4,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const FINISHED = 1_800_000_000n;

function record(runId: string, finished = FINISHED): GuestRetentionRunRecord {
  return {
    run_id: runId,
    started_at_unix_seconds: finished,
    finished_at_unix_seconds: finished,
    status: "SUCCEEDED",
    observed_at_unix_seconds: finished,
    batch_count: 1,
    due_scans_selected: 1,
    scans_deleted: 1,
    active_counter_decrements: 2,
    stale_windows_deleted: 3,
    session_revocations_deleted: 4,
    inconsistencies: 0,
    more_work: false,
    failure_code: null,
    alert_code: null,
  };
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  await pool.query("TRUNCATE platform_guest_retention_runs");
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL Guest retention run store", () => {
  it("stores a minimized immutable operational outcome", async () => {
    const store = createPostgresGuestRetentionRunStore(pool);
    await expect(store.recordAndPrune(record("run_01"))).resolves.toEqual({
      ok: true,
      duplicate: false,
    });
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'platform_guest_retention_runs'
       ORDER BY column_name`,
    );
    expect(columns.rows.map((row) => row.column_name)).not.toEqual(
      expect.arrayContaining([
        "organization_id",
        "guest_scan_id",
        "canonical_target",
        "session_scope",
      ]),
    );
    await expect(
      pool.query(
        `UPDATE platform_guest_retention_runs
         SET scans_deleted = scans_deleted WHERE run_id = 'run_01'`,
      ),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      pool.query(
        `INSERT INTO platform_guest_retention_runs
         SELECT 'oversized_run', started_at, finished_at, status, observed_at,
           batch_count, 1001, scans_deleted, active_counter_decrements,
           stale_windows_deleted, inconsistencies, more_work, failure_code,
           alert_code, retention_deadline, 0
         FROM platform_guest_retention_runs WHERE run_id = 'run_01'`,
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("acknowledges exact replay and rejects a conflicting run identity", async () => {
    const store = createPostgresGuestRetentionRunStore(pool);
    const value = record("run_01");
    await store.recordAndPrune(value);
    await expect(store.recordAndPrune(value)).resolves.toEqual({
      ok: true,
      duplicate: true,
    });
    await expect(
      store.recordAndPrune({ ...value, scans_deleted: 2 }),
    ).resolves.toEqual({
      ok: false,
      code: "RETENTION_RUN_STORE_UNAVAILABLE",
    });
  });

  it("prunes expired telemetry at the exact 30-day boundary", async () => {
    const store = createPostgresGuestRetentionRunStore(pool);
    await store.recordAndPrune(record("old_run"));
    await store.recordAndPrune(
      record("new_run", FINISHED + BigInt(30 * 24 * 60 * 60)),
    );
    const rows = await pool.query<{ run_id: string }>(
      "SELECT run_id FROM platform_guest_retention_runs ORDER BY run_id",
    );
    expect(rows.rows).toEqual([{ run_id: "new_run" }]);
  });

  it("rejects unknown fields before database acquisition", async () => {
    let connected = false;
    const fakePool = {
      connect: async () => {
        connected = true;
        throw new Error("must not connect");
      },
    } as unknown as Pool;
    const store = createPostgresGuestRetentionRunStore(fakePool);
    await expect(
      store.recordAndPrune({ ...record("run_01"), target: "secret.example" }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(connected).toBe(false);
  });
});
