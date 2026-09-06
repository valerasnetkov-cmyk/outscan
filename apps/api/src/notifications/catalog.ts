import {
  ACCOUNT_NOTIFICATION_EVENT_TYPES,
  PLATFORM_NOTIFICATION_EVENT_TYPES,
  TENANT_NOTIFICATION_EVENT_TYPES,
  NotificationError,
  type NotificationEventDefinition,
  type NotificationEventType,
  type NotificationSubjectKind,
} from "./model.js";

function accountDefinition(
  eventType: (typeof ACCOUNT_NOTIFICATION_EVENT_TYPES)[number],
): NotificationEventDefinition {
  return Object.freeze({
    eventType,
    scope: "ACCOUNT",
    category: "ACCOUNT",
    stream: "ACCOUNT_TRANSACTIONAL",
    subjectKind:
      eventType === "ORGANIZATION_INVITATION" ? "ORGANIZATION" : "ACCOUNT",
    mandatory: true,
    channels: Object.freeze(["EMAIL_TRANSACTIONAL"] as const),
  });
}

const TENANT_SUBJECTS: Readonly<
  Record<
    (typeof TENANT_NOTIFICATION_EVENT_TYPES)[number],
    NotificationSubjectKind
  >
> = Object.freeze({
  FINDING_CREATED: "FINDING",
  FINDING_REOPENED: "FINDING",
  THREAT_INTEL_MATCHED: "FINDING",
  ASSET_DISCOVERED: "ASSET",
  POSTURE_REGRESSION: "ASSET",
  CERTIFICATE_EXPIRING: "ASSET",
  SECURITY_SCORE_CHANGED: "ORGANIZATION",
  MONITORING_FAILED: "MONITORING",
  MONITORING_SUSPENDED: "MONITORING",
});

function tenantDefinition(
  eventType: (typeof TENANT_NOTIFICATION_EVENT_TYPES)[number],
): NotificationEventDefinition {
  return Object.freeze({
    eventType,
    scope: "TENANT",
    category: eventType.startsWith("MONITORING_") ? "MONITORING" : "SECURITY",
    stream: "CUSTOMER_TECHNICAL",
    subjectKind: TENANT_SUBJECTS[eventType],
    mandatory: false,
    channels: Object.freeze(["EMAIL_TECHNICAL", "TELEGRAM_CUSTOMER"] as const),
  });
}

function platformDefinition(
  eventType: (typeof PLATFORM_NOTIFICATION_EVENT_TYPES)[number],
): NotificationEventDefinition {
  return Object.freeze({
    eventType,
    scope: "PLATFORM",
    category: "PLATFORM",
    stream: "PLATFORM_OPERATIONS",
    subjectKind: "SERVICE",
    mandatory: true,
    channels: Object.freeze(["TELEGRAM_OPS"] as const),
  });
}

export const NOTIFICATION_EVENT_CATALOG = Object.freeze([
  ...ACCOUNT_NOTIFICATION_EVENT_TYPES.map(accountDefinition),
  ...TENANT_NOTIFICATION_EVENT_TYPES.map(tenantDefinition),
  ...PLATFORM_NOTIFICATION_EVENT_TYPES.map(platformDefinition),
]);

const DEFINITIONS = new Map<NotificationEventType, NotificationEventDefinition>(
  NOTIFICATION_EVENT_CATALOG.map((definition) => [
    definition.eventType,
    definition,
  ]),
);

export function getNotificationEventDefinition(
  eventType: unknown,
): NotificationEventDefinition {
  const definition = DEFINITIONS.get(eventType as NotificationEventType);
  if (!definition) throw new NotificationError("UNKNOWN_EVENT_TYPE");
  return definition;
}
