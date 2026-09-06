import { describe, expect, it } from "vitest";

import {
  decideInternalDeliveryTransition,
  decideProviderDeliveryTransition,
  deriveNotificationDeliveryKey,
  NotificationError,
  type NotificationDeliverySnapshot,
} from "../src/notifications/index.js";

function snapshot(
  status: NotificationDeliverySnapshot["status"],
  attemptCount = 0,
  processedProviderEventIds: readonly string[] = [],
): NotificationDeliverySnapshot {
  return { status, attemptCount, processedProviderEventIds };
}

describe("notification delivery idempotency and state", () => {
  it("derives a stable domain-separated delivery key", () => {
    const input = {
      eventId: "event_1",
      endpointId: "endpoint_1",
      channel: "EMAIL_TECHNICAL",
      templateId: "security.finding",
      templateVersion: 3,
    };
    const key = deriveNotificationDeliveryKey(input);
    expect(key).toHaveLength(43);
    expect(deriveNotificationDeliveryKey({ ...input })).toBe(key);
    expect(
      deriveNotificationDeliveryKey({ ...input, templateVersion: 4 }),
    ).not.toBe(key);
  });

  it.each([
    {},
    {
      eventId: "event_1",
      endpointId: "endpoint_1",
      channel: "EMAIL_TECHNICAL",
      templateId: "../secret",
      templateVersion: 1,
    },
    {
      eventId: "event_1",
      endpointId: "endpoint_1",
      channel: "SMS",
      templateId: "security.finding",
      templateVersion: 1,
    },
  ])("rejects invalid delivery identity %#", (input) => {
    expect(() => deriveNotificationDeliveryKey(input)).toThrowError(
      new NotificationError("INVALID_IDEMPOTENCY_INPUT"),
    );
  });

  it("increments bounded attempts and represents an uncertain outcome", () => {
    const started = decideInternalDeliveryTransition(
      snapshot("QUEUED"),
      "SENDING",
    );
    expect(started).toEqual({
      action: "APPLY",
      next: snapshot("SENDING", 1),
    });
    expect(
      decideInternalDeliveryTransition(
        started.action === "APPLY" ? started.next : {},
        "UNKNOWN",
      ),
    ).toEqual({ action: "APPLY", next: snapshot("UNKNOWN", 1) });
  });

  it("acknowledges provider replay without another write", () => {
    expect(
      decideProviderDeliveryTransition(
        snapshot("ACCEPTED", 1, ["provider_event_1"]),
        "provider_event_1",
        "DELIVERED",
      ),
    ).toEqual({ action: "ACK_REPLAY" });
  });

  it("does not regress on a stale provider event", () => {
    expect(
      decideProviderDeliveryTransition(
        snapshot("DELIVERED", 1),
        "provider_event_late",
        "ACCEPTED",
      ),
    ).toEqual({ action: "ACK_STALE" });
  });

  it("allows a complaint to supersede delivered", () => {
    expect(
      decideProviderDeliveryTransition(
        snapshot("DELIVERED", 1),
        "provider_complaint_1",
        "COMPLAINED",
      ),
    ).toEqual({
      action: "APPLY",
      next: snapshot("COMPLAINED", 1, ["provider_complaint_1"]),
    });
  });

  it("bounds stored provider event identities", () => {
    const eventIds = Array.from(
      { length: 1_000 },
      (_, index) => `event_${index}`,
    );
    expect(
      decideProviderDeliveryTransition(
        snapshot("ACCEPTED", 1, eventIds),
        "event_overflow",
        "DELIVERED",
      ),
    ).toEqual({ action: "DENY" });
  });

  it("denies invalid internal and terminal transitions", () => {
    expect(
      decideInternalDeliveryTransition(snapshot("QUEUED"), "RETRY_SCHEDULED"),
    ).toEqual({ action: "DENY" });
    expect(
      decideInternalDeliveryTransition(snapshot("FAILED_PERMANENT"), "SENDING"),
    ).toEqual({ action: "DENY" });
  });
});
