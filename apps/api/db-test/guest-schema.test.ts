import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-db-test",
  connectionString,
  max: 4,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const CREATED = "2027-01-15T08:00:00.000Z";
const DIGEST = Buffer.alloc(32, 0xdd);

async function insertQueuedScan(
  client: Pool | PoolClient,
  id: string,
  idempotencyKey: string,
  expiryMinutes = 30,
): Promise<void> {
  await client.query(
    `INSERT INTO guest_scans (
      id, canonical_target, guest_session_scope, endpoint_operation,
      idempotency_key, request_hash, created_at, updated_at,
      idempotency_expires_at, deletion_deadline, job_state,
      policy_id, policy_version, profile, result_token_version,
      result_token_nonce, result_token_key_version, result_access_expires_at
    ) VALUES (
      $1, 'example.com', decode(repeat('aa', 32), 'hex'),
      'POST:/v1/public/scans', $2, decode(repeat('bb', 32), 'hex'),
      $3::timestamptz, $3::timestamptz,
      $3::timestamptz + make_interval(mins => $4),
      $3::timestamptz + interval '24 hours', 'QUEUED',
      'outscan-v1', '1.0.0', 'GUEST_SAFE', 1,
      decode(repeat('cc', 32), 'hex'), 7,
      $3::timestamptz + make_interval(mins => $4)
    )`,
    [id, idempotencyKey, CREATED, expiryMinutes],
  );
}

async function createRunningAttempt(
  client: PoolClient,
  scanId: string,
  attemptId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO guest_scan_attempts (
      id, guest_scan_id, attempt_no, monotonic_fence, lease_version,
      lease_expires_at, hard_deadline, attempt_state, created_at,
      updated_at, started_at, finished_at
    ) VALUES (
      $1, $2, 1, 5, 0, NULL,
      $3::timestamptz + interval '15 minutes', 'CREATED',
      $3::timestamptz, $3::timestamptz, NULL, NULL
    )`,
    [attemptId, scanId, CREATED],
  );
  await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'LEASED',
      lease_version = 1,
      lease_expires_at = $3::timestamptz + interval '10 minutes',
      updated_at = $3::timestamptz + interval '1 second'
     WHERE guest_scan_id = $1 AND id = $2`,
    [scanId, attemptId, CREATED],
  );
  await client.query(
    `UPDATE guest_scans SET job_state = 'RUNNING', current_attempt_id = $2,
      current_fence = 5, updated_at = $3::timestamptz + interval '2 seconds'
     WHERE id = $1`,
    [scanId, attemptId, CREATED],
  );
  await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'RUNNING',
      started_at = $3::timestamptz + interval '2 seconds',
      updated_at = $3::timestamptz + interval '2 seconds'
     WHERE guest_scan_id = $1 AND id = $2`,
    [scanId, attemptId, CREATED],
  );
}

function projection(canonicalHost = "example.com") {
  return {
    schema_version: 1,
    canonical_host: canonicalHost,
    posture: [],
    potential_risk_count: 0,
    coverage: [
      {
        detector_group: "TARGET_RESOLUTION",
        execution_status: "SUCCESS",
        completeness: "COMPLETE",
      },
    ],
    warning_count: 0,
    execution: {
      policy_version: "1.0.0",
      duration_ms: 100,
      request_count: 1,
    },
  };
}

async function commitResult(
  client: PoolClient,
  scanId: string,
  attemptId: string,
  canonicalHost = "example.com",
): Promise<void> {
  await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'SUCCEEDED',
      finished_at = $3::timestamptz + interval '5 seconds',
      updated_at = $3::timestamptz + interval '5 seconds'
     WHERE guest_scan_id = $1 AND id = $2`,
    [scanId, attemptId, CREATED],
  );
  await client.query(
    `UPDATE guest_scans SET job_state = 'SUCCEEDED',
      accepted_attempt_id = $2, accepted_fence = 5,
      accepted_payload_digest = $3,
      updated_at = $4::timestamptz + interval '5 seconds'
     WHERE id = $1`,
    [scanId, attemptId, DIGEST, CREATED],
  );
  await client.query(
    `INSERT INTO guest_results (
      guest_scan_id, accepted_attempt_id, accepted_fence,
      payload_digest, completed_at, projection
    ) VALUES ($1, $2, 5, $3, $4::timestamptz + interval '5 seconds', $5)`,
    [scanId, attemptId, DIGEST, CREATED, projection(canonicalHost)],
  );
}

async function pgCode(
  operation: Promise<unknown>,
): Promise<string | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  await pool.query(
    `TRUNCATE guest_abuse_reservations, guest_abuse_active_counters,
      guest_abuse_window_counters, guest_results, guest_scan_attempts,
      guest_scans CASCADE`,
  );
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL Guest persistence", () => {
  it("applies the checksummed migration once and recognizes replay", async () => {
    const result = await migrateDatabase(pool, migrations);
    expect(result.applied).toEqual([]);
    expect(result.already_applied).toEqual([
      "0001_guest_scan.sql",
      "0002_guest_abuse_counters.sql",
      "0003_guest_abuse_expired_release.sql",
      "0004_guest_result_rejection_events.sql",
      "0005_guest_retention_runs.sql",
      "0006_guest_queue_telemetry.sql",
      "0007_guest_session_revocations.sql",
      "0008_guest_retention_revocations.sql",
    ]);
  });

  it("detects migration checksum drift", async () => {
    const original = await pool.query<{ checksum: string }>(
      "SELECT checksum FROM outscan_schema_migrations WHERE version = '0001_guest_scan.sql'",
    );
    await pool.query(
      "UPDATE outscan_schema_migrations SET checksum = repeat('0', 64) WHERE version = '0001_guest_scan.sql'",
    );
    try {
      await expect(migrateDatabase(pool, migrations)).rejects.toThrow(
        "DATABASE_MIGRATION_DRIFT",
      );
    } finally {
      await pool.query(
        "UPDATE outscan_schema_migrations SET checksum = $1 WHERE version = '0001_guest_scan.sql'",
        [original.rows[0]?.checksum],
      );
    }
  });

  it("has no tenant ownership column in PUBLIC_GUEST tables", async () => {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name IN (
           'guest_scans', 'guest_scan_attempts', 'guest_results',
           'guest_result_rejection_events', 'guest_session_revocations'
         )
         AND column_name = 'organization_id'`,
    );
    expect(result.rows[0]?.count).toBe("0");
  });

  it("enforces Guest-session-scoped idempotency uniqueness", async () => {
    const outcomes = await Promise.allSettled([
      insertQueuedScan(pool, "guest_scan_01", "same-key"),
      insertQueuedScan(pool, "guest_scan_02", "same-key"),
    ]);
    expect(outcomes.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    const rejected = outcomes.find((item) => item.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason.code).toBe("23505");
  });

  it("enforces exact access and retention timestamps", async () => {
    expect(
      await pgCode(insertQueuedScan(pool, "guest_scan_01", "key", 31)),
    ).toBe("23514");
  });

  it("enforces attempt FSM and monotonic fence/lease state", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertQueuedScan(client, "guest_scan_01", "key");
      await createRunningAttempt(client, "guest_scan_01", "guest_attempt_01");
      await client.query("COMMIT");
      expect(
        await pgCode(
          client.query(
            `UPDATE guest_scan_attempts SET attempt_state = 'LEASED',
             started_at = NULL, updated_at = updated_at + interval '1 second'
             WHERE id = 'guest_attempt_01'`,
          ),
        ),
      ).toBe("P0001");
    } finally {
      client.release();
    }
  });

  it("commits one accepted result atomically and keeps it immutable", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertQueuedScan(client, "guest_scan_01", "key");
      await createRunningAttempt(client, "guest_scan_01", "guest_attempt_01");
      await commitResult(client, "guest_scan_01", "guest_attempt_01");
      await client.query("COMMIT");
      const stored = await client.query<{ job_state: string; count: string }>(
        `SELECT s.job_state, count(r.*)::text AS count
         FROM guest_scans s LEFT JOIN guest_results r ON r.guest_scan_id = s.id
         WHERE s.id = 'guest_scan_01' GROUP BY s.job_state`,
      );
      expect(stored.rows[0]).toEqual({ job_state: "SUCCEEDED", count: "1" });
      expect(
        await pgCode(
          client.query(
            "UPDATE guest_results SET projection = projection WHERE guest_scan_id = 'guest_scan_01'",
          ),
        ),
      ).toBe("P0001");
      expect(
        await pgCode(
          client.query(
            "UPDATE guest_scans SET job_state = 'FAILED' WHERE id = 'guest_scan_01'",
          ),
        ),
      ).toBe("P0001");
    } finally {
      client.release();
    }
  });

  it("rejects a terminal success without its accepted result row", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertQueuedScan(client, "guest_scan_01", "key");
      await createRunningAttempt(client, "guest_scan_01", "guest_attempt_01");
      await client.query(
        `UPDATE guest_scan_attempts SET attempt_state = 'SUCCEEDED',
          finished_at = $1::timestamptz + interval '5 seconds',
          updated_at = $1::timestamptz + interval '5 seconds'
         WHERE id = 'guest_attempt_01'`,
        [CREATED],
      );
      await client.query(
        `UPDATE guest_scans SET job_state = 'SUCCEEDED',
          accepted_attempt_id = 'guest_attempt_01', accepted_fence = 5,
          accepted_payload_digest = $1,
          updated_at = $2::timestamptz + interval '5 seconds'
         WHERE id = 'guest_scan_01'`,
        [DIGEST, CREATED],
      );
      expect(await pgCode(client.query("COMMIT"))).toBe("23503");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("rejects a result until the current attempt succeeds", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertQueuedScan(client, "guest_scan_01", "key");
      await createRunningAttempt(client, "guest_scan_01", "guest_attempt_01");
      await client.query(
        `UPDATE guest_scans SET job_state = 'SUCCEEDED',
          accepted_attempt_id = 'guest_attempt_01', accepted_fence = 5,
          accepted_payload_digest = $1,
          updated_at = $2::timestamptz + interval '5 seconds'
         WHERE id = 'guest_scan_01'`,
        [DIGEST, CREATED],
      );
      expect(
        await pgCode(
          client.query(
            `INSERT INTO guest_results VALUES (
              'guest_scan_01', 'guest_attempt_01', 5, $1,
              $2::timestamptz + interval '5 seconds', $3
            )`,
            [DIGEST, CREATED, projection()],
          ),
        ),
      ).toBe("P0001");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("rolls back a cross-target accepted result", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertQueuedScan(client, "guest_scan_01", "key");
      await createRunningAttempt(client, "guest_scan_01", "guest_attempt_01");
      expect(
        await pgCode(
          commitResult(
            client,
            "guest_scan_01",
            "guest_attempt_01",
            "other.example",
          ),
        ),
      ).toBe("P0001");
      await client.query("ROLLBACK");
      const count = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM guest_scans",
      );
      expect(count.rows[0]?.count).toBe("0");
    } finally {
      client.release();
    }
  });

  it("cascades bounded Guest aggregate deletion", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertQueuedScan(client, "guest_scan_01", "key");
      await createRunningAttempt(client, "guest_scan_01", "guest_attempt_01");
      await commitResult(client, "guest_scan_01", "guest_attempt_01");
      await client.query("COMMIT");
      await client.query("DELETE FROM guest_scans WHERE id = 'guest_scan_01'");
      const rows = await client.query<{ attempts: string; results: string }>(
        `SELECT
          (SELECT count(*)::text FROM guest_scan_attempts) AS attempts,
          (SELECT count(*)::text FROM guest_results) AS results`,
      );
      expect(rows.rows[0]).toEqual({ attempts: "0", results: "0" });
    } finally {
      client.release();
    }
  });
});
