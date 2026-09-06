export const JOB_STATES = [
  "QUEUED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const JOB_EVENTS = [
  "ATTEMPT_STARTED",
  "CANCEL",
  "AUTHORIZATION_REVOKED",
  "DEADLINE_EXCEEDED",
  "PRIMARY_RESULT_COMMITTED",
  "RETRY_BUDGET_EXHAUSTED",
] as const;

export type JobEvent = (typeof JOB_EVENTS)[number];

export const ATTEMPT_STATES = [
  "CREATED",
  "LEASED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "SUPERSEDED",
] as const;

export type AttemptState = (typeof ATTEMPT_STATES)[number];

export const ATTEMPT_EVENTS = [
  "LEASE_ACQUIRED",
  "JOB_CANCELLED_OR_EXPIRED",
  "SCANNER_STARTED",
  "LEASE_EXPIRED_OR_INVALIDATED",
  "PRIMARY_RESULT_COMMITTED",
  "SCANNER_OR_POLICY_FAILED",
  "HARD_DEADLINE_EXCEEDED",
  "JOB_CANCELLED",
  "NEWER_ATTEMPT_FENCE",
] as const;

export type AttemptEvent = (typeof ATTEMPT_EVENTS)[number];

export type TransitionDecision<State> =
  | { allowed: true; next: State }
  | { allowed: false; code: "INVALID_TRANSITION" };

export interface AcceptedResultIdentity {
  attempt_id: string;
  fence: number;
  payload_digest: string;
}

export interface ResultCommitSnapshot {
  job_state: JobState;
  current_attempt_id: string;
  current_fence: number;
  attempt_state: AttemptState;
  lease_expires_at_unix_seconds: number;
  hard_deadline_unix_seconds: number;
  accepted_result: AcceptedResultIdentity | null;
}

export interface ResultSubmissionIdentity {
  attempt_id: string;
  fence: number;
  payload_digest: string;
}

export type ResultCommitDenyCode =
  | "INVALID_STATE"
  | "JOB_NOT_RUNNING"
  | "ATTEMPT_NOT_RUNNING"
  | "STALE_ATTEMPT"
  | "LEASE_EXPIRED"
  | "ATTEMPT_DEADLINE_EXCEEDED"
  | "RESULT_DIGEST_CONFLICT";

export type ResultCommitDecision =
  | {
      allowed: true;
      action: "PRIMARY_COMMIT";
      write_payload_effects: true;
      emit_security_audit: false;
      next_job_state: "SUCCEEDED";
      next_attempt_state: "SUCCEEDED";
    }
  | {
      allowed: true;
      action: "ALREADY_COMMITTED";
      write_payload_effects: false;
      emit_security_audit: false;
    }
  | {
      allowed: false;
      code: ResultCommitDenyCode;
      write_payload_effects: false;
      emit_security_audit: boolean;
    };
