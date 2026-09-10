import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createPostgresGuestScanPersistence } from "../src/guest-persistence/index.js";

const REQUEST = Object.freeze({
  guest_session_scope: `sha256:${"1".repeat(64)}`,
  idempotency_key: "request-01",
  request_hash: `sha256:${"2".repeat(64)}`,
  canonical_target: "example.com",
  network_signal_digests: [`hmac-sha256:${"3".repeat(64)}`],
  trusted_now_unix_seconds: 1_800_000_000n,
});

function dependencies(pool: Pool) {
  return {
    pool,
    token_keyring: new Map([[1, Buffer.alloc(32, 0x11)]]),
    active_token_key_version: 1,
    create_guest_scan_id: () => "guest_scan_01",
    create_token_nonce: () => Buffer.alloc(32, 0x22),
  };
}

describe("Guest persistence configuration boundary", () => {
  it("rejects malformed input before acquiring a database client", async () => {
    let connected = false;
    const pool = {
      connect: async () => {
        connected = true;
        throw new Error("must not connect");
      },
    } as unknown as Pool;
    const repository = createPostgresGuestScanPersistence(dependencies(pool));
    expect(
      await repository.createOrReplay({ ...REQUEST, extra: true }),
    ).toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(connected).toBe(false);
  });

  it("collapses database acquisition failure to one stable code", async () => {
    const pool = {
      connect: async () => {
        throw new Error("postgres host and credential detail");
      },
    } as unknown as Pool;
    const repository = createPostgresGuestScanPersistence(dependencies(pool));
    expect(await repository.createOrReplay(REQUEST)).toEqual({
      ok: false,
      code: "GUEST_PERSISTENCE_UNAVAILABLE",
    });
  });

  it("contains invalid and hostile dependency configuration", () => {
    const pool = { connect: async () => undefined } as unknown as Pool;
    expect(() =>
      createPostgresGuestScanPersistence({
        ...dependencies(pool),
        active_token_key_version: -1,
      }),
    ).toThrow("INVALID_GUEST_PERSISTENCE_CONFIGURATION");

    const hostile = {};
    Object.defineProperty(hostile, "pool", {
      enumerable: true,
      get: () => {
        throw new Error("secret configuration detail");
      },
    });
    expect(() =>
      createPostgresGuestScanPersistence(
        hostile as Parameters<typeof createPostgresGuestScanPersistence>[0],
      ),
    ).toThrow("INVALID_GUEST_PERSISTENCE_CONFIGURATION");
  });
});
