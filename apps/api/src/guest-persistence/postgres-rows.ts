import type { GuestIdempotencyRecord } from "../guest-idempotency/index.js";
import {
  snapshotGuestResultReadRecord,
  type GuestResultReadRecord,
} from "../guest-scan/index.js";

const HEX_32 = /^[0-9a-f]{64}$/u;
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/u;

function integer(value: unknown): bigint | null {
  if (typeof value !== "string" || !UNSIGNED_INTEGER.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function safeNumber(value: unknown): number | null {
  const parsed = integer(value);
  if (parsed === null || parsed > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(parsed);
}

function digest(value: unknown): string | null {
  return typeof value === "string" && HEX_32.test(value)
    ? `sha256:${value}`
    : null;
}

function bytes(value: unknown): Buffer | null {
  return typeof value === "string" && HEX_32.test(value)
    ? Buffer.from(value, "hex")
    : null;
}

export function mapGuestIdempotencyRow(
  row: Record<string, unknown>,
): GuestIdempotencyRecord | null {
  const scope = digest(row.guest_session_scope_hex);
  const requestHash = digest(row.request_hash_hex);
  const created = integer(row.created_at_unix_seconds);
  const expires = integer(row.idempotency_expires_at_unix_seconds);
  const tokenVersion = integer(row.result_token_version);
  const nonce = bytes(row.result_token_nonce_hex);
  const keyVersion = safeNumber(row.result_token_key_version);
  const revoked =
    row.result_access_revoked_at_unix_seconds === null
      ? null
      : integer(row.result_access_revoked_at_unix_seconds);
  if (
    typeof row.id !== "string" ||
    !scope ||
    typeof row.endpoint_operation !== "string" ||
    typeof row.idempotency_key !== "string" ||
    !requestHash ||
    created === null ||
    expires === null ||
    tokenVersion === null ||
    !nonce ||
    keyVersion === null ||
    (revoked === null && row.result_access_revoked_at_unix_seconds !== null)
  )
    return null;
  return {
    principal_scope: `GUEST_SESSION:${scope}`,
    endpoint_operation: row.endpoint_operation as "POST:/v1/public/scans",
    idempotency_key: row.idempotency_key,
    request_hash: requestHash,
    created_at_unix_seconds: created,
    idempotency_expires_at_unix_seconds: expires,
    token_metadata: {
      guest_scan_id: row.id,
      token_version: tokenVersion,
      token_nonce: nonce,
      key_version: keyVersion,
      result_access_expires_at_unix_seconds: expires,
      result_access_revoked_at_unix_seconds: revoked,
    },
  };
}

export function mapGuestResultReadRow(
  row: Record<string, unknown>,
): GuestResultReadRecord | null {
  const scope = digest(row.guest_session_scope_hex);
  const requestHash = digest(row.request_hash_hex);
  const nonce = bytes(row.result_token_nonce_hex);
  const acceptedDigest = digest(row.accepted_payload_digest_hex);
  const resultDigest = digest(row.payload_digest_hex);
  const created = integer(row.created_at_unix_seconds);
  const updated = integer(row.updated_at_unix_seconds);
  const expires = integer(row.idempotency_expires_at_unix_seconds);
  const deletion = integer(row.deletion_deadline_unix_seconds);
  const tokenVersion = integer(row.result_token_version);
  const keyVersion = safeNumber(row.result_token_key_version);
  const currentFence = safeNumber(row.current_fence);
  const acceptedFence = safeNumber(row.accepted_fence);
  const completed = integer(row.completed_at_unix_seconds);
  const revoked =
    row.result_access_revoked_at_unix_seconds === null
      ? null
      : integer(row.result_access_revoked_at_unix_seconds);
  if (
    typeof row.id !== "string" ||
    typeof row.canonical_target !== "string" ||
    !scope ||
    typeof row.endpoint_operation !== "string" ||
    typeof row.idempotency_key !== "string" ||
    !requestHash ||
    created === null ||
    updated === null ||
    expires === null ||
    deletion === null ||
    typeof row.job_state !== "string" ||
    typeof row.policy_id !== "string" ||
    typeof row.policy_version !== "string" ||
    typeof row.profile !== "string" ||
    tokenVersion === null ||
    !nonce ||
    keyVersion === null ||
    (revoked === null && row.result_access_revoked_at_unix_seconds !== null) ||
    typeof row.current_attempt_id !== "string" ||
    currentFence === null ||
    typeof row.accepted_attempt_id !== "string" ||
    acceptedFence === null ||
    !acceptedDigest ||
    !resultDigest ||
    completed === null
  )
    return null;
  return snapshotGuestResultReadRecord({
    scan: {
      schema_version: 1,
      guest_scan_id: row.id,
      canonical_target: row.canonical_target,
      principal_scope: `GUEST_SESSION:${scope}`,
      endpoint_operation: row.endpoint_operation,
      idempotency_key: row.idempotency_key,
      request_hash: requestHash,
      created_at_unix_seconds: created,
      updated_at_unix_seconds: updated,
      idempotency_expires_at_unix_seconds: expires,
      deletion_deadline_unix_seconds: deletion,
      job_state: row.job_state,
      policy_id: row.policy_id,
      policy_version: row.policy_version,
      profile: row.profile,
      result_token_metadata: {
        guest_scan_id: row.id,
        token_version: tokenVersion,
        token_nonce: nonce,
        key_version: keyVersion,
        result_access_expires_at_unix_seconds: expires,
        result_access_revoked_at_unix_seconds: revoked,
      },
      current_attempt_id: row.current_attempt_id,
      current_fence: currentFence,
      accepted_result: {
        attempt_id: row.accepted_attempt_id,
        fence: acceptedFence,
        payload_digest: acceptedDigest,
      },
    },
    result: {
      schema_version: 1,
      guest_scan_id: row.id,
      accepted_attempt_id: row.accepted_attempt_id,
      accepted_fence: acceptedFence,
      payload_digest: resultDigest,
      completed_at_unix_seconds: completed,
      projection: row.projection,
    },
  });
}
