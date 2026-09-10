import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestCancellationPersistence,
  createPostgresGuestLeasePersistence,
  createPostgresGuestScanPersistence,
} from "../src/guest-persistence/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-cancellation-persistence-test",
  connectionString,
  max: 8,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const NOW = 1_800_000_000;
let clock = NOW;
let scanSequence = 0;
let attemptSequence = 0;

function scanRepository() {
  return createPostgresGuestScanPersistence({
    pool,
    token_keyring: new Map([[1, Buffer.alloc(32, 0x71)]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => `guest_cancel_${++scanSequence}`,
    create_token_nonce: () => Buffer.alloc(32, scanSequence),
  });
}

function leaseRepository() {
  return createPostgresGuestLeasePersistence({
    pool,
    create_attempt_id: () => `attempt_cancel_${++attemptSequence}`,
    now_unix_seconds: () => clock,
  });
}

function cancellationRepository() {
  return createPostgresGuestCancellationPersistence({
    pool,
    now_unix_seconds: () => clock,
  });
}

async function createScan(index = 1): Promise<string> {
  const created = await scanRepository().createOrReplay({
    guest_session_scope: `sha256:${String(index).repeat(64)}`,
    idempotency_key: `cancel-request-${index}`,
    request_hash: `sha256:${String(index + 1).repeat(64)}`,
    canonical_target: `cancel-${index}.example.com`,
    network_signal_digests: [`hmac-sha256:${String(index + 2).repeat(64)}`],
    trusted_now_unix_seconds: BigInt(NOW),
  });
  if (!created.ok) throw new Error(`scan create failed: ${created.code}`);
  return created.guest_scan_id;
}

async function acquire(scanId: string) {
  const result = await leaseRepository().acquire({ guest_scan_id: scanId });
  if (!result.ok || result.action !== "LEASE_ACQUIRED")
    throw new Error("lease acquisition failed");
  return result.lease;
}

beforeAll(async () => migrateDatabase(pool, migrations));

beforeEach(async () => {
  clock = NOW;
  scanSequence = 0;
  attemptSequence = 0;
  await pool.query(
    `TRUNCATE guest_results, guest_scan_attempts, guest_abuse_reservations,
      guest_abuse_active_counters, guest_abuse_window_counters, guest_scans
     CASCADE`,
  );
});

afterAll(async () => pool.end());

describe("PostgreSQL Guest cancellation persistence", () => {
  it("cancels a queued scan and releases concurrency exactly once", async () => {
    const scanId = await createScan();
    const cancellation = cancellationRepository();
    await expect(
      cancellation.cancel({ guest_scan_id: scanId }),
    ).resolves.toEqual({ ok: true, action: "CANCELLED" });
    await expect(
      cancellation.cancel({ guest_scan_id: scanId }),
    ).resolves.toEqual({ ok: true, action: "ALREADY_CANCELLED" });
    const state = await pool.query<{
      job_state: string;
      release_reason: string;
      active_count: string;
    }>(
      `SELECT s.job_state, r.release_reason,
        (SELECT count(*)::text FROM guest_abuse_active_counters) AS active_count
       FROM guest_scans s JOIN guest_abuse_reservations r
         ON r.guest_scan_id = s.id WHERE s.id = $1`,
      [scanId],
    );
    expect(state.rows[0]).toEqual({
      job_state: "CANCELLED",
      release_reason: "CANCELLED",
      active_count: "0",
    });
  });

  it("invalidates a leased attempt before cancelling its job", async () => {
    const scanId = await createScan();
    await acquire(scanId);
    clock += 1;
    await expect(
      cancellationRepository().cancel({ guest_scan_id: scanId }),
    ).resolves.toEqual({ ok: true, action: "CANCELLED" });
    const state = await pool.query<{
      job_state: string;
      attempt_state: string;
    }>(
      `SELECT s.job_state, a.attempt_state FROM guest_scans s
       JOIN guest_scan_attempts a ON a.guest_scan_id = s.id
       WHERE s.id = $1`,
      [scanId],
    );
    expect(state.rows[0]).toEqual({
      job_state: "CANCELLED",
      attempt_state: "SUPERSEDED",
    });
  });

  it("cancels the running attempt before releasing its quota", async () => {
    const scanId = await createScan();
    const lease = await acquire(scanId);
    clock += 1;
    await leaseRepository().start({
      guest_scan_id: lease.guest_scan_id,
      attempt_id: lease.attempt_id,
      monotonic_fence: lease.monotonic_fence,
      lease_version: lease.lease_version,
    });
    await expect(
      cancellationRepository().cancel({ guest_scan_id: scanId }),
    ).resolves.toEqual({ ok: true, action: "CANCELLED" });
    const attempt = await pool.query<{ attempt_state: string }>(
      "SELECT attempt_state FROM guest_scan_attempts WHERE guest_scan_id = $1",
      [scanId],
    );
    expect(attempt.rows[0]?.attempt_state).toBe("CANCELLED");
  });

  it("serializes concurrent cancellation and rejects malformed input", async () => {
    const scanId = await createScan();
    const cancellation = cancellationRepository();
    const outcomes = await Promise.all([
      cancellation.cancel({ guest_scan_id: scanId }),
      cancellation.cancel({ guest_scan_id: scanId }),
    ]);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { ok: true, action: "CANCELLED" },
        { ok: true, action: "ALREADY_CANCELLED" },
      ]),
    );
    await expect(
      cancellation.cancel({ guest_scan_id: scanId, extra: true }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
  });
});
