import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "../src/db/index.js";
import {
  createPostgresGuestSessionRevocationStore,
  type GuestSessionRevocationStore,
} from "../src/guest-persistence/index.js";

const connectionString = process.env.OUTSCAN_TEST_DATABASE_URL;
if (!connectionString) throw new Error("OUTSCAN_TEST_DATABASE_URL is required");

const pool = new Pool({
  application_name: "outscan-guest-session-revocation-test",
  connectionString,
  max: 4,
});
const migrations = new URL("../db/migrations/", import.meta.url);
const SCOPE_A = `sha256:${"aa".repeat(32)}`;
const SCOPE_B = `sha256:${"bb".repeat(32)}`;
let store: GuestSessionRevocationStore;

beforeAll(async () => {
  await migrateDatabase(pool, migrations);
  store = createPostgresGuestSessionRevocationStore(pool);
});

beforeEach(async () => {
  await pool.query("TRUNCATE guest_session_revocations");
});

afterAll(async () => {
  await pool.end();
});

describe("PostgreSQL Guest session revocation store", () => {
  it("records one digest-only 24-hour revocation idempotently", async () => {
    await expect(store.is_revoked(SCOPE_A)).resolves.toBe(false);
    const outcomes = await Promise.all([
      store.revoke({ guest_session_scope: SCOPE_A }),
      store.revoke({ guest_session_scope: SCOPE_A }),
    ]);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { ok: true, action: "RECORDED" },
        { ok: true, action: "ALREADY_REVOKED" },
      ]),
    );
    await expect(store.is_revoked(SCOPE_A)).resolves.toBe(true);

    const row = await pool.query<{
      scope_bytes: number;
      lifetime_seconds: string;
    }>(
      `SELECT octet_length(guest_session_scope) AS scope_bytes,
         extract(epoch FROM expires_at - revoked_at)::bigint::text
           AS lifetime_seconds
       FROM guest_session_revocations`,
    );
    expect(row.rows).toEqual([{ scope_bytes: 32, lifetime_seconds: "86400" }]);
  });

  it("contains no raw Guest or tenant identity columns", async () => {
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'guest_session_revocations'
       ORDER BY column_name`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "expires_at",
      "guest_session_scope",
      "revoked_at",
    ]);
  });

  it("replaces an expired row at the exact boundary", async () => {
    await pool.query(
      `INSERT INTO guest_session_revocations VALUES (
         decode(repeat('aa', 32), 'hex'),
         date_trunc('second', transaction_timestamp()) - interval '24 hours',
         date_trunc('second', transaction_timestamp())
       )`,
    );
    await expect(store.is_revoked(SCOPE_A)).resolves.toBe(false);
    await expect(
      store.revoke({ guest_session_scope: SCOPE_A }),
    ).resolves.toEqual({ ok: true, action: "RECORDED" });
    await expect(store.is_revoked(SCOPE_A)).resolves.toBe(true);
  });

  it("prunes expired rows in bounded batches", async () => {
    await pool.query(
      `INSERT INTO guest_session_revocations VALUES
       (decode(repeat('aa', 32), 'hex'),
        date_trunc('second', transaction_timestamp()) - interval '48 hours',
        date_trunc('second', transaction_timestamp()) - interval '24 hours'),
       (decode(repeat('bb', 32), 'hex'),
        date_trunc('second', transaction_timestamp()),
        date_trunc('second', transaction_timestamp()) + interval '24 hours')`,
    );
    await expect(store.pruneExpired({ batch_size: 1 })).resolves.toEqual({
      ok: true,
      deleted: 1,
      more_work: false,
    });
    await expect(store.is_revoked(SCOPE_A)).resolves.toBe(false);
    await expect(store.is_revoked(SCOPE_B)).resolves.toBe(true);
  });

  it("rejects malformed commands and contains database failure", async () => {
    await expect(
      store.revoke({ guest_session_scope: SCOPE_A, raw_cookie: "secret" }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
    await expect(store.is_revoked("sha256:not-a-digest")).resolves.toBeNull();
    await expect(store.pruneExpired({ batch_size: 0 })).resolves.toEqual({
      ok: false,
      code: "INVALID_REQUEST",
    });

    const unavailable = createPostgresGuestSessionRevocationStore({
      connect: async () => {
        throw new Error("database detail");
      },
      query: async () => {
        throw new Error("database detail");
      },
    } as unknown as Pool);
    await expect(unavailable.is_revoked(SCOPE_A)).resolves.toBeNull();
    await expect(
      unavailable.revoke({ guest_session_scope: SCOPE_A }),
    ).resolves.toEqual({
      ok: false,
      code: "GUEST_REVOCATION_UNAVAILABLE",
    });
  });
});
