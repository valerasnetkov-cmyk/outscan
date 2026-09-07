import { canonicalizeHostname } from "../target/index.js";
import type { PersistGuestScanRequest } from "./model.js";

const REQUEST_KEYS = [
  "guest_session_scope",
  "idempotency_key",
  "request_hash",
  "canonical_target",
  "network_signal_digest",
  "trusted_now_unix_seconds",
] as const;
const SCOPE = /^sha256:[0-9a-f]{64}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const NETWORK = /^hmac-sha256:[0-9a-f]{64}$/u;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/u;
const MAX_POSTGRES_UNIX_SECONDS = 253_402_300_799n;
const RETENTION_SECONDS = 86_400n;

function exact(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === REQUEST_KEYS.length &&
      REQUEST_KEYS.every((key) => keys.includes(key))
    );
  } catch {
    return false;
  }
}

export function snapshotPersistGuestScanRequest(
  value: unknown,
): Readonly<PersistGuestScanRequest> | null {
  if (!exact(value)) return null;
  try {
    const sessionScope = value.guest_session_scope;
    const idempotencyKey = value.idempotency_key;
    const requestHash = value.request_hash;
    const canonicalTarget = value.canonical_target;
    const networkSignalDigest = value.network_signal_digest;
    const now = value.trusted_now_unix_seconds;
    if (
      typeof sessionScope !== "string" ||
      !SCOPE.test(sessionScope) ||
      typeof idempotencyKey !== "string" ||
      !IDEMPOTENCY_KEY.test(idempotencyKey) ||
      typeof requestHash !== "string" ||
      !HASH.test(requestHash) ||
      typeof canonicalTarget !== "string" ||
      typeof networkSignalDigest !== "string" ||
      !NETWORK.test(networkSignalDigest) ||
      typeof now !== "bigint" ||
      now < 0n ||
      now + RETENTION_SECONDS > MAX_POSTGRES_UNIX_SECONDS
    )
      return null;
    const host = canonicalizeHostname(canonicalTarget);
    if (!host.ok || host.canonical_host !== canonicalTarget) return null;
    return Object.freeze({
      guest_session_scope: sessionScope,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      canonical_target: host.canonical_host,
      network_signal_digest: networkSignalDigest,
      trusted_now_unix_seconds: now,
    });
  } catch {
    return null;
  }
}
