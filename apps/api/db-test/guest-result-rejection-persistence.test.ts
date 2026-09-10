import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import { createPostgresGuestResultRejectionSink } from "../src/guest-persistence/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-result-rejection-test",
  connectionString,
  max: 6,
});
const migrations = new URL("../db/migrations/", import.meta.url);

async function prepareRunningAttempt(): Promise<void> {
  const clock = await pool.query<{ now: string }>(
    "SELECT floor(extract(epoch FROM clock_timestamp()))::bigint::text AS now",
  );
  const now = BigInt(clock.rows[0]?.now ?? "0");
  const created = now - 10n;
  await pool.query(
    `INSERT INTO guest_scans (
      id, canonical_target, guest_session_scope, endpoint_operation,
      idempotency_key, request_hash, created_at, updated_at,
      idempotency_expires_at, deletion_deadline, job_state,
      policy_id, policy_version, profile, result_token_version,
      result_token_nonce, result_token_key_version, result_access_expires_at
    ) VALUES (
      'scan_rejection_01', 'example.com', decode(repeat('11', 32), 'hex'),
      'POST:/v1/public/scans', 'rejection-key',
      decode(repeat('22', 32), 'hex'), to_timestamp($1::double precision),
      to_timestamp($1::double precision),
      to_timestamp($1::double precision) + interval '30 minutes',
      to_timestamp($1::double precision) + interval '24 hours', 'QUEUED',
      'outscan-v1', '1.0.0', 'GUEST_SAFE', 1,
      decode(repeat('33', 32), 'hex'), 1,
      to_timestamp($1::double precision) + interval '30 minutes'
    )`,
    [created.toString()],
  );
  await pool.query(
    `INSERT INTO guest_scan_attempts (
      id, guest_scan_id, attempt_no, monotonic_fence, lease_version,
      lease_expires_at, hard_deadline, attempt_state, created_at, updated_at
    ) VALUES (
      'attempt_rejection_01', 'scan_rejection_01', 1, 5, 0, NULL,
      to_timestamp($2::double precision), 'CREATED',
      to_timestamp($1::double precision), to_timestamp($1::double precision)
    )`,
    [created.toString(), (now + 300n).toString()],
  );
  await pool.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'LEASED',
      lease_version = 1, lease_expires_at = to_timestamp($1::double precision),
      updated_at = to_timestamp($2::double precision)
     WHERE id = 'attempt_rejection_01'`,
    [(now + 120n).toString(), (created + 1n).toString()],
  );
  await pool.query(
    `UPDATE guest_scans SET job_state = 'RUNNING',
      current_attempt_id = 'attempt_rejection_01', current_fence = 5,
      updated_at = to_timestamp($1::double precision)
     WHERE id = 'scan_rejection_01'`,
    [(created + 2n).toString()],
  );
  await pool.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'RUNNING',
      started_at = to_timestamp($1::double precision),
      updated_at = to_timestamp($1::double precision)
     WHERE id = 'attempt_rejection_01'`,
    [(created + 2n).toString()],
  );
}

function event(code = "RESULT_DIGEST_CONFLICT") {
  return {
    schema_version: 1,
    guest_scan_id: "scan_rejection_01",
    attempt_id: "attempt_rejection_01",
    monotonic_fence: 5,
    rejection_code: code,
  };
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  await pool.query("TRUNCATE guest_scans CASCADE");
  await prepareRunningAttempt();
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL Guest result rejection events", () => {
  it("stores one minimized immutable security event", async () => {
    const sink = createPostgresGuestResultRejectionSink(pool);
    await expect(sink.record(event())).resolves.toEqual({
      ok: true,
      action: "RECORDED",
      security_relevant: true,
    });
    const rows = await pool.query<Record<string, unknown>>(
      "SELECT * FROM guest_result_rejection_events",
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      guest_scan_id: "scan_rejection_01",
      attempt_id: "attempt_rejection_01",
      rejection_code: "RESULT_DIGEST_CONFLICT",
      security_relevant: true,
    });
    expect(Object.keys(rows.rows[0] ?? {}).sort()).toEqual([
      "attempt_id",
      "guest_scan_id",
      "monotonic_fence",
      "occurred_at",
      "rejection_code",
      "security_relevant",
    ]);
    await expect(
      pool.query(
        "UPDATE guest_result_rejection_events SET security_relevant = false",
      ),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      pool.query(
        `INSERT INTO guest_result_rejection_events VALUES (
          'scan_rejection_01', 'attempt_rejection_01', 5, 'LEASE_EXPIRED',
          false, transaction_timestamp() + interval '25 hours'
        )`,
      ),
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("acknowledges duplicate and concurrent recording without extra rows", async () => {
    const sink = createPostgresGuestResultRejectionSink(pool);
    const results = await Promise.all([
      sink.record(event()),
      sink.record(event()),
    ]);
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ok: true, security_relevant: true }),
        expect.objectContaining({ ok: true, security_relevant: true }),
      ]),
    );
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_result_rejection_events",
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("classifies operational rejection and cascades with Guest retention", async () => {
    const sink = createPostgresGuestResultRejectionSink(pool);
    await expect(sink.record(event("LEASE_EXPIRED"))).resolves.toMatchObject({
      ok: true,
      security_relevant: false,
    });
    await pool.query("DELETE FROM guest_scans WHERE id = 'scan_rejection_01'");
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_result_rejection_events",
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it("fails closed for an identity not backed by the current Guest aggregate", async () => {
    const sink = createPostgresGuestResultRejectionSink(pool);
    await expect(
      sink.record({ ...event(), attempt_id: "attempt_unknown" }),
    ).resolves.toEqual({
      ok: false,
      code: "GUEST_PERSISTENCE_UNAVAILABLE",
    });
  });
});
