import type {
  AttemptEvent,
  AttemptState,
  JobEvent,
  JobState,
  TransitionDecision,
} from "./model.js";

const jobTransitions: Partial<
  Record<JobState, Partial<Record<JobEvent, JobState>>>
> = {
  QUEUED: {
    ATTEMPT_STARTED: "RUNNING",
    CANCEL: "CANCELLED",
    DEADLINE_EXCEEDED: "EXPIRED",
  },
  RUNNING: {
    PRIMARY_RESULT_COMMITTED: "SUCCEEDED",
    RETRY_BUDGET_EXHAUSTED: "FAILED",
    CANCEL: "CANCELLED",
    AUTHORIZATION_REVOKED: "CANCELLED",
    DEADLINE_EXCEEDED: "EXPIRED",
  },
};

const attemptTransitions: Partial<
  Record<AttemptState, Partial<Record<AttemptEvent, AttemptState>>>
> = {
  CREATED: {
    LEASE_ACQUIRED: "LEASED",
    JOB_CANCELLED_OR_EXPIRED: "CANCELLED",
  },
  LEASED: {
    SCANNER_STARTED: "RUNNING",
    LEASE_EXPIRED_OR_INVALIDATED: "SUPERSEDED",
  },
  RUNNING: {
    PRIMARY_RESULT_COMMITTED: "SUCCEEDED",
    SCANNER_OR_POLICY_FAILED: "FAILED",
    LEASE_EXPIRED_OR_INVALIDATED: "SUPERSEDED",
    HARD_DEADLINE_EXCEEDED: "TIMED_OUT",
    JOB_CANCELLED: "CANCELLED",
    NEWER_ATTEMPT_FENCE: "SUPERSEDED",
  },
};

export function transitionJob(
  current: JobState,
  event: JobEvent,
): TransitionDecision<JobState> {
  const next = jobTransitions[current]?.[event];
  return next
    ? { allowed: true, next }
    : { allowed: false, code: "INVALID_TRANSITION" };
}

export function transitionAttempt(
  current: AttemptState,
  event: AttemptEvent,
): TransitionDecision<AttemptState> {
  const next = attemptTransitions[current]?.[event];
  return next
    ? { allowed: true, next }
    : { allowed: false, code: "INVALID_TRANSITION" };
}
