import type { Pool } from "pg";
import { describe, expect, it } from "vitest";

import {
  createPostgresGuestResultRejectionSink,
  guestResultRejectionIsSecurityRelevant,
} from "../src/guest-persistence/index.js";

describe("Guest result rejection sink boundary", () => {
  it.each([
    "RESULT_SUBMISSION_REJECTED",
    "INVALID_STATE",
    "RESULT_DIGEST_CONFLICT",
  ] as const)("classifies %s as security-relevant", (code) => {
    expect(guestResultRejectionIsSecurityRelevant(code)).toBe(true);
  });

  it("rejects malformed input before database acquisition", async () => {
    let connected = false;
    const pool = {
      connect: async () => {
        connected = true;
        throw new Error("must not connect");
      },
    } as unknown as Pool;
    const sink = createPostgresGuestResultRejectionSink(pool);
    await expect(
      sink.record({
        schema_version: 1,
        guest_scan_id: "scan_01",
        attempt_id: "attempt_01",
        monotonic_fence: 1,
        rejection_code: "UNKNOWN",
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(connected).toBe(false);
  });

  it("rejects extra data that could leak target or result content", async () => {
    const pool = { connect: async () => undefined } as unknown as Pool;
    await expect(
      createPostgresGuestResultRejectionSink(pool).record({
        schema_version: 1,
        guest_scan_id: "scan_01",
        attempt_id: "attempt_01",
        monotonic_fence: 1,
        rejection_code: "RESULT_DIGEST_CONFLICT",
        target: "example.com",
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_REQUEST" });
  });
});
