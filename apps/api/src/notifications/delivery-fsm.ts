import {
  NOTIFICATION_DELIVERY_STATUSES,
  NotificationError,
  type NotificationDeliverySnapshot,
  type NotificationDeliveryStatus,
} from "./model.js";
import { isExactRecord, isNotificationIdentifier } from "./validation.js";

export type DeliveryTransitionDecision =
  | { action: "APPLY"; next: NotificationDeliverySnapshot }
  | { action: "ACK_REPLAY" | "ACK_STALE" | "DENY" };

const ALLOWED: Readonly<
  Record<NotificationDeliveryStatus, readonly NotificationDeliveryStatus[]>
> = Object.freeze({
  QUEUED: Object.freeze(["SENDING", "SUPPRESSED"] as const),
  SENDING: Object.freeze([
    "ACCEPTED",
    "UNKNOWN",
    "RETRY_SCHEDULED",
    "FAILED_PERMANENT",
  ] as const),
  ACCEPTED: Object.freeze(["DELIVERED", "BOUNCED", "COMPLAINED"] as const),
  DELIVERED: Object.freeze(["COMPLAINED"] as const),
  RETRY_SCHEDULED: Object.freeze(["SENDING", "SUPPRESSED"] as const),
  UNKNOWN: Object.freeze([
    "ACCEPTED",
    "DELIVERED",
    "RETRY_SCHEDULED",
    "FAILED_PERMANENT",
    "BOUNCED",
    "COMPLAINED",
  ] as const),
  FAILED_PERMANENT: Object.freeze([]),
  BOUNCED: Object.freeze([]),
  COMPLAINED: Object.freeze([]),
  SUPPRESSED: Object.freeze([]),
});

const PROVIDER_STATUSES = Object.freeze([
  "ACCEPTED",
  "DELIVERED",
  "BOUNCED",
  "COMPLAINED",
  "FAILED_PERMANENT",
] as const);

function validSnapshot(value: unknown): value is NotificationDeliverySnapshot {
  return (
    isExactRecord(value, [
      "status",
      "attemptCount",
      "processedProviderEventIds",
    ]) &&
    typeof value.status === "string" &&
    NOTIFICATION_DELIVERY_STATUSES.includes(
      value.status as NotificationDeliveryStatus,
    ) &&
    Number.isSafeInteger(value.attemptCount) &&
    (value.attemptCount as number) >= 0 &&
    (value.attemptCount as number) <= 100 &&
    Array.isArray(value.processedProviderEventIds) &&
    value.processedProviderEventIds.length <= 1_000 &&
    value.processedProviderEventIds.every(isNotificationIdentifier) &&
    new Set(value.processedProviderEventIds).size ===
      value.processedProviderEventIds.length
  );
}

function frozenSnapshot(
  status: NotificationDeliveryStatus,
  attemptCount: number,
  eventIds: readonly string[],
): NotificationDeliverySnapshot {
  return Object.freeze({
    status,
    attemptCount,
    processedProviderEventIds: Object.freeze([...eventIds]),
  });
}

export function decideInternalDeliveryTransition(
  current: unknown,
  proposedStatus: unknown,
): DeliveryTransitionDecision {
  if (
    !validSnapshot(current) ||
    typeof proposedStatus !== "string" ||
    !NOTIFICATION_DELIVERY_STATUSES.includes(
      proposedStatus as NotificationDeliveryStatus,
    ) ||
    PROVIDER_STATUSES.includes(proposedStatus as never)
  ) {
    throw new NotificationError("INVALID_DELIVERY_TRANSITION");
  }
  const nextStatus = proposedStatus as NotificationDeliveryStatus;
  if (!ALLOWED[current.status].includes(nextStatus)) return { action: "DENY" };
  const startsAttempt = nextStatus === "SENDING";
  if (startsAttempt && current.attemptCount >= 100) return { action: "DENY" };
  return {
    action: "APPLY",
    next: frozenSnapshot(
      nextStatus,
      current.attemptCount + (startsAttempt ? 1 : 0),
      current.processedProviderEventIds,
    ),
  };
}

export function decideProviderDeliveryTransition(
  current: unknown,
  providerEventId: unknown,
  proposedStatus: unknown,
): DeliveryTransitionDecision {
  if (
    !validSnapshot(current) ||
    !isNotificationIdentifier(providerEventId) ||
    typeof proposedStatus !== "string" ||
    !PROVIDER_STATUSES.includes(proposedStatus as never)
  ) {
    throw new NotificationError("INVALID_DELIVERY_TRANSITION");
  }
  if (current.processedProviderEventIds.includes(providerEventId)) {
    return { action: "ACK_REPLAY" };
  }
  const nextStatus = proposedStatus as NotificationDeliveryStatus;
  if (!ALLOWED[current.status].includes(nextStatus)) {
    return { action: "ACK_STALE" };
  }
  if (current.processedProviderEventIds.length >= 1_000) {
    return { action: "DENY" };
  }
  return {
    action: "APPLY",
    next: frozenSnapshot(nextStatus, current.attemptCount, [
      ...current.processedProviderEventIds,
      providerEventId,
    ]),
  };
}
