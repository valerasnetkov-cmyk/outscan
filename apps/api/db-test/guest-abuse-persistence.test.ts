import { Pool } from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import { createPostgresGuestScanPersistence } from "../src/guest-persistence/index.js";
import { releaseGuestAbuseReservation } from "../src/guest-persistence/postgres-abuse.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-abuse-persistence-test",
  connectionString,
  max: 8,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const NOW = 1_800_000_000n;
const SESSION = `sha256:${"1".repeat(64)}`;
const NETWORK = `hmac-sha256:${"2".repeat(64)}`;
const NEW_NETWORK = `hmac-sha256:${"a".repeat(64)}`;
let sequence = 0;

function repository() {
  return createPostgresGuestScanPersistence({
    pool,
    token_keyring: new Map([[1, Buffer.alloc(32, 0x21)]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => `guest_abuse_${++sequence}`,
    create_token_nonce: () => Buffer.alloc(32, sequence),
  });
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    guest_session_scope: SESSION,
    idempotency_key: "request-01",
    request_hash: `sha256:${"3".repeat(64)}`,
    canonical_target: "example.com",
    network_signal_digests: [NETWORK],
    trusted_now_unix_seconds: NOW,
    ...overrides,
  };
}

async function counts() {
  const windows = await pool.query<{ dimension: string; usage_count: number }>(
    `SELECT dimension, usage_count FROM guest_abuse_window_counters
     ORDER BY dimension`,
  );
  const active = await pool.query<{ dimension: string; active_count: number }>(
    `SELECT dimension, active_count FROM guest_abuse_active_counters
     ORDER BY dimension`,
  );
  const reservations = await pool.query<{ count: string; active: string }>(
    `SELECT count(*)::text AS count,
       count(*) FILTER (WHERE released_at IS NULL)::text AS active
     FROM guest_abuse_reservations`,
  );
  return {
    windows: windows.rows,
    active: active.rows,
    reservations: reservations.rows[0],
  };
}

async function cancelAndRelease(
  guestScanId: string,
  now: bigint,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE guest_scans SET job_state = 'CANCELLED',
        updated_at = to_timestamp($2::double precision)
       WHERE id = $1 AND job_state = 'QUEUED'`,
      [guestScanId, now.toString()],
    );
    if (
      !(await releaseGuestAbuseReservation(
        client,
        guestScanId,
        now,
        "CANCELLED",
      ))
    ) {
      throw new Error("release failed");
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
  await pool.query(
    `UPDATE guest_abuse_control SET service_state = 'OPEN',
      updated_at = to_timestamp($1::double precision) WHERE singleton = 1`,
    [NOW.toString()],
  );
});

afterEach(async () => {
  await pool.query(
    "UPDATE guest_abuse_control SET service_state = 'OPEN' WHERE singleton = 1",
  );
});

describe("PostgreSQL Guest abuse counters", () => {
  it("stores fixed digests and no raw network or browser identifiers", async () => {
    await repository().createOrReplay(request());
    const digests = await pool.query<{
      session_bytes: number;
      network_bytes: number;
    }>(
      `SELECT octet_length(guest_session_scope) AS session_bytes,
        octet_length(network_signal_digest) AS network_bytes
       FROM guest_abuse_reservations`,
    );
    expect(digests.rows[0]).toEqual({ session_bytes: 32, network_bytes: 32 });
    const forbidden = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name LIKE 'guest_abuse_%'
         AND column_name IN (
           'ip', 'ip_address', 'raw_ip', 'user_agent', 'browser_fingerprint'
         )`,
    );
    expect(forbidden.rows[0]?.count).toBe("0");
  });

  it("atomically reserves all six dimensions with a new GuestScan", async () => {
    expect(await repository().createOrReplay(request())).toMatchObject({
      ok: true,
      action: "CREATE",
    });
    expect(await counts()).toEqual({
      windows: [
        { dimension: "NETWORK_BURST", usage_count: 1 },
        { dimension: "NETWORK_DAILY", usage_count: 1 },
        { dimension: "SESSION_BURST", usage_count: 1 },
        { dimension: "SESSION_DAILY", usage_count: 1 },
      ],
      active: [
        { dimension: "NETWORK_ACTIVE", active_count: 1 },
        { dimension: "SESSION_ACTIVE", active_count: 1 },
      ],
      reservations: { count: "1", active: "1" },
    });
  });

  it("returns a live replay without consuming counters twice", async () => {
    const store = repository();
    const created = await store.createOrReplay(request());
    const replay = await store.createOrReplay(
      request({ trusted_now_unix_seconds: NOW + 30n }),
    );
    expect(created).toMatchObject({ ok: true, action: "CREATE" });
    expect(replay).toMatchObject({ ok: true, action: "REPLAY" });
    expect((await counts()).windows.map((item) => item.usage_count)).toEqual([
      1, 1, 1, 1,
    ]);
    expect((await counts()).reservations).toEqual({ count: "1", active: "1" });
  });

  it("serializes concurrent session admission to one active scan", async () => {
    const store = repository();
    const outcomes = await Promise.all([
      store.createOrReplay(request({ idempotency_key: "concurrent-1" })),
      store.createOrReplay(
        request({
          idempotency_key: "concurrent-2",
          request_hash: `sha256:${"4".repeat(64)}`,
        }),
      ),
    ]);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ok: true, action: "CREATE" }),
        {
          ok: false,
          code: "ABUSE_LIMIT_EXCEEDED",
          abuse_code: "SESSION_CONCURRENCY_LIMIT",
        },
      ]),
    );
    expect((await counts()).reservations).toEqual({ count: "1", active: "1" });
  });

  it("releases concurrency once and retains consumed windows", async () => {
    const created = await repository().createOrReplay(request());
    if (!created.ok) throw new Error(created.code);
    await cancelAndRelease(created.guest_scan_id, NOW + 10n);
    await cancelAndRelease(created.guest_scan_id, NOW + 11n);
    expect(await counts()).toEqual({
      windows: expect.arrayContaining([
        expect.objectContaining({ usage_count: 1 }),
      ]),
      active: [],
      reservations: { count: "1", active: "0" },
    });
  });

  it("enforces burst usage after concurrency is released", async () => {
    const store = repository();
    for (let index = 0; index < 3; index += 1) {
      const created = await store.createOrReplay(
        request({
          idempotency_key: `burst-${index}`,
          request_hash: `sha256:${String(index + 4).repeat(64)}`,
          trusted_now_unix_seconds: NOW + BigInt(index),
        }),
      );
      if (!created.ok) throw new Error(created.code);
      await cancelAndRelease(created.guest_scan_id, NOW + BigInt(index + 10));
    }
    expect(
      await store.createOrReplay(
        request({
          idempotency_key: "burst-denied",
          request_hash: `sha256:${"9".repeat(64)}`,
          trusted_now_unix_seconds: NOW + 20n,
        }),
      ),
    ).toEqual({
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: "SESSION_BURST_LIMIT",
      retry_after_seconds: 580,
    });
    expect((await counts()).windows.map((item) => item.usage_count)).toEqual([
      3, 3, 3, 3,
    ]);
  });

  it("aggregates retained-key counters and increments only the active digest", async () => {
    const oldDigest = Buffer.from(NETWORK.slice("hmac-sha256:".length), "hex");
    await pool.query(
      `INSERT INTO guest_abuse_window_counters (
        scope_kind, scope_digest, dimension, usage_count, reset_at, updated_at
      ) VALUES
        ('NETWORK', $1, 'NETWORK_BURST', 19,
          to_timestamp($2::double precision) + interval '10 minutes',
          to_timestamp($2::double precision)),
        ('NETWORK', $1, 'NETWORK_DAILY', 19,
          to_timestamp($2::double precision) + interval '24 hours',
          to_timestamp($2::double precision))`,
      [oldDigest, NOW.toString()],
    );
    const store = repository();
    const created = await store.createOrReplay(
      request({ network_signal_digests: [NEW_NETWORK, NETWORK] }),
    );
    expect(created).toMatchObject({ ok: true, action: "CREATE" });
    if (!created.ok) return;
    await cancelAndRelease(created.guest_scan_id, NOW + 1n);
    expect(
      await store.createOrReplay(
        request({
          guest_session_scope: `sha256:${"7".repeat(64)}`,
          idempotency_key: "rotated-network-limit",
          request_hash: `sha256:${"8".repeat(64)}`,
          network_signal_digests: [NEW_NETWORK, NETWORK],
          trusted_now_unix_seconds: NOW + 2n,
        }),
      ),
    ).toEqual({
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: "NETWORK_BURST_LIMIT",
      retry_after_seconds: 598,
    });
    const networkRows = await pool.query<{
      digest: string;
      dimension: string;
      usage_count: number;
    }>(
      `SELECT encode(scope_digest, 'hex') AS digest, dimension, usage_count
       FROM guest_abuse_window_counters WHERE scope_kind = 'NETWORK'
       ORDER BY digest, dimension`,
    );
    expect(networkRows.rows).toEqual([
      {
        digest: "2".repeat(64),
        dimension: "NETWORK_BURST",
        usage_count: 19,
      },
      {
        digest: "2".repeat(64),
        dimension: "NETWORK_DAILY",
        usage_count: 19,
      },
      {
        digest: "a".repeat(64),
        dimension: "NETWORK_BURST",
        usage_count: 1,
      },
      {
        digest: "a".repeat(64),
        dimension: "NETWORK_DAILY",
        usage_count: 1,
      },
    ]);
  });

  it("keeps live replay available while the server pause denies new scans", async () => {
    const store = repository();
    const created = await store.createOrReplay(request());
    await pool.query(
      "UPDATE guest_abuse_control SET service_state = 'PAUSED' WHERE singleton = 1",
    );
    expect(
      await store.createOrReplay(
        request({ trusted_now_unix_seconds: NOW + 1n }),
      ),
    ).toMatchObject({ ok: true, action: "REPLAY" });
    expect(
      await store.createOrReplay(
        request({
          guest_session_scope: `sha256:${"8".repeat(64)}`,
          idempotency_key: "paused-new",
        }),
      ),
    ).toEqual({
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: "GUEST_SCANNING_PAUSED",
    });
    expect(created).toMatchObject({ ok: true, action: "CREATE" });
  });
});
