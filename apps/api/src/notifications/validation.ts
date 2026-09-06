import {
  NOTIFICATION_PRIORITIES,
  NotificationError,
  type NotificationEvent,
  type NotificationEventType,
  type NotificationPriority,
} from "./model.js";
import {
  NOTIFICATION_EVENT_CATALOG,
  getNotificationEventDefinition,
} from "./catalog.js";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const EVENT_TYPES = new Set(
  NOTIFICATION_EVENT_CATALOG.map(({ eventType }) => eventType),
);

export function isNotificationIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

export function isExactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.every((key) => typeof key === "string") &&
    ownKeys.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function invalid(): never {
  throw new NotificationError("INVALID_EVENT");
}

export function validateNotificationEvent(input: unknown): NotificationEvent {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid();
  }
  const candidate = input as Record<string, unknown>;
  if (
    typeof candidate.eventType !== "string" ||
    !EVENT_TYPES.has(candidate.eventType as NotificationEventType)
  ) {
    throw new NotificationError("UNKNOWN_EVENT_TYPE");
  }
  const eventType = candidate.eventType as NotificationEventType;
  const definition = getNotificationEventDefinition(eventType);
  const scopedKey =
    definition.scope === "ACCOUNT"
      ? "userId"
      : definition.scope === "TENANT"
        ? "organizationId"
        : "serviceId";
  const keys = [
    "schemaVersion",
    "eventId",
    "eventType",
    "scope",
    "occurredAtEpochSeconds",
    "priority",
    "subjectReferenceId",
    scopedKey,
  ];
  if (
    !isExactRecord(input, keys) ||
    candidate.schemaVersion !== 1 ||
    candidate.scope !== definition.scope ||
    !isNotificationIdentifier(candidate.eventId) ||
    !isNotificationIdentifier(candidate.subjectReferenceId) ||
    !isNotificationIdentifier(candidate[scopedKey]) ||
    !Number.isSafeInteger(candidate.occurredAtEpochSeconds) ||
    (candidate.occurredAtEpochSeconds as number) < 0 ||
    typeof candidate.priority !== "string" ||
    !NOTIFICATION_PRIORITIES.includes(
      candidate.priority as NotificationPriority,
    )
  ) {
    return invalid();
  }
  return Object.freeze({ ...candidate }) as unknown as NotificationEvent;
}
