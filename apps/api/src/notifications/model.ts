export const ACCOUNT_NOTIFICATION_EVENT_TYPES = [
  "ACCOUNT_EMAIL_VERIFICATION",
  "ACCOUNT_PASSWORD_RECOVERY",
  "ACCOUNT_SECURITY_CHANGED",
  "ORGANIZATION_INVITATION",
] as const;

export const TENANT_NOTIFICATION_EVENT_TYPES = [
  "FINDING_CREATED",
  "FINDING_REOPENED",
  "THREAT_INTEL_MATCHED",
  "ASSET_DISCOVERED",
  "POSTURE_REGRESSION",
  "CERTIFICATE_EXPIRING",
  "SECURITY_SCORE_CHANGED",
  "MONITORING_FAILED",
  "MONITORING_SUSPENDED",
] as const;

export const PLATFORM_NOTIFICATION_EVENT_TYPES = [
  "WORKER_UNHEALTHY",
  "QUEUE_DEGRADED",
  "SCAN_FAILURE_SPIKE",
  "THREAT_INTEL_SYNC_FAILED",
  "THREAT_INTEL_STALE",
  "SCANNER_RELEASE_FAILED",
  "EMAIL_DELIVERY_DEGRADED",
  "TELEGRAM_DELIVERY_DEGRADED",
  "ABUSE_SPIKE",
  "PLATFORM_SECURITY_EVENT",
  "BREAK_GLASS_ACCESS",
] as const;

export type AccountNotificationEventType =
  (typeof ACCOUNT_NOTIFICATION_EVENT_TYPES)[number];
export type TenantNotificationEventType =
  (typeof TENANT_NOTIFICATION_EVENT_TYPES)[number];
export type PlatformNotificationEventType =
  (typeof PLATFORM_NOTIFICATION_EVENT_TYPES)[number];
export type NotificationEventType =
  | AccountNotificationEventType
  | TenantNotificationEventType
  | PlatformNotificationEventType;

export const NOTIFICATION_PRIORITIES = [
  "CRITICAL",
  "HIGH",
  "NORMAL",
  "LOW",
] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_CHANNELS = [
  "EMAIL_TRANSACTIONAL",
  "EMAIL_TECHNICAL",
  "TELEGRAM_CUSTOMER",
  "TELEGRAM_OPS",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationScope = "ACCOUNT" | "TENANT" | "PLATFORM";
export type NotificationCategory =
  "ACCOUNT" | "SECURITY" | "MONITORING" | "PLATFORM";
export type NotificationStream =
  "ACCOUNT_TRANSACTIONAL" | "CUSTOMER_TECHNICAL" | "PLATFORM_OPERATIONS";
export type NotificationSubjectKind =
  "ACCOUNT" | "ORGANIZATION" | "ASSET" | "FINDING" | "MONITORING" | "SERVICE";

interface NotificationEventBase {
  schemaVersion: 1;
  eventId: string;
  occurredAtEpochSeconds: number;
  priority: NotificationPriority;
  subjectReferenceId: string;
}

export interface AccountNotificationEvent extends NotificationEventBase {
  scope: "ACCOUNT";
  eventType: AccountNotificationEventType;
  userId: string;
}

export interface TenantNotificationEvent extends NotificationEventBase {
  scope: "TENANT";
  eventType: TenantNotificationEventType;
  organizationId: string;
}

export interface PlatformNotificationEvent extends NotificationEventBase {
  scope: "PLATFORM";
  eventType: PlatformNotificationEventType;
  serviceId: string;
}

export type NotificationEvent =
  | AccountNotificationEvent
  | TenantNotificationEvent
  | PlatformNotificationEvent;

export interface NotificationEventDefinition {
  eventType: NotificationEventType;
  scope: NotificationScope;
  category: NotificationCategory;
  stream: NotificationStream;
  subjectKind: NotificationSubjectKind;
  mandatory: boolean;
  channels: readonly NotificationChannel[];
}

export interface NotificationRecipientIntent {
  eventId: string;
  principalKind: "USER" | "OPS_CONFIG";
  principalId: string;
  endpointId: string;
  channel: NotificationChannel;
}

export const NOTIFICATION_DELIVERY_STATUSES = [
  "QUEUED",
  "SENDING",
  "ACCEPTED",
  "DELIVERED",
  "RETRY_SCHEDULED",
  "UNKNOWN",
  "FAILED_PERMANENT",
  "BOUNCED",
  "COMPLAINED",
  "SUPPRESSED",
] as const;
export type NotificationDeliveryStatus =
  (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export interface NotificationDeliverySnapshot {
  status: NotificationDeliveryStatus;
  attemptCount: number;
  processedProviderEventIds: readonly string[];
}

export type NotificationErrorCode =
  | "INVALID_EVENT"
  | "UNKNOWN_EVENT_TYPE"
  | "SCOPE_MISMATCH"
  | "INVALID_RECIPIENT_CONTEXT"
  | "CROSS_TENANT_CONTEXT"
  | "INVALID_IDEMPOTENCY_INPUT"
  | "INVALID_CONTENT"
  | "INVALID_DELIVERY_TRANSITION"
  | "INVALID_TELEGRAM_CONFIGURATION";

export class NotificationError extends Error {
  constructor(readonly code: NotificationErrorCode) {
    super(code);
    this.name = "NotificationError";
  }
}
