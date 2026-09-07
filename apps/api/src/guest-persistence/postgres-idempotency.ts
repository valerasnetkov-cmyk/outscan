import { deriveGuestResultToken } from "../guest-crypto/index.js";
import {
  decideGuestScanIdempotency,
  GUEST_IDEMPOTENCY_WINDOW_SECONDS,
  GUEST_SCAN_ENDPOINT_OPERATION,
} from "../guest-idempotency/index.js";
import {
  GUEST_SCAN_POLICY_ID,
  GUEST_SCAN_POLICY_VERSION,
  GUEST_SCAN_PROFILE,
} from "../guest-scan/index.js";
import type {
  GuestPersistenceDependencies,
  GuestScanPersistence,
  PersistGuestScanResult,
} from "./model.js";
import {
  releaseGuestAbuseReservation,
  reserveGuestAbuseCounters,
} from "./postgres-abuse.js";
import { mapGuestIdempotencyRow } from "./postgres-rows.js";
import { snapshotPersistGuestScanRequest } from "./snapshot.js";

const MAX_TRANSACTION_ATTEMPTS = 3;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

const LOOKUP_SQL = `
  SELECT id, encode(guest_session_scope, 'hex') AS guest_session_scope_hex,
    endpoint_operation, idempotency_key,
    encode(request_hash, 'hex') AS request_hash_hex,
    extract(epoch FROM created_at)::bigint::text AS created_at_unix_seconds,
    extract(epoch FROM idempotency_expires_at)::bigint::text
      AS idempotency_expires_at_unix_seconds,
    result_token_version::text AS result_token_version,
    encode(result_token_nonce, 'hex') AS result_token_nonce_hex,
    result_token_key_version::text AS result_token_key_version,
    CASE WHEN result_access_revoked_at IS NULL THEN NULL
      ELSE extract(epoch FROM result_access_revoked_at)::bigint::text END
      AS result_access_revoked_at_unix_seconds
  FROM guest_scans
  WHERE guest_session_scope = $1 AND endpoint_operation = $2
    AND idempotency_key = $3
  FOR UPDATE`;

const INSERT_SQL = `
  INSERT INTO guest_scans (
    id, canonical_target, guest_session_scope, endpoint_operation,
    idempotency_key, request_hash, created_at, updated_at,
    idempotency_expires_at, deletion_deadline, job_state,
    policy_id, policy_version, profile, result_token_version,
    result_token_nonce, result_token_key_version, result_access_expires_at
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    to_timestamp($7::double precision), to_timestamp($7::double precision),
    to_timestamp($7::double precision) + interval '30 minutes',
    to_timestamp($7::double precision) + interval '24 hours', 'QUEUED',
    $8, $9, $10, $11::bigint, $12, $13::bigint,
    to_timestamp($7::double precision) + interval '30 minutes'
  )`;

function retryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = Reflect.get(error, "code");
  const constraint = Reflect.get(error, "constraint");
  return (
    code === "40001" ||
    code === "40P01" ||
    (code === "23505" && constraint === "guest_scans_idempotency_unique")
  );
}

function tokenMaterial(
  dependencies: GuestPersistenceDependencies,
  guestScanId: string,
  expiresAt: bigint,
): { token: string; nonce: Buffer } | null {
  try {
    const nonceValue = dependencies.create_token_nonce();
    if (!(nonceValue instanceof Uint8Array)) return null;
    const nonce = Buffer.from(nonceValue);
    const key = dependencies.token_keyring.get(
      dependencies.active_token_key_version,
    );
    if (
      typeof guestScanId !== "string" ||
      !ID.test(guestScanId) ||
      nonce.byteLength !== 32 ||
      !key
    )
      return null;
    const token = deriveGuestResultToken(
      {
        guest_scan_id: guestScanId,
        token_version: 1n,
        token_nonce: nonce,
        key_version: dependencies.active_token_key_version,
        result_access_expires_at_unix_seconds: expiresAt,
        result_access_revoked_at_unix_seconds: null,
      },
      key,
    );
    return { token, nonce };
  } catch {
    return null;
  }
}

function snapshotDependencies(
  value: GuestPersistenceDependencies,
): Readonly<GuestPersistenceDependencies> | null {
  if (typeof value !== "object" || value === null) return null;
  try {
    const pool = value.pool;
    const tokenKeyring = value.token_keyring;
    const activeKeyVersion = value.active_token_key_version;
    const createGuestScanId = value.create_guest_scan_id;
    const createTokenNonce = value.create_token_nonce;
    if (
      typeof pool?.connect !== "function" ||
      typeof tokenKeyring?.get !== "function" ||
      !Number.isInteger(activeKeyVersion) ||
      activeKeyVersion < 0 ||
      activeKeyVersion > 0xffff_ffff ||
      typeof createGuestScanId !== "function" ||
      typeof createTokenNonce !== "function"
    )
      return null;
    return Object.freeze({
      pool,
      token_keyring: tokenKeyring,
      active_token_key_version: activeKeyVersion,
      create_guest_scan_id: createGuestScanId,
      create_token_nonce: createTokenNonce,
    });
  } catch {
    return null;
  }
}

export function createPostgresGuestScanPersistence(
  dependenciesValue: GuestPersistenceDependencies,
): GuestScanPersistence {
  const dependencies = snapshotDependencies(dependenciesValue);
  if (!dependencies) throw new Error("INVALID_GUEST_PERSISTENCE_CONFIGURATION");
  return Object.freeze({
    async createOrReplay(value: unknown): Promise<PersistGuestScanResult> {
      const request = snapshotPersistGuestScanRequest(value);
      if (!request) return { ok: false, code: "INVALID_REQUEST" };
      const scopeBytes = Buffer.from(
        request.guest_session_scope.slice("sha256:".length),
        "hex",
      );
      const requestHashBytes = Buffer.from(
        request.request_hash.slice("sha256:".length),
        "hex",
      );
      for (
        let transactionAttempt = 1;
        transactionAttempt <= MAX_TRANSACTION_ATTEMPTS;
        transactionAttempt += 1
      ) {
        let client;
        try {
          client = await dependencies.pool.connect();
        } catch {
          return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
        }
        try {
          await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
          const found = await client.query<Record<string, unknown>>(
            LOOKUP_SQL,
            [
              scopeBytes,
              GUEST_SCAN_ENDPOINT_OPERATION,
              request.idempotency_key,
            ],
          );
          const existing =
            found.rowCount === 0
              ? null
              : found.rowCount === 1
                ? (mapGuestIdempotencyRow(found.rows[0] ?? {}) ?? undefined)
                : undefined;
          const decision = decideGuestScanIdempotency(
            {
              guest_session_scope: request.guest_session_scope,
              idempotency_key: request.idempotency_key,
              request_hash: request.request_hash,
              now_unix_seconds: request.trusted_now_unix_seconds,
            },
            existing,
            dependencies.token_keyring,
          );
          if (!decision.ok || decision.action === "REPLAY") {
            await client.query("COMMIT");
            return decision;
          }
          const guestScanId = dependencies.create_guest_scan_id();
          const expiresAt =
            request.trusted_now_unix_seconds + GUEST_IDEMPOTENCY_WINDOW_SECONDS;
          const material = tokenMaterial(dependencies, guestScanId, expiresAt);
          if (!material) {
            await client.query("ROLLBACK");
            return { ok: false, code: "RESULT_TOKEN_UNAVAILABLE" };
          }
          if (decision.action === "REPLACE_EXPIRED") {
            const released = await releaseGuestAbuseReservation(
              client,
              existing?.token_metadata.guest_scan_id ?? "",
              request.trusted_now_unix_seconds,
              "EXPIRED_REPLACEMENT",
            );
            if (!released) throw new Error("GUEST_ABUSE_RELEASE_INCONSISTENT");
            const removed = await client.query(
              "DELETE FROM guest_scans WHERE id = $1",
              [existing?.token_metadata.guest_scan_id],
            );
            if (removed.rowCount !== 1)
              throw new Error("GUEST_PERSISTENCE_INCONSISTENT");
          }
          await client.query(INSERT_SQL, [
            guestScanId,
            request.canonical_target,
            scopeBytes,
            GUEST_SCAN_ENDPOINT_OPERATION,
            request.idempotency_key,
            requestHashBytes,
            request.trusted_now_unix_seconds.toString(),
            GUEST_SCAN_POLICY_ID,
            GUEST_SCAN_POLICY_VERSION,
            GUEST_SCAN_PROFILE,
            "1",
            material.nonce,
            dependencies.active_token_key_version.toString(),
          ]);
          const abuse = await reserveGuestAbuseCounters(client, {
            guest_scan_id: guestScanId,
            guest_session_scope: request.guest_session_scope,
            network_signal_digest: request.network_signal_digest,
            now_unix_seconds: request.trusted_now_unix_seconds,
          });
          if (!abuse.ok) {
            await client.query("ROLLBACK");
            if (abuse.code === "INVALID_ABUSE_CONTEXT") {
              return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
            }
            return {
              ok: false,
              code: "ABUSE_LIMIT_EXCEEDED",
              abuse_code: abuse.code,
              ...(abuse.retry_after_seconds === undefined
                ? {}
                : { retry_after_seconds: abuse.retry_after_seconds }),
            };
          }
          await client.query("COMMIT");
          return {
            ok: true,
            action: decision.action,
            guest_scan_id: guestScanId,
            result_token: material.token,
            result_access_expires_at_unix_seconds: expiresAt,
            result_token_expires_in_seconds: Number(
              GUEST_IDEMPOTENCY_WINDOW_SECONDS,
            ),
          };
        } catch (error) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // The original operation remains the public failure cause.
          }
          if (transactionAttempt < MAX_TRANSACTION_ATTEMPTS && retryable(error))
            continue;
          return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
        } finally {
          client.release();
        }
      }
      return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
    },
  });
}
