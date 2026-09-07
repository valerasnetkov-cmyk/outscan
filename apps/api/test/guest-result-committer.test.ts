import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createPostgresGuestResultCommitter } from "../src/guest-persistence/index.js";
import {
  RESULT_ENVELOPE_AUDIENCE,
  RESULT_ENVELOPE_MAX_PAYLOAD_BYTES,
} from "../src/result-envelope/index.js";

function dependencies(pool: Pool, maxPayloadBytes = 1_024) {
  return {
    pool,
    result_keyring: new Map([[1, Buffer.alloc(32, 0x51)]]),
    expected_workload_identity: "supervisor:guest-safe:v1",
    expected_audience: RESULT_ENVELOPE_AUDIENCE,
    max_payload_bytes: maxPayloadBytes,
    now_unix_seconds: () => 1_800_000_000,
  };
}

describe("Guest result committer boundary", () => {
  it("rejects unauthenticated input before acquiring a database client", async () => {
    let connected = false;
    const pool = {
      connect: async () => {
        connected = true;
        throw new Error("must not connect");
      },
    } as unknown as Pool;
    const result = await createPostgresGuestResultCommitter(
      dependencies(pool),
    ).commit({});
    expect(result).toEqual({
      ok: false,
      code: "RESULT_SUBMISSION_REJECTED",
      emit_security_audit: true,
    });
    expect(connected).toBe(false);
  });

  it("rejects result payload budgets outside the envelope contract", () => {
    const pool = { connect: async () => undefined } as unknown as Pool;
    expect(() =>
      createPostgresGuestResultCommitter(
        dependencies(pool, RESULT_ENVELOPE_MAX_PAYLOAD_BYTES + 1),
      ),
    ).toThrow("INVALID_GUEST_PERSISTENCE_CONFIGURATION");
  });
});
