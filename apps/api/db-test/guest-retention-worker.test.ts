import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestRetentionWorker,
  createPostgresGuestScanPersistence,
  releaseGuestAbuseReservation,
} from "../src/guest-persistence/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-retention-worker-test",
  connectionString,
  max: 6,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const CREATED_AT = 1_800_000_000;
const DELETION_DEADLINE = CREATED_AT + 86_400;
let sequence = 0;

function repository() {
  return createPostgresGuestScanPersistence({
    pool,
    token_keyring: new Map([[1, Buffer.alloc(32, 0x41)]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => `guest_retention_${++sequence}`,
    create_token_nonce: () => Buffer.alloc(32, sequence),
  });
}

function request(index: number) {
  const digit = String((index % 8) + 1);
  return {
    guest_session_scope: `sha256:${digit.repeat(64)}`,
    idempotency_key: `retention-${index}`,
    request_hash: `sha256:${String(((index + 1) % 8) + 1).repeat(64)}`,
    canonical_target: `host-${index}.example.com`,
    network_signal_digest: `hmac-sha256:${String(((index + 2) % 8) + 1).repeat(64)}`,
    trusted_now_unix_seconds: BigInt(CREATED_AT),
  };
}

function worker(now = DELETION_DEADLINE) {
  return createPostgresGuestRetentionWorker({
    pool,
    now_unix_seconds: () => now,
  });
}

async function tableCount(table: string): Promise<number> {
  const allowed = new Set([
    "guest_scans",
    "guest_scan_attempts",
    "guest_results",
    "guest_abuse_reservations",
    "guest_abuse_active_counters",
    "guest_abuse_window_counters",
  ]);
  if (!allowed.has(table)) throw new Error("unexpected table");
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table}`,
  );
  return Number(result.rows[0]?.count);
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  sequence = 0;
  await pool.query(
    `TRUNCATE guest_results, guest_scan_attempts, guest_abuse_reservations,
      guest_abuse_active_counters, guest_abuse_window_counters, guest_scans
     CASCADE`,
  );
  await pool.query(
    `UPDATE guest_abuse_control SET service_state = 'OPEN',
      updated_at = date_trunc('second', transaction_timestamp())
     WHERE singleton = 1`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL Guest retention worker", () => {
  it("atomically deletes a due aggregate and releases active quota", async () => {
    const created = await repository().createOrReplay(request(1));
    expect(created.ok).toBe(true);

    const result = await worker().runBatch({ batch_size: 100 });
    expect(result).toEqual({
      ok: true,
      observed_at_unix_seconds: BigInt(DELETION_DEADLINE),
      due_scans_selected: 1,
      scans_deleted: 1,
      active_counter_decrements: 2,
      stale_windows_deleted: 4,
      inconsistencies: 0,
      more_work: false,
      alert_required: false,
    });
    await expect(tableCount("guest_scans")).resolves.toBe(0);
    await expect(tableCount("guest_abuse_reservations")).resolves.toBe(0);
    await expect(tableCount("guest_abuse_active_counters")).resolves.toBe(0);
    await expect(tableCount("guest_abuse_window_counters")).resolves.toBe(0);
  });

  it("keeps a not-yet-due aggregate while pruning only expired windows", async () => {
    await repository().createOrReplay(request(1));

    const result = await worker(CREATED_AT + 601).runBatch({ batch_size: 100 });
    expect(result).toMatchObject({
      ok: true,
      due_scans_selected: 0,
      scans_deleted: 0,
      active_counter_decrements: 0,
      stale_windows_deleted: 2,
      inconsistencies: 0,
      more_work: false,
      alert_required: false,
    });
    await expect(tableCount("guest_scans")).resolves.toBe(1);
    await expect(tableCount("guest_abuse_active_counters")).resolves.toBe(2);
    await expect(tableCount("guest_abuse_window_counters")).resolves.toBe(2);
  });

  it("bounds each table batch and reports remaining work", async () => {
    await repository().createOrReplay(request(1));
    await repository().createOrReplay(request(2));

    const first = await worker().runBatch({ batch_size: 1 });
    expect(first).toMatchObject({
      ok: true,
      due_scans_selected: 1,
      scans_deleted: 1,
      stale_windows_deleted: 1,
      more_work: true,
    });
    await expect(tableCount("guest_scans")).resolves.toBe(1);

    let moreWork = true;
    let runs = 0;
    while (moreWork && runs < 10) {
      const result = await worker().runBatch({ batch_size: 1 });
      expect(result.ok).toBe(true);
      moreWork = result.ok && result.more_work;
      runs += 1;
    }
    expect(moreWork).toBe(false);
    await expect(tableCount("guest_scans")).resolves.toBe(0);
    await expect(tableCount("guest_abuse_window_counters")).resolves.toBe(0);
  });

  it("does not decrement a reservation released by a prior terminal path", async () => {
    const created = await repository().createOrReplay(request(1));
    if (!created.ok) throw new Error("scan create failed");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      expect(
        await releaseGuestAbuseReservation(
          client,
          created.guest_scan_id,
          BigInt(CREATED_AT + 1),
          "CANCELLED",
        ),
      ).toBe(true);
      await client.query("COMMIT");
    } finally {
      client.release();
    }

    const result = await worker().runBatch({ batch_size: 100 });
    expect(result).toMatchObject({
      ok: true,
      scans_deleted: 1,
      active_counter_decrements: 0,
      inconsistencies: 0,
      alert_required: false,
    });
  });

  it("prioritizes deletion and raises an alert on missing quota metadata", async () => {
    await repository().createOrReplay(request(1));
    await pool.query(
      `DELETE FROM guest_abuse_active_counters
       WHERE dimension = 'NETWORK_ACTIVE'`,
    );

    const result = await worker().runBatch({ batch_size: 100 });
    expect(result).toMatchObject({
      ok: true,
      scans_deleted: 1,
      active_counter_decrements: 1,
      inconsistencies: 1,
      alert_required: true,
    });
    await expect(tableCount("guest_scans")).resolves.toBe(0);
    await expect(tableCount("guest_abuse_reservations")).resolves.toBe(0);
  });

  it("rejects invalid requests and invalid trusted clocks", async () => {
    await expect(worker().runBatch({ batch_size: 0 })).resolves.toEqual({
      ok: false,
      code: "INVALID_REQUEST",
    });
    await expect(
      worker().runBatch({ batch_size: 1, extra: true }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
    await expect(
      worker(Number.NaN).runBatch({ batch_size: 1 }),
    ).resolves.toEqual({
      ok: false,
      code: "GUEST_RETENTION_UNAVAILABLE",
    });
  });
});
