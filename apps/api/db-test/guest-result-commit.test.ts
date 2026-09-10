import { Pool } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestResultCommitter,
  createPostgresGuestScanPersistence,
} from "../src/guest-persistence/index.js";
import {
  RESULT_ENVELOPE_AUDIENCE,
  signResultEnvelope,
  type AuthenticatedResultSubmission,
} from "../src/result-envelope/index.js";
import { produceCanonicalGuestScannerResult } from "../src/scanner-output/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-result-commit-test",
  connectionString,
  max: 8,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const RESULT_KEY = Buffer.alloc(32, 0x62);
const TOKEN_KEY = Buffer.alloc(32, 0x31);
const WORKLOAD = "supervisor:guest-safe:v1";
const MAX_PAYLOAD_BYTES = 64 * 1_024;
let scanSequence = 0;

function rawScannerResult(host = "example.com", outcome = "PASS"): Buffer {
  return Buffer.from(
    JSON.stringify({
      observations: [{ check_id: "DNS_CAA", outcome }],
      candidate_findings: [],
      coverage: [
        {
          detector_group: "DNS_DOMAIN_POSTURE",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
      ],
      execution_metadata: {
        schema_version: 1,
        profile: "GUEST_SAFE",
        canonical_host: host,
        policy_id: "outscan-v1",
        policy_version: "1.0.0",
        duration_ms: 25,
        request_count: 1,
      },
      warnings: [],
    }),
  );
}

function signedSubmission(
  jobId: string,
  attemptId: string,
  fence: number,
  raw = rawScannerResult(),
  key = RESULT_KEY,
): AuthenticatedResultSubmission {
  const canonical = produceCanonicalGuestScannerResult(raw, MAX_PAYLOAD_BYTES);
  if (!canonical.ok) throw new Error(canonical.code);
  const now = Math.floor(Date.now() / 1_000);
  const signed = signResultEnvelope(
    {
      job_id: jobId,
      attempt_id: attemptId,
      fence,
      payload: canonical.result.read_canonical_payload(),
    },
    {
      now_unix_seconds: now,
      lifetime_seconds: 300,
      workload_identity: WORKLOAD,
      audience: RESULT_ENVELOPE_AUDIENCE,
      max_payload_bytes: MAX_PAYLOAD_BYTES,
      key_version: 2,
      key,
    },
  );
  if (!signed.ok) throw new Error(signed.code);
  return signed.signed.read_submission();
}

function committer() {
  return createPostgresGuestResultCommitter({
    pool,
    result_keyring: new Map([[2, RESULT_KEY]]),
    expected_workload_identity: WORKLOAD,
    expected_audience: RESULT_ENVELOPE_AUDIENCE,
    max_payload_bytes: MAX_PAYLOAD_BYTES,
    now_unix_seconds: () => Math.floor(Date.now() / 1_000),
  });
}

async function prepareRunningScan(
  options: {
    host?: string;
    leaseOffsetSeconds?: number;
    deadlineOffsetSeconds?: number;
  } = {},
): Promise<{ jobId: string; attemptId: string; fence: number }> {
  const clock = await pool.query<{ now: string }>(
    "SELECT floor(extract(epoch FROM clock_timestamp()))::bigint::text AS now",
  );
  const now = BigInt(clock.rows[0]?.now ?? "0");
  const jobId = `guest_commit_${++scanSequence}`;
  const attemptId = `${jobId}_attempt`;
  const fence = 7;
  const persistence = createPostgresGuestScanPersistence({
    pool,
    token_keyring: new Map([[1, TOKEN_KEY]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => jobId,
    create_token_nonce: () => Buffer.alloc(32, scanSequence),
  });
  const created = await persistence.createOrReplay({
    guest_session_scope: `sha256:${"1".repeat(64)}`,
    idempotency_key: `commit-${scanSequence}`,
    request_hash: `sha256:${"2".repeat(64)}`,
    canonical_target: options.host ?? "example.com",
    network_signal_digests: [`hmac-sha256:${"3".repeat(64)}`],
    trusted_now_unix_seconds: now - 10n,
  });
  if (!created.ok) throw new Error(created.code);
  const leaseOffset = options.leaseOffsetSeconds ?? 120;
  const deadlineOffset = options.deadlineOffsetSeconds ?? 300;
  await pool.query(
    `INSERT INTO guest_scan_attempts (
      id, guest_scan_id, attempt_no, monotonic_fence, lease_version,
      lease_expires_at, hard_deadline, attempt_state, created_at, updated_at
    ) VALUES (
      $1, $2, 1, $3, 0, NULL, to_timestamp($4::double precision),
      'CREATED', to_timestamp($5::double precision),
      to_timestamp($5::double precision)
    )`,
    [
      attemptId,
      jobId,
      fence,
      (now + BigInt(deadlineOffset)).toString(),
      (now - 9n).toString(),
    ],
  );
  await pool.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'LEASED', lease_version = 1,
      lease_expires_at = to_timestamp($2::double precision),
      updated_at = to_timestamp($3::double precision) WHERE id = $1`,
    [attemptId, (now + BigInt(leaseOffset)).toString(), (now - 8n).toString()],
  );
  await pool.query(
    `UPDATE guest_scans SET job_state = 'RUNNING', current_attempt_id = $2,
      current_fence = $3, updated_at = to_timestamp($4::double precision)
      WHERE id = $1`,
    [jobId, attemptId, fence, (now - 7n).toString()],
  );
  await pool.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'RUNNING',
      started_at = to_timestamp($2::double precision),
      updated_at = to_timestamp($2::double precision) WHERE id = $1`,
    [attemptId, (now - 7n).toString()],
  );
  return { jobId, attemptId, fence };
}

async function storedState(jobId: string) {
  const result = await pool.query<{
    job_state: string;
    attempt_state: string;
    result_count: string;
  }>(
    `SELECT s.job_state, a.attempt_state,
      (SELECT count(*)::text FROM guest_results r
       WHERE r.guest_scan_id = s.id) AS result_count
     FROM guest_scans s JOIN guest_scan_attempts a
       ON a.guest_scan_id = s.id AND a.id = s.current_attempt_id
     WHERE s.id = $1`,
    [jobId],
  );
  return result.rows[0];
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  scanSequence = 0;
  await pool.query(
    `TRUNCATE guest_abuse_reservations, guest_abuse_active_counters,
      guest_abuse_window_counters, guest_results, guest_scan_attempts,
      guest_scans CASCADE`,
  );
});

describe("PostgreSQL Guest terminal result commit", () => {
  it("atomically commits one authenticated canonical result", async () => {
    const running = await prepareRunningScan();
    const result = await committer().commit(
      signedSubmission(running.jobId, running.attemptId, running.fence),
    );
    expect(result).toEqual({
      ok: true,
      action: "PRIMARY_COMMIT",
      stored_new_result: true,
    });
    expect(await storedState(running.jobId)).toEqual({
      job_state: "SUCCEEDED",
      attempt_state: "SUCCEEDED",
      result_count: "1",
    });
    const stored = await pool.query<{ projection: Record<string, unknown> }>(
      "SELECT projection FROM guest_results WHERE guest_scan_id = $1",
      [running.jobId],
    );
    expect(stored.rows[0]?.projection).toMatchObject({
      schema_version: 1,
      canonical_host: "example.com",
    });
    const reservation = await pool.query<{
      release_reason: string;
      active_count: string;
    }>(
      `SELECT r.release_reason,
        (SELECT count(*)::text FROM guest_abuse_active_counters) AS active_count
       FROM guest_abuse_reservations r WHERE r.guest_scan_id = $1`,
      [running.jobId],
    );
    expect(reservation.rows[0]).toEqual({
      release_reason: "TERMINAL_RESULT",
      active_count: "0",
    });
  });

  it("acknowledges concurrent same-digest replay without a second write", async () => {
    const running = await prepareRunningScan();
    const submission = signedSubmission(
      running.jobId,
      running.attemptId,
      running.fence,
    );
    const results = await Promise.all([
      committer().commit(submission),
      committer().commit(submission),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        { ok: true, action: "PRIMARY_COMMIT", stored_new_result: true },
        { ok: true, action: "ALREADY_COMMITTED", stored_new_result: false },
      ]),
    );
    expect((await storedState(running.jobId))?.result_count).toBe("1");
  });

  it("rejects a different terminal digest and requests a security audit", async () => {
    const running = await prepareRunningScan();
    await committer().commit(
      signedSubmission(running.jobId, running.attemptId, running.fence),
    );
    const conflict = await committer().commit(
      signedSubmission(
        running.jobId,
        running.attemptId,
        running.fence,
        rawScannerResult("example.com", "ATTENTION"),
      ),
    );
    expect(conflict).toEqual({
      ok: false,
      code: "RESULT_DIGEST_CONFLICT",
      emit_security_audit: true,
    });
    expect((await storedState(running.jobId))?.result_count).toBe("1");
  });

  it("denies stale fences and expired leases without writes", async () => {
    const running = await prepareRunningScan({ leaseOffsetSeconds: -1 });
    const expired = await committer().commit(
      signedSubmission(running.jobId, running.attemptId, running.fence),
    );
    expect(expired).toEqual({
      ok: false,
      code: "LEASE_EXPIRED",
      emit_security_audit: false,
    });
    const stale = await committer().commit(
      signedSubmission(running.jobId, running.attemptId, running.fence + 1),
    );
    expect(stale).toEqual({
      ok: false,
      code: "STALE_ATTEMPT",
      emit_security_audit: false,
    });
    expect(await storedState(running.jobId)).toEqual({
      job_state: "RUNNING",
      attempt_state: "RUNNING",
      result_count: "0",
    });
  });

  it("rejects target substitution and unauthenticated submissions", async () => {
    const running = await prepareRunningScan();
    const wrongTarget = await committer().commit(
      signedSubmission(
        running.jobId,
        running.attemptId,
        running.fence,
        rawScannerResult("other.example"),
      ),
    );
    expect(wrongTarget).toEqual({
      ok: false,
      code: "RESULT_SUBMISSION_REJECTED",
      emit_security_audit: true,
    });
    const badMac = signedSubmission(
      running.jobId,
      running.attemptId,
      running.fence,
      rawScannerResult(),
      Buffer.alloc(32, 0xff),
    );
    expect(await committer().commit(badMac)).toEqual({
      ok: false,
      code: "RESULT_SUBMISSION_REJECTED",
      emit_security_audit: true,
    });
    expect((await storedState(running.jobId))?.result_count).toBe("0");
  });
});
