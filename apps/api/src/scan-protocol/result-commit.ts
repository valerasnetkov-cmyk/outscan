import type {
  ResultCommitDecision,
  ResultCommitDenyCode,
  ResultCommitSnapshot,
  ResultSubmissionIdentity,
} from "./model.js";

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;

function deny(
  code: ResultCommitDenyCode,
  emitSecurityAudit = false,
): ResultCommitDecision {
  return {
    allowed: false,
    code,
    write_payload_effects: false,
    emit_security_audit: emitSecurityAudit,
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function hasValidIdentity(identity: ResultSubmissionIdentity): boolean {
  return (
    ID_PATTERN.test(identity.attempt_id) &&
    isPositiveSafeInteger(identity.fence) &&
    DIGEST_PATTERN.test(identity.payload_digest)
  );
}

function hasValidSnapshot(snapshot: ResultCommitSnapshot): boolean {
  return (
    ID_PATTERN.test(snapshot.current_attempt_id) &&
    isPositiveSafeInteger(snapshot.current_fence) &&
    isPositiveSafeInteger(snapshot.lease_expires_at_unix_seconds) &&
    isPositiveSafeInteger(snapshot.hard_deadline_unix_seconds) &&
    (!snapshot.accepted_result || hasValidIdentity(snapshot.accepted_result))
  );
}

function sameAttemptAndFence(
  accepted: ResultSubmissionIdentity,
  submitted: ResultSubmissionIdentity,
): boolean {
  return (
    accepted.attempt_id === submitted.attempt_id &&
    accepted.fence === submitted.fence
  );
}

export function decideResultCommit(
  snapshot: ResultCommitSnapshot,
  submission: ResultSubmissionIdentity,
  nowUnixSeconds: number,
): ResultCommitDecision {
  if (
    !hasValidSnapshot(snapshot) ||
    !hasValidIdentity(submission) ||
    !isPositiveSafeInteger(nowUnixSeconds)
  ) {
    return deny("INVALID_STATE");
  }

  if (snapshot.job_state === "SUCCEEDED") {
    const accepted = snapshot.accepted_result;
    if (!accepted) return deny("INVALID_STATE", true);
    if (!sameAttemptAndFence(accepted, submission)) {
      return deny("STALE_ATTEMPT");
    }
    if (accepted.payload_digest !== submission.payload_digest) {
      return deny("RESULT_DIGEST_CONFLICT", true);
    }

    return {
      allowed: true,
      action: "ALREADY_COMMITTED",
      write_payload_effects: false,
      emit_security_audit: false,
    };
  }

  if (snapshot.job_state !== "RUNNING") return deny("JOB_NOT_RUNNING");
  if (snapshot.accepted_result) return deny("INVALID_STATE", true);

  if (
    submission.attempt_id !== snapshot.current_attempt_id ||
    submission.fence !== snapshot.current_fence
  ) {
    return deny("STALE_ATTEMPT");
  }

  if (snapshot.attempt_state !== "RUNNING") {
    return deny("ATTEMPT_NOT_RUNNING");
  }

  if (nowUnixSeconds >= snapshot.lease_expires_at_unix_seconds) {
    return deny("LEASE_EXPIRED");
  }

  if (nowUnixSeconds >= snapshot.hard_deadline_unix_seconds) {
    return deny("ATTEMPT_DEADLINE_EXCEEDED");
  }

  return {
    allowed: true,
    action: "PRIMARY_COMMIT",
    write_payload_effects: true,
    emit_security_audit: false,
    next_job_state: "SUCCEEDED",
    next_attempt_state: "SUCCEEDED",
  };
}
