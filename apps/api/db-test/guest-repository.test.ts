import { Pool, type PoolClient } from "pg";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestResultReadStore,
  createPostgresGuestScanPersistence,
  type GuestPersistenceDependencies,
} from "../src/guest-persistence/index.js";
import { readAuthorizedGuestResult } from "../src/guest-scan/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-repository-test",
  connectionString,
  max: 8,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const NOW = 1_800_000_000n;
const KEY = Buffer.alloc(32, 0x44);
const SCOPE = `sha256:${"1".repeat(64)}`;
const OTHER_SCOPE = `sha256:${"9".repeat(64)}`;
const REQUEST_HASH = `sha256:${"2".repeat(64)}`;
const NETWORK = `hmac-sha256:${"3".repeat(64)}`;
const PAYLOAD_DIGEST = Buffer.alloc(32, 0xdd);
let sequence = 0;

function dependencies(
  overrides: Partial<GuestPersistenceDependencies> = {},
): GuestPersistenceDependencies {
  return {
    pool,
    token_keyring: new Map([[4, KEY]]),
    active_token_key_version: 4,
    create_guest_scan_id: () => `guest_repo_${++sequence}`,
    create_token_nonce: () => Buffer.alloc(32, sequence),
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    guest_session_scope: SCOPE,
    idempotency_key: "request-01",
    request_hash: REQUEST_HASH,
    canonical_target: "example.com",
    network_signal_digests: [NETWORK],
    trusted_now_unix_seconds: NOW,
    ...overrides,
  };
}

function projection() {
  return {
    schema_version: 1,
    canonical_host: "example.com",
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
  guestScanId: string,
): Promise<void> {
  const attemptId = `${guestScanId}_attempt`;
  await client.query(
    `INSERT INTO guest_scan_attempts (
      id, guest_scan_id, attempt_no, monotonic_fence, lease_version,
      lease_expires_at, hard_deadline, attempt_state, created_at,
      updated_at, started_at, finished_at
    ) VALUES (
      $1, $2, 1, 5, 0, NULL,
      to_timestamp($3::double precision) + interval '5 minutes', 'CREATED',
      to_timestamp($3::double precision) + interval '1 second',
      to_timestamp($3::double precision) + interval '1 second', NULL, NULL
    )`,
    [attemptId, guestScanId, NOW.toString()],
  );
  await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'LEASED', lease_version = 1,
      lease_expires_at = to_timestamp($2::double precision) + interval '2 minutes',
      updated_at = to_timestamp($2::double precision) + interval '2 seconds'
     WHERE id = $1`,
    [attemptId, NOW.toString()],
  );
  await client.query(
    `UPDATE guest_scans SET job_state = 'RUNNING', current_attempt_id = $2,
      current_fence = 5,
      updated_at = to_timestamp($3::double precision) + interval '3 seconds'
     WHERE id = $1`,
    [guestScanId, attemptId, NOW.toString()],
  );
  await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'RUNNING',
      started_at = to_timestamp($2::double precision) + interval '3 seconds',
      updated_at = to_timestamp($2::double precision) + interval '3 seconds'
     WHERE id = $1`,
    [attemptId, NOW.toString()],
  );
  await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'SUCCEEDED',
      finished_at = to_timestamp($2::double precision) + interval '10 seconds',
      updated_at = to_timestamp($2::double precision) + interval '10 seconds'
     WHERE id = $1`,
    [attemptId, NOW.toString()],
  );
  await client.query(
    `UPDATE guest_scans SET job_state = 'SUCCEEDED',
      accepted_attempt_id = $2, accepted_fence = 5,
      accepted_payload_digest = $3,
      updated_at = to_timestamp($4::double precision) + interval '10 seconds'
     WHERE id = $1`,
    [guestScanId, attemptId, PAYLOAD_DIGEST, NOW.toString()],
  );
  await client.query(
    `INSERT INTO guest_results (
      guest_scan_id, accepted_attempt_id, accepted_fence,
      payload_digest, completed_at, projection
    ) VALUES (
      $1, $2, 5, $3,
      to_timestamp($4::double precision) + interval '10 seconds', $5
    )`,
    [guestScanId, attemptId, PAYLOAD_DIGEST, NOW.toString(), projection()],
  );
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  sequence = 0;
  await pool.query(
    `TRUNCATE guest_abuse_reservations, guest_abuse_active_counters,
      guest_abuse_window_counters, guest_results, guest_scan_attempts,
      guest_scans CASCADE`,
  );
});

describe("PostgreSQL Guest repository", () => {
  it("creates and replays one stable scan/token without extending expiry", async () => {
    const repository = createPostgresGuestScanPersistence(dependencies());
    const created = await repository.createOrReplay(request());
    expect(created).toMatchObject({ ok: true, action: "CREATE" });
    const replayed = await repository.createOrReplay(
      request({ trusted_now_unix_seconds: NOW + 60n }),
    );
    expect(replayed).toEqual({
      ...created,
      action: "REPLAY",
      result_token_expires_in_seconds: 1_740,
    });
    const stored = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_scans",
    );
    expect(stored.rows[0]?.count).toBe("1");
  });

  it("returns a conflict for the same live key with another request hash", async () => {
    const repository = createPostgresGuestScanPersistence(dependencies());
    await repository.createOrReplay(request());
    expect(
      await repository.createOrReplay(
        request({ request_hash: `sha256:${"3".repeat(64)}` }),
      ),
    ).toEqual({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("keeps identical keys independent across Guest sessions", async () => {
    const repository = createPostgresGuestScanPersistence(dependencies());
    const first = await repository.createOrReplay(request());
    const second = await repository.createOrReplay(
      request({ guest_session_scope: OTHER_SCOPE }),
    );
    expect(first).toMatchObject({ ok: true, action: "CREATE" });
    expect(second).toMatchObject({ ok: true, action: "CREATE" });
    if (first.ok && second.ok)
      expect(first.guest_scan_id).not.toBe(second.guest_scan_id);
  });

  it("rereads the concurrent unique-key winner", async () => {
    const repository = createPostgresGuestScanPersistence(dependencies());
    const results = await Promise.all([
      repository.createOrReplay(request()),
      repository.createOrReplay(request()),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.map((result) => result.ok && result.action).sort()).toEqual([
      "CREATE",
      "REPLAY",
    ]);
    if (results[0]?.ok && results[1]?.ok) {
      expect(results[0].guest_scan_id).toBe(results[1].guest_scan_id);
      expect(results[0].result_token).toBe(results[1].result_token);
    }
  });

  it("replaces an expired idempotency row in one transaction", async () => {
    const repository = createPostgresGuestScanPersistence(dependencies());
    const original = await repository.createOrReplay(
      request({ trusted_now_unix_seconds: NOW - 1_800n }),
    );
    const replacement = await repository.createOrReplay(
      request({ request_hash: `sha256:${"3".repeat(64)}` }),
    );
    expect(original).toMatchObject({ ok: true, action: "CREATE" });
    expect(replacement).toMatchObject({
      ok: true,
      action: "REPLACE_EXPIRED",
    });
    if (original.ok && replacement.ok)
      expect(replacement.guest_scan_id).not.toBe(original.guest_scan_id);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_scans",
    );
    expect(count.rows[0]?.count).toBe("1");
    const active = await pool.query<{ active_count: number }>(
      "SELECT active_count FROM guest_abuse_active_counters ORDER BY dimension",
    );
    expect(active.rows.map((row) => row.active_count)).toEqual([1, 1]);
  });

  it("fails closed without token material and writes nothing", async () => {
    const repository = createPostgresGuestScanPersistence(
      dependencies({ token_keyring: new Map() }),
    );
    expect(await repository.createOrReplay(request())).toEqual({
      ok: false,
      code: "RESULT_TOKEN_UNAVAILABLE",
    });
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_scans",
    );
    expect(count.rows[0]?.count).toBe("0");
  });

  it.each([
    { guest_session_scope: "sha256:invalid" },
    { idempotency_key: "contains space" },
    { request_hash: "invalid" },
    { canonical_target: "https://example.com" },
    { canonical_target: "Example.com" },
    { network_signal_digests: ["192.0.2.1"] },
    { network_signal_digests: [] },
    { network_signal_digests: [NETWORK, NETWORK] },
    { network_signal_digests: [NETWORK, NETWORK, NETWORK, NETWORK] },
    { trusted_now_unix_seconds: -1n },
    { extra: true },
  ])(
    "rejects invalid persistence input without a query %#",
    async (override) => {
      let connected = false;
      const rejectingPool = {
        connect: async () => {
          connected = true;
          throw new Error("must not connect");
        },
      } as unknown as Pool;
      const repository = createPostgresGuestScanPersistence(
        dependencies({ pool: rejectingPool }),
      );
      expect(await repository.createOrReplay(request(override))).toEqual({
        ok: false,
        code: "INVALID_REQUEST",
      });
      expect(connected).toBe(false);
    },
  );

  it("loads one strict row and composes authorized sanitized result read", async () => {
    const deps = dependencies();
    const repository = createPostgresGuestScanPersistence(deps);
    const created = await repository.createOrReplay(request());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await commitResult(client, created.guest_scan_id);
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    const result = await readAuthorizedGuestResult(
      {
        authorization_header: `Bearer ${created.result_token}`,
        route_guest_scan_id: created.guest_scan_id,
        query: {},
        now_unix_seconds: NOW + 20n,
      },
      {
        store: createPostgresGuestResultReadStore(pool),
        token_keyring: deps.token_keyring,
      },
    );
    expect(result).toMatchObject({
      ok: true,
      body: {
        guest_scan_id: created.guest_scan_id,
        canonical_host: "example.com",
      },
    });
  });
});
