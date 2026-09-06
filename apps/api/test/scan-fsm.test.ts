import { describe, expect, it } from "vitest";

import {
  ATTEMPT_EVENTS,
  ATTEMPT_STATES,
  JOB_EVENTS,
  JOB_STATES,
  transitionAttempt,
  transitionJob,
  type AttemptEvent,
  type AttemptState,
  type JobEvent,
  type JobState,
} from "../src/scan-protocol/index.js";

const jobAllowed = new Map<string, JobState>([
  ["QUEUED:ATTEMPT_STARTED", "RUNNING"],
  ["QUEUED:CANCEL", "CANCELLED"],
  ["QUEUED:DEADLINE_EXCEEDED", "EXPIRED"],
  ["RUNNING:PRIMARY_RESULT_COMMITTED", "SUCCEEDED"],
  ["RUNNING:RETRY_BUDGET_EXHAUSTED", "FAILED"],
  ["RUNNING:CANCEL", "CANCELLED"],
  ["RUNNING:AUTHORIZATION_REVOKED", "CANCELLED"],
  ["RUNNING:DEADLINE_EXCEEDED", "EXPIRED"],
]);

const attemptAllowed = new Map<string, AttemptState>([
  ["CREATED:LEASE_ACQUIRED", "LEASED"],
  ["CREATED:JOB_CANCELLED_OR_EXPIRED", "CANCELLED"],
  ["LEASED:SCANNER_STARTED", "RUNNING"],
  ["LEASED:LEASE_EXPIRED_OR_INVALIDATED", "SUPERSEDED"],
  ["RUNNING:PRIMARY_RESULT_COMMITTED", "SUCCEEDED"],
  ["RUNNING:SCANNER_OR_POLICY_FAILED", "FAILED"],
  ["RUNNING:LEASE_EXPIRED_OR_INVALIDATED", "SUPERSEDED"],
  ["RUNNING:HARD_DEADLINE_EXCEEDED", "TIMED_OUT"],
  ["RUNNING:JOB_CANCELLED", "CANCELLED"],
  ["RUNNING:NEWER_ATTEMPT_FENCE", "SUPERSEDED"],
]);

describe("scan job FSM", () => {
  it("implements the complete ADR transition matrix", () => {
    for (const state of JOB_STATES) {
      for (const event of JOB_EVENTS) {
        const expected = jobAllowed.get(`${state}:${event}`);
        expect(transitionJob(state, event)).toEqual(
          expected
            ? { allowed: true, next: expected }
            : { allowed: false, code: "INVALID_TRANSITION" },
        );
      }
    }
  });

  it.each(["SUCCEEDED", "FAILED", "CANCELLED", "EXPIRED"] as JobState[])(
    "keeps terminal job %s immutable",
    (state) => {
      for (const event of JOB_EVENTS) {
        expect(transitionJob(state, event as JobEvent)).toMatchObject({
          allowed: false,
        });
      }
    },
  );
});

describe("scan attempt FSM", () => {
  it("implements the complete ADR transition matrix", () => {
    for (const state of ATTEMPT_STATES) {
      for (const event of ATTEMPT_EVENTS) {
        const expected = attemptAllowed.get(`${state}:${event}`);
        expect(transitionAttempt(state, event)).toEqual(
          expected
            ? { allowed: true, next: expected }
            : { allowed: false, code: "INVALID_TRANSITION" },
        );
      }
    }
  });

  it.each([
    "SUCCEEDED",
    "FAILED",
    "TIMED_OUT",
    "CANCELLED",
    "SUPERSEDED",
  ] as AttemptState[])("keeps terminal attempt %s immutable", (state) => {
    for (const event of ATTEMPT_EVENTS) {
      expect(transitionAttempt(state, event as AttemptEvent)).toMatchObject({
        allowed: false,
      });
    }
  });
});
