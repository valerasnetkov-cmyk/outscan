import type { Pool } from "pg";

import type { GuestSessionRevocationProvider } from "../guest-session/index.js";
import { transaction } from "./postgres-lease-support.js";

const SCOPE = /^sha256:[0-9a-f]{64}$/u;
const MAX_BATCH_SIZE = 1_000;

export type RevokeGuestSessionResult =
  | { ok: true; action: "RECORDED" | "ALREADY_REVOKED" }
  | { ok: false; code: "INVALID_REQUEST" | "GUEST_REVOCATION_UNAVAILABLE" };

export type PruneGuestSessionRevocationsResult =
  | { ok: true; deleted: number; more_work: boolean }
  | { ok: false; code: "INVALID_REQUEST" | "GUEST_REVOCATION_UNAVAILABLE" };

export interface GuestSessionRevocationStore extends GuestSessionRevocationProvider {
  is_revoked(guestSessionScope: string): Promise<boolean | null>;
  revoke(value: unknown): Promise<RevokeGuestSessionResult>;
  pruneExpired(value: unknown): Promise<PruneGuestSessionRevocationsResult>;
}

function scopeBytes(value: unknown): Buffer | null {
  if (typeof value !== "string" || !SCOPE.test(value)) return null;
  try {
    const bytes = Buffer.from(value.slice("sha256:".length), "hex");
    return bytes.byteLength === 32 ? bytes : null;
  } catch {
    return null;
  }
}

function exactScopeRequest(value: unknown): Buffer | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    return keys.length === 1 && keys[0] === "guest_session_scope"
      ? scopeBytes(Reflect.get(value, "guest_session_scope"))
      : null;
  } catch {
    return null;
  }
}

function batchSize(value: unknown): number | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const size = Reflect.get(value, "batch_size");
    return keys.length === 1 &&
      keys[0] === "batch_size" &&
      Number.isSafeInteger(size) &&
      (size as number) >= 1 &&
      (size as number) <= MAX_BATCH_SIZE
      ? (size as number)
      : null;
  } catch {
    return null;
  }
}

export function createPostgresGuestSessionRevocationStore(
  pool: Pool,
): GuestSessionRevocationStore {
  if (
    typeof pool?.connect !== "function" ||
    typeof pool?.query !== "function"
  ) {
    throw new Error("INVALID_GUEST_REVOCATION_STORE_CONFIGURATION");
  }

  return Object.freeze({
    async is_revoked(guestSessionScope: string): Promise<boolean | null> {
      const scope = scopeBytes(guestSessionScope);
      if (!scope) return null;
      try {
        const found = await pool.query<{ revoked: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM guest_session_revocations
             WHERE guest_session_scope = $1
               AND expires_at > transaction_timestamp()
           ) AS revoked`,
          [scope],
        );
        return found.rowCount === 1 &&
          typeof found.rows[0]?.revoked === "boolean"
          ? found.rows[0].revoked
          : null;
      } catch {
        return null;
      }
    },

    async revoke(value: unknown): Promise<RevokeGuestSessionResult> {
      const scope = exactScopeRequest(value);
      if (!scope) return { ok: false, code: "INVALID_REQUEST" };
      const result = await transaction(pool, async (client) => {
        await client.query(
          `DELETE FROM guest_session_revocations
           WHERE guest_session_scope = $1
             AND expires_at <= transaction_timestamp()`,
          [scope],
        );
        const inserted = await client.query(
          `INSERT INTO guest_session_revocations (
             guest_session_scope, revoked_at, expires_at
           ) VALUES (
             $1, date_trunc('second', transaction_timestamp()),
             date_trunc('second', transaction_timestamp()) + interval '24 hours'
           ) ON CONFLICT (guest_session_scope) DO NOTHING`,
          [scope],
        );
        const active = await client.query<{ active: boolean }>(
          `SELECT expires_at > transaction_timestamp() AS active
           FROM guest_session_revocations WHERE guest_session_scope = $1`,
          [scope],
        );
        if (active.rowCount !== 1 || active.rows[0]?.active !== true) {
          throw new Error("GUEST_REVOCATION_STATE");
        }
        return Object.freeze({
          ok: true as const,
          action:
            inserted.rowCount === 1
              ? ("RECORDED" as const)
              : ("ALREADY_REVOKED" as const),
        });
      });
      return result ?? { ok: false, code: "GUEST_REVOCATION_UNAVAILABLE" };
    },

    async pruneExpired(
      value: unknown,
    ): Promise<PruneGuestSessionRevocationsResult> {
      const size = batchSize(value);
      if (!size) return { ok: false, code: "INVALID_REQUEST" };
      try {
        const removed = await pool.query(
          `WITH due AS (
             SELECT guest_session_scope FROM guest_session_revocations
             WHERE expires_at <= transaction_timestamp()
             ORDER BY expires_at, guest_session_scope
             LIMIT $1 FOR UPDATE SKIP LOCKED
           )
           DELETE FROM guest_session_revocations AS revocations
           USING due
           WHERE revocations.guest_session_scope = due.guest_session_scope`,
          [size],
        );
        const remaining = await pool.query<{ more_work: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM guest_session_revocations
             WHERE expires_at <= transaction_timestamp()
           ) AS more_work`,
        );
        return remaining.rowCount === 1 &&
          typeof remaining.rows[0]?.more_work === "boolean"
          ? Object.freeze({
              ok: true as const,
              deleted: removed.rowCount ?? 0,
              more_work: remaining.rows[0].more_work,
            })
          : { ok: false, code: "GUEST_REVOCATION_UNAVAILABLE" };
      } catch {
        return { ok: false, code: "GUEST_REVOCATION_UNAVAILABLE" };
      }
    },
  });
}
