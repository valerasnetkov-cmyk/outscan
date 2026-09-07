import type { Pool } from "pg";

import type { GuestResultReadStore } from "../guest-scan/index.js";
import { mapGuestResultReadRow } from "./postgres-rows.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

const RESULT_READ_SQL = `
  SELECT s.id, s.canonical_target,
    encode(s.guest_session_scope, 'hex') AS guest_session_scope_hex,
    s.endpoint_operation, s.idempotency_key,
    encode(s.request_hash, 'hex') AS request_hash_hex,
    extract(epoch FROM s.created_at)::bigint::text AS created_at_unix_seconds,
    extract(epoch FROM s.updated_at)::bigint::text AS updated_at_unix_seconds,
    extract(epoch FROM s.idempotency_expires_at)::bigint::text
      AS idempotency_expires_at_unix_seconds,
    extract(epoch FROM s.deletion_deadline)::bigint::text
      AS deletion_deadline_unix_seconds,
    s.job_state, s.policy_id, s.policy_version, s.profile,
    s.result_token_version::text AS result_token_version,
    encode(s.result_token_nonce, 'hex') AS result_token_nonce_hex,
    s.result_token_key_version::text AS result_token_key_version,
    CASE WHEN s.result_access_revoked_at IS NULL THEN NULL
      ELSE extract(epoch FROM s.result_access_revoked_at)::bigint::text END
      AS result_access_revoked_at_unix_seconds,
    s.current_attempt_id, s.current_fence::text AS current_fence,
    s.accepted_attempt_id, s.accepted_fence::text AS accepted_fence,
    encode(s.accepted_payload_digest, 'hex') AS accepted_payload_digest_hex,
    encode(r.payload_digest, 'hex') AS payload_digest_hex,
    extract(epoch FROM r.completed_at)::bigint::text
      AS completed_at_unix_seconds,
    r.projection
  FROM guest_scans s
  INNER JOIN guest_results r ON r.guest_scan_id = s.id
  WHERE s.id = $1`;

export function createPostgresGuestResultReadStore(
  pool: Pool,
): GuestResultReadStore {
  if (!pool || typeof pool.query !== "function")
    throw new Error("INVALID_GUEST_PERSISTENCE_CONFIGURATION");
  return Object.freeze({
    async loadByGuestScanId(guestScanId: string): Promise<unknown | null> {
      if (typeof guestScanId !== "string" || !ID.test(guestScanId)) return null;
      const result = await pool.query<Record<string, unknown>>(
        RESULT_READ_SQL,
        [guestScanId],
      );
      if (result.rowCount !== 1) return null;
      return mapGuestResultReadRow(result.rows[0] ?? {});
    },
  });
}
