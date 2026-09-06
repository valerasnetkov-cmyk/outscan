import { describe, expect, it } from "vitest";

import {
  decideResultCommit,
  type ResultCommitSnapshot,
} from "../src/scan-protocol/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function snapshot(): ResultCommitSnapshot {
  return {
    job_state: "RUNNING",
    current_attempt_id: "attempt_01",
    current_fence: 7,
    attempt_state: "RUNNING",
    lease_expires_at_unix_seconds: 1_800,
    hard_deadline_unix_seconds: 2_000,
    accepted_result: null,
  };
}

function submission() {
  return {
    attempt_id: "attempt_01",
    fence: 7,
    payload_digest: DIGEST_A,
  };
}

describe("result commit decision", () => {
  it("allows exactly one primary commit from a current RUNNING attempt", () => {
    expect(decideResultCommit(snapshot(), submission(), 1_700)).toEqual({
      allowed: true,
      action: "PRIMARY_COMMIT",
      write_payload_effects: true,
      emit_security_audit: false,
      next_job_state: "SUCCEEDED",
      next_attempt_state: "SUCCEEDED",
    });
  });

  it.each([
    ["attempt_id", "attempt_02"],
    ["fence", 8],
  ])("denies stale %s", (field, value) => {
    expect(
      decideResultCommit(
        snapshot(),
        { ...submission(), [field]: value },
        1_700,
      ),
    ).toMatchObject({
      allowed: false,
      code: "STALE_ATTEMPT",
      write_payload_effects: false,
    });
  });

  it("requires a RUNNING job and attempt", () => {
    expect(
      decideResultCommit(
        { ...snapshot(), job_state: "FAILED" },
        submission(),
        1_700,
      ),
    ).toMatchObject({ allowed: false, code: "JOB_NOT_RUNNING" });

    expect(
      decideResultCommit(
        { ...snapshot(), attempt_state: "LEASED" },
        submission(),
        1_700,
      ),
    ).toMatchObject({ allowed: false, code: "ATTEMPT_NOT_RUNNING" });
  });

  it("denies primary commit at lease or deadline equality", () => {
    expect(decideResultCommit(snapshot(), submission(), 1_800)).toMatchObject({
      allowed: false,
      code: "LEASE_EXPIRED",
    });

    expect(
      decideResultCommit(
        { ...snapshot(), lease_expires_at_unix_seconds: 2_100 },
        submission(),
        2_000,
      ),
    ).toMatchObject({
      allowed: false,
      code: "ATTEMPT_DEADLINE_EXCEEDED",
    });
  });

  it("rejects a running job that already has an accepted result", () => {
    expect(
      decideResultCommit(
        { ...snapshot(), accepted_result: submission() },
        submission(),
        1_700,
      ),
    ).toMatchObject({
      allowed: false,
      code: "INVALID_STATE",
      write_payload_effects: false,
      emit_security_audit: true,
    });
  });

  it("acknowledges terminal same-digest replay without writes", () => {
    expect(
      decideResultCommit(
        {
          ...snapshot(),
          job_state: "SUCCEEDED",
          attempt_state: "SUCCEEDED",
          accepted_result: submission(),
        },
        submission(),
        5_000,
      ),
    ).toEqual({
      allowed: true,
      action: "ALREADY_COMMITTED",
      write_payload_effects: false,
      emit_security_audit: false,
    });
  });

  it("audits terminal different-digest conflict without writes", () => {
    expect(
      decideResultCommit(
        {
          ...snapshot(),
          job_state: "SUCCEEDED",
          attempt_state: "SUCCEEDED",
          accepted_result: submission(),
        },
        { ...submission(), payload_digest: DIGEST_B },
        5_000,
      ),
    ).toEqual({
      allowed: false,
      code: "RESULT_DIGEST_CONFLICT",
      write_payload_effects: false,
      emit_security_audit: true,
    });
  });

  it("denies terminal replay from another attempt or fence", () => {
    const succeeded = {
      ...snapshot(),
      job_state: "SUCCEEDED" as const,
      attempt_state: "SUCCEEDED" as const,
      accepted_result: submission(),
    };

    expect(
      decideResultCommit(
        succeeded,
        { ...submission(), attempt_id: "attempt_02" },
        5_000,
      ),
    ).toMatchObject({ allowed: false, code: "STALE_ATTEMPT" });
    expect(
      decideResultCommit(succeeded, { ...submission(), fence: 8 }, 5_000),
    ).toMatchObject({ allowed: false, code: "STALE_ATTEMPT" });
  });

  it("rejects malformed or internally inconsistent state", () => {
    expect(
      decideResultCommit(
        snapshot(),
        { ...submission(), payload_digest: "bad" },
        1_700,
      ),
    ).toMatchObject({ allowed: false, code: "INVALID_STATE" });
    expect(
      decideResultCommit(
        { ...snapshot(), job_state: "SUCCEEDED", accepted_result: null },
        submission(),
        5_000,
      ),
    ).toMatchObject({
      allowed: false,
      code: "INVALID_STATE",
      emit_security_audit: true,
    });
  });
});
