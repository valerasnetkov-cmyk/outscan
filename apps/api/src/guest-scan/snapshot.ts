import { snapshotGuestResultTokenMetadata } from "../guest-crypto/index.js";
import { GUEST_SCAN_ENDPOINT_OPERATION } from "../guest-idempotency/index.js";
import { snapshotSanitizedGuestProjection } from "../guest-result/index.js";
import {
  ATTEMPT_STATES,
  JOB_STATES,
  type AcceptedResultIdentity,
  type AttemptState,
  type JobState,
} from "../scan-protocol/index.js";
import { canonicalizeHostname } from "../target/index.js";
import {
  GUEST_RESULT_ACCESS_SECONDS,
  GUEST_RETENTION_SECONDS,
  GUEST_SCAN_POLICY_ID,
  GUEST_SCAN_POLICY_VERSION,
  GUEST_SCAN_PROFILE,
  GUEST_SCAN_SCHEMA_VERSION,
  type GuestResultReadRecord,
  type GuestResultRecord,
  type GuestScanAttemptRecord,
  type GuestScanRecord,
} from "./model.js";

const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const SCOPE = /^GUEST_SESSION:sha256:[0-9a-f]{64}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/u;
const TERMINAL_ATTEMPTS = new Set<AttemptState>([
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "SUPERSEDED",
]);
const LEASED_ATTEMPTS = new Set<AttemptState>([
  "LEASED",
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
  "SUPERSEDED",
]);
const STARTED_ATTEMPTS = new Set<AttemptState>([
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "TIMED_OUT",
]);

const SCAN_KEYS = [
  "schema_version",
  "guest_scan_id",
  "canonical_target",
  "principal_scope",
  "endpoint_operation",
  "idempotency_key",
  "request_hash",
  "created_at_unix_seconds",
  "updated_at_unix_seconds",
  "idempotency_expires_at_unix_seconds",
  "deletion_deadline_unix_seconds",
  "job_state",
  "policy_id",
  "policy_version",
  "profile",
  "result_token_metadata",
  "current_attempt_id",
  "current_fence",
  "accepted_result",
] as const;
const ATTEMPT_KEYS = [
  "schema_version",
  "guest_scan_attempt_id",
  "guest_scan_id",
  "attempt_no",
  "monotonic_fence",
  "lease_version",
  "lease_expires_at_unix_seconds",
  "hard_deadline_unix_seconds",
  "attempt_state",
  "created_at_unix_seconds",
  "updated_at_unix_seconds",
  "started_at_unix_seconds",
  "finished_at_unix_seconds",
] as const;
const RESULT_KEYS = [
  "schema_version",
  "guest_scan_id",
  "accepted_attempt_id",
  "accepted_fence",
  "payload_digest",
  "completed_at_unix_seconds",
  "projection",
] as const;

function exact(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function u64(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= UINT64_MAX;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function acceptedResult(value: unknown): AcceptedResultIdentity | null | false {
  if (value === null) return null;
  if (!exact(value, ["attempt_id", "fence", "payload_digest"])) return false;
  try {
    if (
      typeof value.attempt_id !== "string" ||
      !ID.test(value.attempt_id) ||
      !positiveInteger(value.fence) ||
      typeof value.payload_digest !== "string" ||
      !HASH.test(value.payload_digest)
    )
      return false;
    return Object.freeze({
      attempt_id: value.attempt_id,
      fence: value.fence,
      payload_digest: value.payload_digest,
    });
  } catch {
    return false;
  }
}

export function snapshotGuestScan(value: unknown): GuestScanRecord | null {
  if (!exact(value, SCAN_KEYS)) return null;
  try {
    const host = canonicalizeHostname(value.canonical_target);
    const token = snapshotGuestResultTokenMetadata(value.result_token_metadata);
    const accepted = acceptedResult(value.accepted_result);
    if (
      value.schema_version !== GUEST_SCAN_SCHEMA_VERSION ||
      typeof value.guest_scan_id !== "string" ||
      !ID.test(value.guest_scan_id) ||
      !host.ok ||
      host.canonical_host !== value.canonical_target ||
      typeof value.principal_scope !== "string" ||
      !SCOPE.test(value.principal_scope) ||
      value.endpoint_operation !== GUEST_SCAN_ENDPOINT_OPERATION ||
      typeof value.idempotency_key !== "string" ||
      !IDEMPOTENCY_KEY.test(value.idempotency_key) ||
      typeof value.request_hash !== "string" ||
      !HASH.test(value.request_hash) ||
      !u64(value.created_at_unix_seconds) ||
      !u64(value.updated_at_unix_seconds) ||
      !u64(value.idempotency_expires_at_unix_seconds) ||
      !u64(value.deletion_deadline_unix_seconds) ||
      typeof value.job_state !== "string" ||
      !JOB_STATES.includes(value.job_state as JobState) ||
      value.policy_id !== GUEST_SCAN_POLICY_ID ||
      value.policy_version !== GUEST_SCAN_POLICY_VERSION ||
      value.profile !== GUEST_SCAN_PROFILE ||
      !token ||
      accepted === false ||
      !nonNegativeInteger(value.current_fence) ||
      !(
        value.current_attempt_id === null ||
        (typeof value.current_attempt_id === "string" &&
          ID.test(value.current_attempt_id))
      )
    )
      return null;
    const created = value.created_at_unix_seconds;
    const updated = value.updated_at_unix_seconds;
    const accessExpiry = created + GUEST_RESULT_ACCESS_SECONDS;
    const deletion = created + GUEST_RETENTION_SECONDS;
    const currentAttempt = value.current_attempt_id;
    const currentFence = value.current_fence;
    const jobState = value.job_state as JobState;
    if (
      accessExpiry > UINT64_MAX ||
      deletion > UINT64_MAX ||
      updated < created ||
      updated > deletion ||
      value.idempotency_expires_at_unix_seconds !== accessExpiry ||
      token.result_access_expires_at_unix_seconds !== accessExpiry ||
      value.deletion_deadline_unix_seconds !== deletion ||
      token.guest_scan_id !== value.guest_scan_id ||
      (token.result_access_revoked_at_unix_seconds !== null &&
        (token.result_access_revoked_at_unix_seconds < created ||
          token.result_access_revoked_at_unix_seconds > updated)) ||
      (currentAttempt === null) !== (currentFence === 0) ||
      (jobState === "QUEUED" && currentAttempt !== null) ||
      (jobState === "RUNNING" && currentAttempt === null) ||
      (jobState === "SUCCEEDED" && accepted === null) ||
      (jobState !== "SUCCEEDED" && accepted !== null) ||
      (accepted !== null &&
        (accepted.attempt_id !== currentAttempt ||
          accepted.fence !== currentFence))
    )
      return null;
    return Object.freeze({
      schema_version: GUEST_SCAN_SCHEMA_VERSION,
      guest_scan_id: value.guest_scan_id,
      canonical_target: host.canonical_host,
      principal_scope: value.principal_scope,
      endpoint_operation: GUEST_SCAN_ENDPOINT_OPERATION,
      idempotency_key: value.idempotency_key,
      request_hash: value.request_hash,
      created_at_unix_seconds: created,
      updated_at_unix_seconds: updated,
      idempotency_expires_at_unix_seconds: accessExpiry,
      deletion_deadline_unix_seconds: deletion,
      job_state: jobState,
      policy_id: GUEST_SCAN_POLICY_ID,
      policy_version: GUEST_SCAN_POLICY_VERSION,
      profile: GUEST_SCAN_PROFILE,
      result_token_metadata: token,
      current_attempt_id: currentAttempt,
      current_fence: currentFence,
      accepted_result: accepted,
    });
  } catch {
    return null;
  }
}

export function snapshotGuestScanAttempt(
  value: unknown,
): GuestScanAttemptRecord | null {
  if (!exact(value, ATTEMPT_KEYS)) return null;
  try {
    if (
      value.schema_version !== GUEST_SCAN_SCHEMA_VERSION ||
      typeof value.guest_scan_attempt_id !== "string" ||
      !ID.test(value.guest_scan_attempt_id) ||
      typeof value.guest_scan_id !== "string" ||
      !ID.test(value.guest_scan_id) ||
      !positiveInteger(value.attempt_no) ||
      !positiveInteger(value.monotonic_fence) ||
      !nonNegativeInteger(value.lease_version) ||
      !u64(value.hard_deadline_unix_seconds) ||
      !u64(value.created_at_unix_seconds) ||
      !u64(value.updated_at_unix_seconds) ||
      typeof value.attempt_state !== "string" ||
      !ATTEMPT_STATES.includes(value.attempt_state as AttemptState) ||
      !(
        value.lease_expires_at_unix_seconds === null ||
        u64(value.lease_expires_at_unix_seconds)
      ) ||
      !(
        value.started_at_unix_seconds === null ||
        u64(value.started_at_unix_seconds)
      ) ||
      !(
        value.finished_at_unix_seconds === null ||
        u64(value.finished_at_unix_seconds)
      )
    )
      return null;
    const state = value.attempt_state as AttemptState;
    const created = value.created_at_unix_seconds;
    const updated = value.updated_at_unix_seconds;
    const leaseExpiry = value.lease_expires_at_unix_seconds;
    const started = value.started_at_unix_seconds;
    const finished = value.finished_at_unix_seconds;
    if (
      updated < created ||
      value.hard_deadline_unix_seconds <= created ||
      (state === "CREATED" &&
        (value.lease_version !== 0 || leaseExpiry !== null)) ||
      (LEASED_ATTEMPTS.has(state) &&
        (value.lease_version === 0 || leaseExpiry === null)) ||
      (leaseExpiry !== null &&
        (leaseExpiry <= created ||
          leaseExpiry > value.hard_deadline_unix_seconds)) ||
      (STARTED_ATTEMPTS.has(state) && started === null) ||
      ((state === "CREATED" || state === "LEASED") && started !== null) ||
      (started !== null && (started < created || started > updated)) ||
      TERMINAL_ATTEMPTS.has(state) !== (finished !== null) ||
      (finished !== null &&
        (finished < (started ?? created) || finished > updated)) ||
      (state === "SUCCEEDED" &&
        (finished === null ||
          leaseExpiry === null ||
          finished >= leaseExpiry ||
          finished >= value.hard_deadline_unix_seconds))
    )
      return null;
    return Object.freeze({
      schema_version: GUEST_SCAN_SCHEMA_VERSION,
      guest_scan_attempt_id: value.guest_scan_attempt_id,
      guest_scan_id: value.guest_scan_id,
      attempt_no: value.attempt_no,
      monotonic_fence: value.monotonic_fence,
      lease_version: value.lease_version,
      lease_expires_at_unix_seconds: leaseExpiry,
      hard_deadline_unix_seconds: value.hard_deadline_unix_seconds,
      attempt_state: state,
      created_at_unix_seconds: created,
      updated_at_unix_seconds: updated,
      started_at_unix_seconds: started,
      finished_at_unix_seconds: finished,
    });
  } catch {
    return null;
  }
}

function snapshotResult(value: unknown): GuestResultRecord | null {
  if (!exact(value, RESULT_KEYS)) return null;
  try {
    const projection = snapshotSanitizedGuestProjection(value.projection);
    if (
      value.schema_version !== GUEST_SCAN_SCHEMA_VERSION ||
      typeof value.guest_scan_id !== "string" ||
      !ID.test(value.guest_scan_id) ||
      typeof value.accepted_attempt_id !== "string" ||
      !ID.test(value.accepted_attempt_id) ||
      !positiveInteger(value.accepted_fence) ||
      typeof value.payload_digest !== "string" ||
      !HASH.test(value.payload_digest) ||
      !u64(value.completed_at_unix_seconds) ||
      !projection
    )
      return null;
    return Object.freeze({
      schema_version: GUEST_SCAN_SCHEMA_VERSION,
      guest_scan_id: value.guest_scan_id,
      accepted_attempt_id: value.accepted_attempt_id,
      accepted_fence: value.accepted_fence,
      payload_digest: value.payload_digest,
      completed_at_unix_seconds: value.completed_at_unix_seconds,
      projection,
    });
  } catch {
    return null;
  }
}

export function snapshotGuestResultReadRecord(
  value: unknown,
): GuestResultReadRecord | null {
  if (!exact(value, ["scan", "result"])) return null;
  const scan = snapshotGuestScan(value.scan);
  const result = snapshotResult(value.result);
  if (!scan || !result || scan.job_state !== "SUCCEEDED") return null;
  const accepted = scan.accepted_result;
  if (
    !accepted ||
    result.guest_scan_id !== scan.guest_scan_id ||
    result.accepted_attempt_id !== accepted.attempt_id ||
    result.accepted_fence !== accepted.fence ||
    result.payload_digest !== accepted.payload_digest ||
    result.completed_at_unix_seconds < scan.created_at_unix_seconds ||
    result.completed_at_unix_seconds > scan.updated_at_unix_seconds ||
    result.completed_at_unix_seconds >= scan.deletion_deadline_unix_seconds
  )
    return null;
  return Object.freeze({ scan, result });
}
