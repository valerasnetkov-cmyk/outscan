import { describe, expect, it } from "vitest";

import {
  NotificationError,
  resolveNotificationRecipients,
  validateNotificationEvent,
} from "../src/notifications/index.js";

const accountEvent = validateNotificationEvent({
  schemaVersion: 1,
  eventId: "event_account",
  eventType: "ACCOUNT_EMAIL_VERIFICATION",
  scope: "ACCOUNT",
  occurredAtEpochSeconds: 1_000,
  priority: "HIGH",
  subjectReferenceId: "account_1",
  userId: "user_1",
});

const tenantEvent = validateNotificationEvent({
  schemaVersion: 1,
  eventId: "event_tenant",
  eventType: "FINDING_CREATED",
  scope: "TENANT",
  occurredAtEpochSeconds: 1_000,
  priority: "CRITICAL",
  subjectReferenceId: "finding_1",
  organizationId: "org_1",
});

describe("server-owned notification recipient resolution", () => {
  it("resolves mandatory account delivery without marketing state", () => {
    expect(
      resolveNotificationRecipients(accountEvent, {
        scope: "ACCOUNT",
        userId: "user_1",
        emailEndpointId: "endpoint_email_1",
        endpointActive: true,
      }),
    ).toEqual([
      {
        eventId: "event_account",
        principalKind: "USER",
        principalId: "user_1",
        endpointId: "endpoint_email_1",
        channel: "EMAIL_TRANSACTIONAL",
      },
    ]);
  });

  it("re-evaluates active tenant membership and preferences", () => {
    const intents = resolveNotificationRecipients(tenantEvent, {
      scope: "TENANT",
      organizationId: "org_1",
      members: [
        {
          organizationId: "org_1",
          userId: "user_active",
          role: "ADMIN",
          status: "ACTIVE",
          emailEndpointId: "endpoint_email_1",
          telegramEndpointId: "endpoint_telegram_1",
          technicalEmailEnabled: true,
          technicalTelegramEnabled: true,
        },
        {
          organizationId: "org_1",
          userId: "user_removed",
          role: "OWNER",
          status: "REMOVED",
          emailEndpointId: "endpoint_email_2",
          telegramEndpointId: null,
          technicalEmailEnabled: true,
          technicalTelegramEnabled: false,
        },
      ],
    });
    expect(intents.map(({ endpointId }) => endpointId)).toEqual([
      "endpoint_email_1",
      "endpoint_telegram_1",
    ]);
    expect(JSON.stringify(intents)).not.toContain("user_removed");
  });

  it("fails closed on cross-tenant membership data", () => {
    expect(() =>
      resolveNotificationRecipients(tenantEvent, {
        scope: "TENANT",
        organizationId: "org_1",
        members: [
          {
            organizationId: "org_2",
            userId: "user_2",
            role: "ADMIN",
            status: "ACTIVE",
            emailEndpointId: "endpoint_2",
            telegramEndpointId: null,
            technicalEmailEnabled: true,
            technicalTelegramEnabled: false,
          },
        ],
      }),
    ).toThrowError(new NotificationError("CROSS_TENANT_CONTEXT"));
  });

  it.each([
    { email: "victim@example.ru" },
    { chatId: "123" },
    { recipientUserId: "victim" },
    { marketingConsent: "REVOKED" },
  ])("rejects client-selected recipient fields %#", (override) => {
    expect(() =>
      resolveNotificationRecipients(accountEvent, {
        scope: "ACCOUNT",
        userId: "user_1",
        emailEndpointId: "endpoint_1",
        endpointActive: true,
        ...override,
      }),
    ).toThrowError(new NotificationError("INVALID_RECIPIENT_CONTEXT"));
  });

  it("uses only trusted platform endpoint configuration", () => {
    const event = validateNotificationEvent({
      schemaVersion: 1,
      eventId: "event_ops",
      eventType: "WORKER_UNHEALTHY",
      scope: "PLATFORM",
      occurredAtEpochSeconds: 1_000,
      priority: "CRITICAL",
      subjectReferenceId: "worker_pool_1",
      serviceId: "scanner_supervisor",
    });
    expect(
      resolveNotificationRecipients(event, {
        scope: "PLATFORM",
        opsEndpointId: "ops_endpoint",
        endpointActive: true,
      }),
    ).toEqual([
      {
        eventId: "event_ops",
        principalKind: "OPS_CONFIG",
        principalId: "OUTSCAN_OPS",
        endpointId: "ops_endpoint",
        channel: "TELEGRAM_OPS",
      },
    ]);
  });
});
