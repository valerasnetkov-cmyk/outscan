import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestLeasePersistence,
  createPostgresGuestScanPersistence,
} from "../src/guest-persistence/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-lease-persistence-test",
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
    token_keyring: new Map([[1, Buffer.alloc(32, 0x61)]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => `guest_lease_${++scanSequence}`,
    create_token_nonce: () => Buffer.alloc(32, scanSequence),
  });
}

function leaseRepository() {
  return createPostgresGuestLeasePersistence({
    pool,
    create_attempt_id: () => `attempt_lease_${++attemptSequence}`,
    now_unix_seconds: () => clock,
  });
}

function request(index = 1) {
  return {
    guest_session_scope: `sha256:${String(index).repeat(64)}`,
    idempotency_key: `lease-request-${index}`,
    request_hash: `sha256:${String(index + 1).repeat(64)}`,
    canonical_target: `lease-${index}.example.com`,
    network_signal_digests: [`hmac-sha256:${String(index + 2).repeat(64)}`],
    trusted_now_unix_seconds: BigInt(NOW),
  };
}

async function createScan(index = 1): Promise<string> {
  const created = await scanRepository().createOrReplay(request(index));
  if (!created.ok) throw new Error(`scan create failed: ${created.code}`);
  return created.guest_scan_id;
}

function command(lease: {
  guest_scan_id: string;
  attempt_id: string;
  monotonic_fence: number;
  lease_version: number;
}) {
  return {
    guest_scan_id: lease.guest_scan_id,
    attempt_id: lease.attempt_id,
    monotonic_fence: lease.monotonic_fence,
    lease_version: lease.lease_version,
  };
}

async function acquired(scanId: string) {
  const result = await leaseRepository().acquire({ guest_scan_id: scanId });
  if (!result.ok || result.action !== "LEASE_ACQUIRED") {
    throw new Error("lease acquisition failed");
  }
  return result.lease;
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  clock = NOW;
  scanSequence = 0;
  attemptSequence = 0;
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

describe("PostgreSQL Guest attempt lease persistence", () => {
  it("atomically creates the first leased attempt and starts the job", async () => {
    const scanId = await createScan();
    const result = await leaseRepository().acquire({ guest_scan_id: scanId });

    expect(result).toEqual({
      ok: true,
      action: "LEASE_ACQUIRED",
      lease: {
        guest_scan_id: scanId,
        attempt_id: "attempt_lease_1",
        attempt_no: 1,
        monotonic_fence: 1,
        lease_version: 1,
        canonical_target: "lease-1.example.com",
        lease_expires_at_unix_seconds: NOW + 15,
        hard_deadline_unix_seconds: NOW + 45,
      },
    });
    const state = await pool.query<{
      job_state: string;
      current_attempt_id: string;
      current_fence: string;
      attempt_state: string;
      lease_version: string;
    }>(
      `SELECT s.job_state, s.current_attempt_id, s.current_fence::text,
        a.attempt_state, a.lease_version::text
       FROM guest_scans s JOIN guest_scan_attempts a
         ON a.guest_scan_id = s.id AND a.id = s.current_attempt_id
       WHERE s.id = $1`,
      [scanId],
    );
    expect(state.rows[0]).toEqual({
      job_state: "RUNNING",
      current_attempt_id: "attempt_lease_1",
      current_fence: "1",
      attempt_state: "LEASED",
      lease_version: "1",
    });
  });

  it("turns concurrent queue delivery into one lease and one held result", async () => {
    const scanId = await createScan();
    const results = await Promise.all([
      leaseRepository().acquire({ guest_scan_id: scanId }),
      leaseRepository().acquire({ guest_scan_id: scanId }),
    ]);

    expect(results.filter((item) => item.ok)).toHaveLength(1);
    expect(results).toContainEqual({
      ok: false,
      code: "LEASE_HELD",
      retry_after_seconds: 15,
    });
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_scan_attempts",
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("starts idempotently and rejects stale CAS identity", async () => {
    const lease = await acquired(await createScan());
    clock += 1;

    await expect(leaseRepository().start(command(lease))).resolves.toEqual({
      ok: true,
      action: "STARTED",
    });
    await expect(leaseRepository().start(command(lease))).resolves.toEqual({
      ok: true,
      action: "ALREADY_RUNNING",
    });
    await expect(
      leaseRepository().start({ ...command(lease), monotonic_fence: 2 }),
    ).resolves.toEqual({ ok: false, code: "STALE_LEASE" });
  });

  it("renews a running lease by exact version CAS", async () => {
    const lease = await acquired(await createScan());
    clock += 1;
    await leaseRepository().start(command(lease));

    await expect(leaseRepository().renew(command(lease))).resolves.toEqual({
      ok: true,
      action: "LEASE_RENEWED",
      lease_version: 2,
      lease_expires_at_unix_seconds: NOW + 16,
    });
    await expect(leaseRepository().renew(command(lease))).resolves.toEqual({
      ok: false,
      code: "STALE_LEASE",
    });
  });

  it("supersedes an expired lease with a greater attempt and fence", async () => {
    const scanId = await createScan();
    await acquired(scanId);
    clock += 15;

    const replacement = await leaseRepository().acquire({
      guest_scan_id: scanId,
    });
    expect(replacement).toMatchObject({
      ok: true,
      action: "LEASE_ACQUIRED",
      lease: {
        attempt_id: "attempt_lease_2",
        attempt_no: 2,
        monotonic_fence: 2,
        lease_version: 1,
      },
    });
    const attempts = await pool.query<{
      attempt_no: number;
      monotonic_fence: string;
      attempt_state: string;
    }>(
      `SELECT attempt_no, monotonic_fence::text, attempt_state
       FROM guest_scan_attempts ORDER BY attempt_no`,
    );
    expect(attempts.rows).toEqual([
      { attempt_no: 1, monotonic_fence: "1", attempt_state: "SUPERSEDED" },
      { attempt_no: 2, monotonic_fence: "2", attempt_state: "LEASED" },
    ]);
  });

  it("fails the job and releases concurrency after the retry budget", async () => {
    const scanId = await createScan();
    await acquired(scanId);
    for (let attempt = 2; attempt <= 3; attempt += 1) {
      clock += 15;
      const next = await leaseRepository().acquire({ guest_scan_id: scanId });
      expect(next).toMatchObject({
        ok: true,
        action: "LEASE_ACQUIRED",
        lease: { attempt_no: attempt, monotonic_fence: attempt },
      });
    }
    clock += 15;

    await expect(
      leaseRepository().acquire({ guest_scan_id: scanId }),
    ).resolves.toEqual({
      ok: true,
      action: "JOB_TERMINATED",
      terminal_state: "FAILED",
    });
    const state = await pool.query<{
      job_state: string;
      release_reason: string;
      active: string;
    }>(
      `SELECT s.job_state, r.release_reason,
        (SELECT count(*)::text FROM guest_abuse_active_counters) AS active
       FROM guest_scans s JOIN guest_abuse_reservations r
         ON r.guest_scan_id = s.id WHERE s.id = $1`,
      [scanId],
    );
    expect(state.rows[0]).toEqual({
      job_state: "FAILED",
      release_reason: "FAILED",
      active: "0",
    });
  });

  it("expires an unclaimed job and records a distinct release reason", async () => {
    const scanId = await createScan();
    clock += 1_800;

    await expect(
      leaseRepository().acquire({ guest_scan_id: scanId }),
    ).resolves.toEqual({
      ok: true,
      action: "JOB_TERMINATED",
      terminal_state: "EXPIRED",
    });
    const state = await pool.query<{
      job_state: string;
      release_reason: string;
    }>(
      `SELECT s.job_state, r.release_reason FROM guest_scans s
       JOIN guest_abuse_reservations r ON r.guest_scan_id = s.id
       WHERE s.id = $1`,
      [scanId],
    );
    expect(state.rows[0]).toEqual({
      job_state: "EXPIRED",
      release_reason: "EXPIRED",
    });
  });

  it("rejects malformed commands before persistence", async () => {
    await expect(
      leaseRepository().acquire({ guest_scan_id: "bad id" }),
    ).resolves.toEqual({
      ok: false,
      code: "INVALID_REQUEST",
    });
    await expect(
      leaseRepository().start({
        guest_scan_id: "guest_lease_1",
        attempt_id: "attempt_lease_1",
        monotonic_fence: 1,
        lease_version: 1,
        extra: true,
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
  });
});
