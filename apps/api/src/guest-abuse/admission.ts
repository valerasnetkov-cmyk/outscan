import {
  decideGuestScanIdempotency,
  GUEST_IDEMPOTENCY_WINDOW_SECONDS,
  type GuestIdempotencyResult,
} from "../guest-idempotency/index.js";
import type { GuestResultTokenKeyring } from "../guest-crypto/index.js";
import { decideGuestAbuseAdmission } from "./decide.js";
import type { GuestAbuseDenyCode, GuestAbuseReservation } from "./model.js";

type CreateIdempotencyDecision = Extract<
  GuestIdempotencyResult,
  { ok: true; action: "CREATE" | "REPLACE_EXPIRED" }
>;
type ReplayIdempotencyDecision = Extract<
  GuestIdempotencyResult,
  { ok: true; action: "REPLAY" }
>;

export type GuestScanAdmissionDecision =
  | ReplayIdempotencyDecision
  | (CreateIdempotencyDecision & {
      abuse_reservation: Readonly<GuestAbuseReservation>;
    })
  | Exclude<GuestIdempotencyResult, { ok: true }>
  | { ok: false; code: "INVALID_ABUSE_CONTEXT" }
  | {
      ok: false;
      code: "ABUSE_LIMIT_EXCEEDED";
      abuse_code: GuestAbuseDenyCode;
      retry_after_seconds?: number;
    };

export function decideGuestScanAdmission(
  idempotencyRequest: unknown,
  existingIdempotencyRecord: unknown,
  tokenKeyring: GuestResultTokenKeyring,
  abuseContext: unknown,
): GuestScanAdmissionDecision {
  const idempotency = decideGuestScanIdempotency(
    idempotencyRequest,
    existingIdempotencyRecord,
    tokenKeyring,
  );
  if (!idempotency.ok || idempotency.action === "REPLAY") return idempotency;

  const abuse = decideGuestAbuseAdmission(abuseContext);
  if (!abuse.ok) {
    if (abuse.code === "INVALID_ABUSE_CONTEXT") return abuse;
    return {
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: abuse.code,
      ...(abuse.retry_after_seconds === undefined
        ? {}
        : { retry_after_seconds: abuse.retry_after_seconds }),
    };
  }
  if (
    idempotency.lookup.principal_scope !==
      `GUEST_SESSION:${abuse.reservation.guest_session_scope}` ||
    idempotency.idempotency_expires_at_unix_seconds -
      GUEST_IDEMPOTENCY_WINDOW_SECONDS !==
      abuse.reservation.observed_at_unix_seconds
  ) {
    return { ok: false, code: "INVALID_ABUSE_CONTEXT" };
  }
  return Object.freeze({
    ...idempotency,
    abuse_reservation: abuse.reservation,
  });
}
