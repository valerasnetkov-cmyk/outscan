import { Pool } from "pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createGuestSessionCookie,
  deriveGuestSessionScope,
  GUEST_SESSION_COOKIE_NAME,
} from "../src/guest-crypto/index.js";
import {
  createPostgresGuestScanPersistence,
  createPostgresGuestSessionRevocationStore,
} from "../src/guest-persistence/index.js";
import {
  createGuestScanCreationService,
  type GuestScanCreationDependencies,
} from "../src/guest-scan/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-scan-create-test",
  connectionString,
  max: 4,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const NOW = 1_800_000_000;
const SESSION_KEY = Buffer.alloc(32, 0x11);
const RESULT_KEY = Buffer.alloc(32, 0x22);
const NETWORK_KEY = Buffer.alloc(32, 0x33);
const SESSION_ID = Buffer.alloc(32, 0x44);
let sequence = 0;

function request(
  idempotencyKey: string,
  domain = "EXAMPLE.com.",
  address = "198.51.100.10",
) {
  const cookie = createGuestSessionCookie(7, SESSION_KEY, SESSION_ID);
  return {
    body: { domain },
    cookie_header: `${GUEST_SESSION_COOKIE_NAME}=${cookie}`,
    idempotency_key_header: idempotencyKey,
    socket_remote_address: address,
    x_forwarded_for: undefined,
  };
}

function harness(
  isGuestSessionRevoked: GuestScanCreationDependencies["is_guest_session_revoked"] = () =>
    false,
) {
  const enqueue = vi.fn(async (guestScanId: unknown) => ({
    schema_version: 1,
    guest_scan_id: guestScanId,
  }));
  const persistence = createPostgresGuestScanPersistence({
    pool,
    token_keyring: new Map([[1, RESULT_KEY]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => `guest_create_${++sequence}`,
    create_token_nonce: () => Buffer.alloc(32, sequence),
  });
  const dependencies: GuestScanCreationDependencies = {
    guest_session_key_provider: {
      get_current_keys: async () => ({
        active_key_version: 7,
        keys: new Map([[7, SESSION_KEY]]),
      }),
    },
    is_guest_session_revoked: isGuestSessionRevoked,
    trusted_proxy_cidrs: [],
    network_hmac_keyring: new Map([[4, NETWORK_KEY]]),
    active_network_hmac_key_version: 4,
    persistence,
    queue: { enqueue },
    now_unix_seconds: () => NOW,
  };
  return {
    create: createGuestScanCreationService(dependencies),
    enqueue,
  };
}

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
});

beforeEach(async () => {
  sequence = 0;
  await pool.query(
    `TRUNCATE guest_results, guest_scan_attempts, guest_abuse_reservations,
      guest_abuse_active_counters, guest_abuse_window_counters,
      guest_session_revocations, guest_scans
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

describe("Guest scan creation with PostgreSQL", () => {
  it("replays one stable scan/token across a changed network signal", async () => {
    const test = harness();
    const first = await test.create(request("same-key"));
    const replay = await test.create(
      request("same-key", "example.com", "203.0.113.25"),
    );
    expect(first).toMatchObject({ ok: true, status_code: 202 });
    expect(replay).toMatchObject({
      ok: true,
      status_code: 200,
      body: first.body,
    });
    expect(test.enqueue).toHaveBeenCalledTimes(2);
    expect(test.enqueue).toHaveBeenNthCalledWith(1, "guest_create_1");
    expect(test.enqueue).toHaveBeenNthCalledWith(2, "guest_create_1");
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM guest_scans",
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("returns conflict for a changed canonical request without enqueue", async () => {
    const test = harness();
    await test.create(request("same-key"));
    const conflict = await test.create(request("same-key", "other.example"));
    expect(conflict).toMatchObject({
      ok: false,
      status_code: 409,
      body: { error: { code: "IDEMPOTENCY_KEY_REUSED" } },
    });
    expect(test.enqueue).toHaveBeenCalledTimes(1);
  });

  it("denies a session revoked by the PostgreSQL provider", async () => {
    const revocations = createPostgresGuestSessionRevocationStore(pool);
    await revocations.revoke({
      guest_session_scope: deriveGuestSessionScope(SESSION_ID),
    });
    const test = harness(revocations.is_revoked);

    await expect(test.create(request("revoked-key"))).resolves.toMatchObject({
      ok: false,
      status_code: 401,
      body: { error: { code: "GUEST_SESSION_INVALID" } },
    });
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it("maps transactional concurrency denial to a minimized 429", async () => {
    const test = harness();
    await test.create(request("first-key"));
    const denied = await test.create(request("second-key"));
    expect(denied).toEqual({
      ok: false,
      status_code: 429,
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
      body: { error: { code: "GUEST_SCAN_LIMIT_EXCEEDED" } },
    });
    expect(test.enqueue).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(denied)).not.toContain("SESSION_CONCURRENCY_LIMIT");
  });
});
