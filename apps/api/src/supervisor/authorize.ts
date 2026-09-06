import { authorizeScannerExecution } from "../scanner-policy/index.js";
import { matchesApproval, parseArtifactIdentity } from "./artifact-approval.js";
import type {
  ExecutionEnvelope,
  SupervisorDecision,
  SupervisorDenyCode,
  TrustedExecutionState,
} from "./model.js";

const ENVELOPE_KEYS = [
  "schema_version",
  "job_id",
  "attempt_id",
  "fence",
  "canonical_target",
  "authorization_ref",
  "lease_expires_at_unix_seconds",
  "hard_deadline_unix_seconds",
  "policy",
  "artifact_identity",
] as const;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function deny(code: SupervisorDenyCode, message: string): SupervisorDecision {
  return { allowed: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === expected.length &&
      actual.every((key) => typeof key === "string" && expected.includes(key))
    );
  } catch {
    return false;
  }
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim()
  );
}

function parseEnvelope(input: unknown): ExecutionEnvelope | null {
  if (!isRecord(input) || !hasExactKeys(input, ENVELOPE_KEYS)) return null;
  try {
    const schemaVersion = input.schema_version;
    const jobId = input.job_id;
    const attemptId = input.attempt_id;
    const fence = input.fence;
    const canonicalTarget = input.canonical_target;
    const authorizationRef = input.authorization_ref;
    const leaseExpiresAt = input.lease_expires_at_unix_seconds;
    const hardDeadline = input.hard_deadline_unix_seconds;
    const policy = input.policy;
    const artifact = parseArtifactIdentity(input.artifact_identity);
    if (
      schemaVersion !== 1 ||
      typeof jobId !== "string" ||
      !ID_PATTERN.test(jobId) ||
      typeof attemptId !== "string" ||
      !ID_PATTERN.test(attemptId) ||
      !isSafePositiveInteger(fence) ||
      !isBoundedString(canonicalTarget, 253) ||
      !isBoundedString(authorizationRef, 256) ||
      !isSafePositiveInteger(leaseExpiresAt) ||
      !isSafePositiveInteger(hardDeadline) ||
      !artifact
    ) {
      return null;
    }
    return {
      schema_version: 1,
      job_id: jobId,
      attempt_id: attemptId,
      fence,
      canonical_target: canonicalTarget,
      authorization_ref: authorizationRef,
      lease_expires_at_unix_seconds: leaseExpiresAt,
      hard_deadline_unix_seconds: hardDeadline,
      policy: policy as ExecutionEnvelope["policy"],
      artifact_identity: artifact,
    };
  } catch {
    return null;
  }
}

export function authorizeSupervisorExecution(
  input: unknown,
  trusted: TrustedExecutionState,
): SupervisorDecision {
  const envelope = parseEnvelope(input);
  if (!envelope)
    return deny("INVALID_ENVELOPE", "Execution envelope is invalid.");

  if (
    envelope.job_id !== trusted.job_id ||
    envelope.attempt_id !== trusted.attempt_id ||
    envelope.fence !== trusted.fence
  ) {
    return deny("STALE_ATTEMPT", "Attempt identity or fence is stale.");
  }

  if (
    envelope.canonical_target !== trusted.canonical_target ||
    envelope.authorization_ref !== trusted.authorization_ref
  ) {
    return deny(
      "AUTHORIZATION_MISMATCH",
      "Target authorization does not match trusted state.",
    );
  }

  if (
    envelope.lease_expires_at_unix_seconds !==
      trusted.lease_expires_at_unix_seconds ||
    trusted.now_unix_seconds >= trusted.lease_expires_at_unix_seconds
  ) {
    return deny("LEASE_EXPIRED", "Attempt lease is expired or stale.");
  }

  if (
    envelope.hard_deadline_unix_seconds !==
      trusted.hard_deadline_unix_seconds ||
    trusted.now_unix_seconds >= trusted.hard_deadline_unix_seconds
  ) {
    return deny(
      "ATTEMPT_DEADLINE_EXCEEDED",
      "Attempt hard deadline is exceeded or stale.",
    );
  }

  const policyDecision = authorizeScannerExecution(envelope.policy);
  if (!policyDecision.allowed) {
    return {
      allowed: false,
      code: "POLICY_DENIED",
      message: "Scanner policy denied execution.",
      policy_decision: policyDecision,
    };
  }

  if (
    envelope.artifact_identity.policy_id !== policyDecision.request.policy_id ||
    envelope.artifact_identity.policy_version !==
      policyDecision.request.policy_version ||
    envelope.artifact_identity.profile !== policyDecision.request.profile
  ) {
    return deny(
      "ARTIFACT_NOT_APPROVED",
      "Artifact identity does not match the execution policy.",
    );
  }

  if (!trusted.approval) {
    return deny("APPROVAL_REQUIRED", "Scanner artifact approval is required.");
  }

  if (trusted.approval.status !== "APPROVED") {
    return deny("APPROVAL_REVOKED", "Scanner artifact approval is revoked.");
  }

  if (!matchesApproval(envelope.artifact_identity, trusted.approval)) {
    return deny(
      "ARTIFACT_NOT_APPROVED",
      "Scanner artifact identity is not approved.",
    );
  }

  return {
    allowed: true,
    envelope: Object.freeze({
      ...envelope,
      policy: policyDecision.request,
      artifact_identity: Object.freeze(envelope.artifact_identity),
    }),
  };
}
