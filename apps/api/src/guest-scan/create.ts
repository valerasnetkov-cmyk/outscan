import {
  deriveGuestNetworkSignalKeyring,
  resolveTrustedIngressAddress,
} from "../guest-abuse/index.js";
import { authenticateGuestSessionCookieHeader } from "../guest-crypto/index.js";
import type { PersistGuestScanResult } from "../guest-persistence/index.js";
import { canonicalizeHostname } from "../target/index.js";
import type {
  GuestScanCreationDependencies,
  GuestScanCreationErrorCode,
  GuestScanCreationRequest,
  GuestScanCreationResult,
} from "./create-model.js";
import { deriveGuestScanRequestHash } from "./request-hash.js";

const REQUEST_KEYS = [
  "body",
  "cookie_header",
  "idempotency_key_header",
  "socket_remote_address",
  "x_forwarded_for",
] as const;
const IDEMPOTENCY_KEY = /^[\x21-\x7e]{1,128}$/u;
const RESULT_TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_RETRY_AFTER_SECONDS = 86_400;
const MAX_POSTGRES_UNIX_SECONDS = 253_402_300_799;
const PUBLIC_LIMIT_CODES = new Set([
  "SESSION_CONCURRENCY_LIMIT",
  "SESSION_BURST_LIMIT",
  "SESSION_DAILY_LIMIT",
  "NETWORK_CONCURRENCY_LIMIT",
  "NETWORK_BURST_LIMIT",
  "NETWORK_DAILY_LIMIT",
]);

const BASE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
});

function exact(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
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

function failure(
  statusCode: 400 | 401 | 409 | 429 | 503,
  code: GuestScanCreationErrorCode,
  retryAfterSeconds?: number,
): GuestScanCreationResult {
  const headers =
    retryAfterSeconds === undefined
      ? BASE_HEADERS
      : Object.freeze({
          ...BASE_HEADERS,
          "retry-after": String(retryAfterSeconds),
        });
  return Object.freeze({
    ok: false as const,
    status_code: statusCode,
    headers,
    body: Object.freeze({ error: Object.freeze({ code }) }),
  });
}

function request(value: unknown): Readonly<GuestScanCreationRequest> | null {
  if (!exact(value, REQUEST_KEYS)) return null;
  try {
    const body = value.body;
    const idempotencyKey = value.idempotency_key_header;
    const cookieHeader = value.cookie_header;
    const socketRemoteAddress = value.socket_remote_address;
    const forwardedFor = value.x_forwarded_for;
    if (
      !exact(body, ["domain"]) ||
      typeof idempotencyKey !== "string" ||
      !IDEMPOTENCY_KEY.test(idempotencyKey)
    ) {
      return null;
    }
    return Object.freeze({
      body: Object.freeze({ domain: body.domain }),
      cookie_header: cookieHeader,
      idempotency_key_header: idempotencyKey,
      socket_remote_address: socketRemoteAddress,
      x_forwarded_for: forwardedFor,
    });
  } catch {
    return null;
  }
}

function dependencies(
  value: GuestScanCreationDependencies,
): Readonly<GuestScanCreationDependencies> | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    const guestSessionKeyring = value.guest_session_keyring;
    const isGuestSessionRevoked = value.is_guest_session_revoked;
    const trustedProxyCidrs = value.trusted_proxy_cidrs;
    const networkHmacKeyring = value.network_hmac_keyring;
    const activeNetworkKeyVersion = value.active_network_hmac_key_version;
    const persistence = value.persistence;
    const queue = value.queue;
    const nowUnixSeconds = value.now_unix_seconds;
    if (
      typeof guestSessionKeyring?.get !== "function" ||
      typeof isGuestSessionRevoked !== "function" ||
      !Array.isArray(trustedProxyCidrs) ||
      trustedProxyCidrs.length > 64 ||
      !(networkHmacKeyring instanceof Map) ||
      networkHmacKeyring.size < 1 ||
      networkHmacKeyring.size > 3 ||
      !Number.isSafeInteger(activeNetworkKeyVersion) ||
      activeNetworkKeyVersion < 0 ||
      activeNetworkKeyVersion > 0xffff_ffff ||
      typeof persistence?.createOrReplay !== "function" ||
      typeof queue?.enqueue !== "function" ||
      typeof nowUnixSeconds !== "function"
    ) {
      return null;
    }
    const networkKeys = new Map<number, Uint8Array>();
    for (const [version, key] of networkHmacKeyring) {
      if (
        !Number.isSafeInteger(version) ||
        version < 0 ||
        version > 0xffff_ffff ||
        !(key instanceof Uint8Array) ||
        key.byteLength !== 32
      ) {
        return null;
      }
      networkKeys.set(version, Buffer.from(key));
    }
    if (!networkKeys.has(activeNetworkKeyVersion)) return null;
    return Object.freeze({
      guest_session_keyring: guestSessionKeyring,
      is_guest_session_revoked: isGuestSessionRevoked.bind(value),
      trusted_proxy_cidrs: Object.freeze([...trustedProxyCidrs]),
      network_hmac_keyring: networkKeys,
      active_network_hmac_key_version: activeNetworkKeyVersion,
      persistence: {
        createOrReplay: persistence.createOrReplay.bind(persistence),
      },
      queue: { enqueue: queue.enqueue.bind(queue) },
      now_unix_seconds: nowUnixSeconds.bind(value),
    });
  } catch {
    return null;
  }
}

function persistedSuccess(
  value: unknown,
  now: bigint,
): Extract<PersistGuestScanResult, { ok: true }> | null {
  if (
    !exact(value, [
      "ok",
      "action",
      "guest_scan_id",
      "result_token",
      "result_access_expires_at_unix_seconds",
      "result_token_expires_in_seconds",
    ])
  )
    return null;
  try {
    const source = value as Record<string, unknown>;
    const ok = source.ok;
    const action = source.action;
    const guestScanId = source.guest_scan_id;
    const resultToken = source.result_token;
    const expiresAt = source.result_access_expires_at_unix_seconds;
    const expiresIn = source.result_token_expires_in_seconds;
    if (
      ok !== true ||
      (action !== "CREATE" &&
        action !== "REPLACE_EXPIRED" &&
        action !== "REPLAY") ||
      typeof guestScanId !== "string" ||
      !ID.test(guestScanId) ||
      typeof resultToken !== "string" ||
      !RESULT_TOKEN.test(resultToken) ||
      typeof expiresAt !== "bigint" ||
      expiresAt <= now ||
      expiresAt > BigInt(MAX_POSTGRES_UNIX_SECONDS) ||
      !Number.isSafeInteger(expiresIn) ||
      (expiresIn as number) < 1 ||
      (expiresIn as number) > 1_800 ||
      expiresAt - now !== BigInt(expiresIn as number)
    ) {
      return null;
    }
    return Object.freeze({
      ok: true,
      action,
      guest_scan_id: guestScanId,
      result_token: resultToken,
      result_access_expires_at_unix_seconds: expiresAt,
      result_token_expires_in_seconds: expiresIn as number,
    });
  } catch {
    return null;
  }
}

function mapPersistenceFailure(value: unknown): GuestScanCreationResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failure(503, "GUEST_SCAN_UNAVAILABLE");
  }
  try {
    const code = Reflect.get(value, "code");
    const keys = Reflect.ownKeys(value);
    if (
      Reflect.get(value, "ok") !== false ||
      !keys.includes("ok") ||
      !keys.includes("code")
    ) {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    if (code === "IDEMPOTENCY_KEY_REUSED" && keys.length === 2) {
      return failure(409, "IDEMPOTENCY_KEY_REUSED");
    }
    if (code !== "ABUSE_LIMIT_EXCEEDED") {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    const abuseCode = Reflect.get(value, "abuse_code");
    const retry = Reflect.get(value, "retry_after_seconds");
    if (
      !keys.includes("abuse_code") ||
      keys.length < 3 ||
      keys.length > 4 ||
      (keys.length === 4 && !keys.includes("retry_after_seconds"))
    ) {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    if (abuseCode === "GUEST_SCANNING_PAUSED") {
      return failure(503, "GUEST_SCANNING_UNAVAILABLE");
    }
    if (typeof abuseCode !== "string" || !PUBLIC_LIMIT_CODES.has(abuseCode)) {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    return failure(
      429,
      "GUEST_SCAN_LIMIT_EXCEEDED",
      Number.isSafeInteger(retry) &&
        (retry as number) >= 1 &&
        (retry as number) <= MAX_RETRY_AFTER_SECONDS
        ? retry
        : undefined,
    );
  } catch {
    return failure(503, "GUEST_SCAN_UNAVAILABLE");
  }
}

function matchesQueuedScan(value: unknown, guestScanId: string): boolean {
  if (!exact(value, ["schema_version", "guest_scan_id"])) return false;
  try {
    return value.schema_version === 1 && value.guest_scan_id === guestScanId;
  } catch {
    return false;
  }
}

export function createGuestScanCreationService(
  rawDependencies: GuestScanCreationDependencies,
): (value: unknown) => Promise<GuestScanCreationResult> {
  const deps = dependencies(rawDependencies);
  if (!deps) throw new Error("INVALID_GUEST_SCAN_CREATION_CONFIGURATION");
  return async (value: unknown) => {
    const input = request(value);
    if (!input) return failure(400, "INVALID_SCAN_REQUEST");
    const domain = (input.body as { domain: unknown }).domain;
    const host = canonicalizeHostname(domain);
    if (!host.ok) return failure(400, "INVALID_SCAN_REQUEST");
    const session = authenticateGuestSessionCookieHeader(
      input.cookie_header,
      deps.guest_session_keyring,
      deps.is_guest_session_revoked,
    );
    if (!session.ok) {
      return failure(
        401,
        session.code === "MISSING_GUEST_SESSION"
          ? "GUEST_SESSION_REQUIRED"
          : "GUEST_SESSION_INVALID",
      );
    }
    const ingress = resolveTrustedIngressAddress({
      socket_remote_address: input.socket_remote_address,
      x_forwarded_for: input.x_forwarded_for,
      trusted_proxy_cidrs: deps.trusted_proxy_cidrs,
    });
    if (!ingress.ok) return failure(400, "INVALID_SCAN_REQUEST");
    const network = deriveGuestNetworkSignalKeyring({
      trusted_ingress_address: ingress.trusted_ingress_address,
      hmac_keyring: deps.network_hmac_keyring,
      active_key_version: deps.active_network_hmac_key_version,
    });
    const requestHash = deriveGuestScanRequestHash(host.canonical_host);
    let now: number;
    try {
      now = deps.now_unix_seconds();
    } catch {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    if (
      !network.ok ||
      !requestHash ||
      !Number.isSafeInteger(now) ||
      now < 0 ||
      now > MAX_POSTGRES_UNIX_SECONDS - 86_400
    ) {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    let stored: unknown;
    try {
      stored = await deps.persistence.createOrReplay({
        guest_session_scope: session.session.guest_session_scope,
        idempotency_key: input.idempotency_key_header,
        request_hash: requestHash,
        canonical_target: host.canonical_host,
        network_signal_digests: network.network_signal_digests,
        trusted_now_unix_seconds: BigInt(now),
      });
    } catch {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    const accepted = persistedSuccess(stored, BigInt(now));
    if (!accepted) return mapPersistenceFailure(stored);
    let queued: unknown;
    try {
      queued = await deps.queue.enqueue(accepted.guest_scan_id);
    } catch {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    if (!matchesQueuedScan(queued, accepted.guest_scan_id)) {
      return failure(503, "GUEST_SCAN_UNAVAILABLE");
    }
    return Object.freeze({
      ok: true as const,
      status_code: accepted.action === "REPLAY" ? 200 : 202,
      headers: BASE_HEADERS,
      body: Object.freeze({
        scanId: accepted.guest_scan_id,
        resultToken: accepted.result_token,
        status: "QUEUED" as const,
        resultAccessExpiresAt: new Date(
          Number(accepted.result_access_expires_at_unix_seconds) * 1_000,
        ).toISOString(),
        resultTokenExpiresInSeconds: accepted.result_token_expires_in_seconds,
      }),
    });
  };
}
