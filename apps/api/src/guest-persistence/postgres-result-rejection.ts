import type { Pool } from "pg";

import { transaction, validId } from "./postgres-lease-support.js";
import {
  type GuestResultRejectionCode,
  type GuestResultRejectionSink,
  type RecordGuestResultRejection,
  type RecordGuestResultRejectionResult,
} from "./model.js";

export const GUEST_RESULT_REJECTION_CODES = [
  "RESULT_SUBMISSION_REJECTED",
  "INVALID_STATE",
  "JOB_NOT_RUNNING",
  "ATTEMPT_NOT_RUNNING",
  "STALE_ATTEMPT",
  "LEASE_EXPIRED",
  "ATTEMPT_DEADLINE_EXCEEDED",
  "RESULT_DIGEST_CONFLICT",
  "GUEST_PERSISTENCE_UNAVAILABLE",
] as const satisfies readonly GuestResultRejectionCode[];

const SECURITY_RELEVANT_CODES = new Set<GuestResultRejectionCode>([
  "RESULT_SUBMISSION_REJECTED",
  "INVALID_STATE",
  "RESULT_DIGEST_CONFLICT",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(
  value: unknown,
): Readonly<RecordGuestResultRejection> | null {
  if (!isRecord(value)) return null;
  try {
    const expected = [
      "schema_version",
      "guest_scan_id",
      "attempt_id",
      "monotonic_fence",
      "rejection_code",
    ];
    const keys = Reflect.ownKeys(value);
    const guestScanId = Reflect.get(value, "guest_scan_id");
    const attemptId = Reflect.get(value, "attempt_id");
    const fence = Reflect.get(value, "monotonic_fence");
    const rejectionCode = Reflect.get(value, "rejection_code");
    if (
      keys.length !== expected.length ||
      !keys.every((key) => typeof key === "string" && expected.includes(key)) ||
      Reflect.get(value, "schema_version") !== 1 ||
      !validId(guestScanId) ||
      !validId(attemptId) ||
      !Number.isSafeInteger(fence) ||
      (fence as number) < 1 ||
      !GUEST_RESULT_REJECTION_CODES.includes(
        rejectionCode as GuestResultRejectionCode,
      )
    ) {
      return null;
    }
    return Object.freeze({
      schema_version: 1,
      guest_scan_id: guestScanId,
      attempt_id: attemptId,
      monotonic_fence: fence as number,
      rejection_code: rejectionCode as GuestResultRejectionCode,
    });
  } catch {
    return null;
  }
}

export function guestResultRejectionIsSecurityRelevant(
  code: GuestResultRejectionCode,
): boolean {
  return SECURITY_RELEVANT_CODES.has(code);
}

export function createPostgresGuestResultRejectionSink(
  pool: Pool,
): GuestResultRejectionSink {
  if (typeof pool?.connect !== "function") {
    throw new Error("INVALID_GUEST_REJECTION_SINK_CONFIGURATION");
  }
  return Object.freeze({
    async record(value: unknown): Promise<RecordGuestResultRejectionResult> {
      const request = parseRequest(value);
      if (!request) return { ok: false, code: "INVALID_REQUEST" };
      const securityRelevant = guestResultRejectionIsSecurityRelevant(
        request.rejection_code,
      );
      const result = await transaction(pool, async (client) => {
        const inserted = await client.query(
          `INSERT INTO guest_result_rejection_events (
            guest_scan_id, attempt_id, monotonic_fence, rejection_code,
            security_relevant
          ) VALUES ($1, $2, $3::bigint, $4, $5)
          ON CONFLICT ON CONSTRAINT guest_result_rejection_identity DO NOTHING`,
          [
            request.guest_scan_id,
            request.attempt_id,
            request.monotonic_fence,
            request.rejection_code,
            securityRelevant,
          ],
        );
        const existing = await client.query<{ security_relevant: boolean }>(
          `SELECT security_relevant FROM guest_result_rejection_events
           WHERE guest_scan_id = $1 AND attempt_id = $2
             AND monotonic_fence = $3::bigint AND rejection_code = $4`,
          [
            request.guest_scan_id,
            request.attempt_id,
            request.monotonic_fence,
            request.rejection_code,
          ],
        );
        if (
          existing.rowCount !== 1 ||
          existing.rows[0]?.security_relevant !== securityRelevant
        ) {
          throw new Error("GUEST_REJECTION_EVENT_STATE");
        }
        return {
          ok: true,
          action: inserted.rowCount === 1 ? "RECORDED" : "ALREADY_RECORDED",
          security_relevant: securityRelevant,
        } as const;
      });
      return (
        result ?? {
          ok: false,
          code: "GUEST_PERSISTENCE_UNAVAILABLE",
        }
      );
    },
  });
}
