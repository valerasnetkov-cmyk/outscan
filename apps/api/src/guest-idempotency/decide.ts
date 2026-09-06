import {
  deriveGuestResultToken,
  snapshotGuestResultTokenMetadata,
  type GuestResultTokenKeyring,
} from "../guest-crypto/index.js";
import {
  GUEST_IDEMPOTENCY_WINDOW_SECONDS,
  GUEST_SCAN_ENDPOINT_OPERATION,
  type GuestIdempotencyLookup,
  type GuestIdempotencyRecord,
  type GuestIdempotencyRequest,
  type GuestIdempotencyResult,
} from "./model.js";

const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const REQUEST_KEYS = [
  "guest_session_scope",
  "idempotency_key",
  "request_hash",
  "now_unix_seconds",
] as const;
const RECORD_KEYS = [
  "principal_scope",
  "endpoint_operation",
  "idempotency_key",
  "request_hash",
  "created_at_unix_seconds",
  "idempotency_expires_at_unix_seconds",
  "token_metadata",
] as const;
const SCOPE = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/u;

function exactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function isU64(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= UINT64_MAX;
}

function parseRequest(value: unknown): GuestIdempotencyRequest | null {
  if (!exactObject(value, REQUEST_KEYS)) return null;
  try {
    const input = value as Record<string, unknown>;
    const guestSessionScope = input.guest_session_scope;
    const idempotencyKey = input.idempotency_key;
    const requestHash = input.request_hash;
    const nowUnixSeconds = input.now_unix_seconds;
    if (
      typeof guestSessionScope !== "string" ||
      !SCOPE.test(guestSessionScope) ||
      typeof idempotencyKey !== "string" ||
      !IDEMPOTENCY_KEY.test(idempotencyKey) ||
      typeof requestHash !== "string" ||
      !HASH.test(requestHash) ||
      !isU64(nowUnixSeconds)
    ) {
      return null;
    }
    return Object.freeze({
      guest_session_scope: guestSessionScope,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      now_unix_seconds: nowUnixSeconds,
    });
  } catch {
    return null;
  }
}

function parseRecord(value: unknown): GuestIdempotencyRecord | null {
  if (!exactObject(value, RECORD_KEYS)) return null;
  try {
    const record = value as Record<string, unknown>;
    const principalScope = record.principal_scope;
    const endpointOperation = record.endpoint_operation;
    const idempotencyKey = record.idempotency_key;
    const requestHash = record.request_hash;
    const createdAt = record.created_at_unix_seconds;
    const expiresAt = record.idempotency_expires_at_unix_seconds;
    const tokenMetadata = snapshotGuestResultTokenMetadata(
      record.token_metadata,
    );
    if (
      typeof principalScope !== "string" ||
      !principalScope.startsWith("GUEST_SESSION:") ||
      !SCOPE.test(principalScope.slice("GUEST_SESSION:".length)) ||
      typeof idempotencyKey !== "string" ||
      !IDEMPOTENCY_KEY.test(idempotencyKey) ||
      typeof requestHash !== "string" ||
      !HASH.test(requestHash) ||
      endpointOperation !== GUEST_SCAN_ENDPOINT_OPERATION ||
      !isU64(createdAt) ||
      !isU64(expiresAt) ||
      !tokenMetadata
    ) {
      return null;
    }
    const expectedExpiry = createdAt + GUEST_IDEMPOTENCY_WINDOW_SECONDS;
    if (
      expectedExpiry > UINT64_MAX ||
      expectedExpiry !== expiresAt ||
      expectedExpiry !== tokenMetadata.result_access_expires_at_unix_seconds
    ) {
      return null;
    }
    return {
      principal_scope: principalScope,
      endpoint_operation: GUEST_SCAN_ENDPOINT_OPERATION,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      created_at_unix_seconds: createdAt,
      idempotency_expires_at_unix_seconds: expiresAt,
      token_metadata: tokenMetadata,
    };
  } catch {
    return null;
  }
}

function lookupFor(request: GuestIdempotencyRequest): GuestIdempotencyLookup {
  return Object.freeze({
    principal_scope: `GUEST_SESSION:${request.guest_session_scope}`,
    endpoint_operation: GUEST_SCAN_ENDPOINT_OPERATION,
    idempotency_key: request.idempotency_key,
  });
}

function createDecision(
  action: "CREATE" | "REPLACE_EXPIRED",
  request: GuestIdempotencyRequest,
  lookup: GuestIdempotencyLookup,
): GuestIdempotencyResult {
  const expiry = request.now_unix_seconds + GUEST_IDEMPOTENCY_WINDOW_SECONDS;
  if (expiry > UINT64_MAX) return { ok: false, code: "INVALID_REQUEST" };
  return {
    ok: true,
    action,
    lookup,
    request_hash: request.request_hash,
    idempotency_expires_at_unix_seconds: expiry,
  };
}

export function decideGuestScanIdempotency(
  requestValue: unknown,
  existingValue: unknown,
  tokenKeyring: GuestResultTokenKeyring,
): GuestIdempotencyResult {
  const request = parseRequest(requestValue);
  if (!request) return { ok: false, code: "INVALID_REQUEST" };
  const lookup = lookupFor(request);
  if (existingValue === null) {
    return createDecision("CREATE", request, lookup);
  }
  const existing = parseRecord(existingValue);
  if (!existing) return { ok: false, code: "INVALID_RECORD" };
  if (
    existing.principal_scope !== lookup.principal_scope ||
    existing.endpoint_operation !== lookup.endpoint_operation ||
    existing.idempotency_key !== lookup.idempotency_key
  ) {
    return { ok: false, code: "INVALID_RECORD" };
  }
  if (
    request.now_unix_seconds >= existing.idempotency_expires_at_unix_seconds
  ) {
    return createDecision("REPLACE_EXPIRED", request, lookup);
  }
  if (existing.request_hash !== request.request_hash) {
    return { ok: false, code: "IDEMPOTENCY_KEY_REUSED" };
  }
  if (existing.token_metadata.result_access_revoked_at_unix_seconds !== null) {
    return { ok: false, code: "RESULT_ACCESS_REVOKED" };
  }

  let key: Uint8Array | undefined;
  try {
    key = tokenKeyring.get(existing.token_metadata.key_version);
  } catch {
    return { ok: false, code: "RESULT_TOKEN_UNAVAILABLE" };
  }
  if (!key) return { ok: false, code: "RESULT_TOKEN_UNAVAILABLE" };
  let resultToken: string;
  try {
    resultToken = deriveGuestResultToken(existing.token_metadata, key);
  } catch {
    return { ok: false, code: "RESULT_TOKEN_UNAVAILABLE" };
  }
  return {
    ok: true,
    action: "REPLAY",
    guest_scan_id: existing.token_metadata.guest_scan_id,
    result_token: resultToken,
    result_access_expires_at_unix_seconds:
      existing.token_metadata.result_access_expires_at_unix_seconds,
    result_token_expires_in_seconds: Number(
      existing.token_metadata.result_access_expires_at_unix_seconds -
        request.now_unix_seconds,
    ),
  };
}
