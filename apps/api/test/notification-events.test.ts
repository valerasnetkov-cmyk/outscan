import { describe, expect, it } from "vitest";

import {
  getNotificationEventDefinition,
  NOTIFICATION_EVENT_CATALOG,
  NotificationError,
  validateNotificationEvent,
} from "../src/notifications/index.js";

function eventFor(definition: (typeof NOTIFICATION_EVENT_CATALOG)[number]) {
  return {
    schemaVersion: 1,
    eventId: `event_${definition.eventType}`,
    eventType: definition.eventType,
    scope: definition.scope,
    occurredAtEpochSeconds: 1_000,
    priority: "HIGH",
    subjectReferenceId: "subject_1",
    ...(definition.scope === "ACCOUNT"
      ? { userId: "user_1" }
      : definition.scope === "TENANT"
        ? { organizationId: "org_1" }
        : { serviceId: "service_1" }),
  };
}

describe("notification event catalog", () => {
  it("contains unique closed definitions for every supported event", () => {
    expect(NOTIFICATION_EVENT_CATALOG).toHaveLength(24);
    expect(
      new Set(NOTIFICATION_EVENT_CATALOG.map(({ eventType }) => eventType))
        .size,
    ).toBe(24);
    for (const definition of NOTIFICATION_EVENT_CATALOG) {
      expect(getNotificationEventDefinition(definition.eventType)).toBe(
        definition,
      );
      expect(validateNotificationEvent(eventFor(definition))).toEqual(
        eventFor(definition),
      );
    }
  });

  it("keeps account, tenant and platform channels isolated", () => {
    expect(
      getNotificationEventDefinition("ACCOUNT_EMAIL_VERIFICATION"),
    ).toMatchObject({
      scope: "ACCOUNT",
      stream: "ACCOUNT_TRANSACTIONAL",
      channels: ["EMAIL_TRANSACTIONAL"],
      mandatory: true,
    });
    expect(getNotificationEventDefinition("FINDING_CREATED")).toMatchObject({
      scope: "TENANT",
      stream: "CUSTOMER_TECHNICAL",
      channels: ["EMAIL_TECHNICAL", "TELEGRAM_CUSTOMER"],
    });
    expect(getNotificationEventDefinition("WORKER_UNHEALTHY")).toMatchObject({
      scope: "PLATFORM",
      channels: ["TELEGRAM_OPS"],
    });
  });

  it.each([
    {},
    { ...eventFor(NOTIFICATION_EVENT_CATALOG[0]!), schemaVersion: 2 },
    { ...eventFor(NOTIFICATION_EVENT_CATALOG[0]!), priority: "URGENT" },
    { ...eventFor(NOTIFICATION_EVENT_CATALOG[0]!), scope: "TENANT" },
    { ...eventFor(NOTIFICATION_EVENT_CATALOG[0]!), recipient: "victim" },
    { ...eventFor(NOTIFICATION_EVENT_CATALOG[0]!), category: "MARKETING" },
  ])("rejects malformed or extra event fields %#", (input) => {
    expect(() => validateNotificationEvent(input)).toThrow(NotificationError);
  });

  it("rejects marketing and provider-defined event names", () => {
    expect(() =>
      validateNotificationEvent({
        ...eventFor(NOTIFICATION_EVENT_CATALOG[0]!),
        eventType: "MARKETING_CAMPAIGN",
      }),
    ).toThrowError(new NotificationError("UNKNOWN_EVENT_TYPE"));
  });
});
