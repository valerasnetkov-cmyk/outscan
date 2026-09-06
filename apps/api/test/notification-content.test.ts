import { describe, expect, it } from "vitest";

import {
  createExternalNotificationContent,
  NotificationError,
  type EmailProviderAdapter,
  type TelegramCustomerAdapter,
  type TelegramOpsAdapter,
} from "../src/notifications/index.js";
import { FakeNotificationAdapter } from "./notification-test-adapters.js";

describe("external notification content", () => {
  it("creates only the allowlisted summary and canonical OUTSCAN link", () => {
    expect(
      createExternalNotificationContent({
        headline: "SECURITY_RISK_DETECTED",
        assetHostname: "api.example.ru",
        risk: "CRITICAL",
        status: "NEW",
        action: "REVIEW_SECURITY",
        path: "/workspace/findings/finding_1",
      }),
    ).toEqual({
      headline: "SECURITY_RISK_DETECTED",
      assetHostname: "api.example.ru",
      risk: "CRITICAL",
      status: "NEW",
      action: "REVIEW_SECURITY",
      actionUrl: "https://outscan.ru/workspace/findings/finding_1",
    });
  });

  it.each([
    {
      headline: "SECURITY_RISK_DETECTED",
      assetHostname: "API.EXAMPLE.RU",
      risk: "CRITICAL",
      status: "NEW",
      action: "REVIEW_SECURITY",
      path: "/workspace/findings/one",
    },
    {
      headline: "<script>alert(1)</script>",
      risk: "HIGH",
      status: "NEW",
      action: "OPEN_OUTSCAN",
      path: "/workspace/assets/one",
    },
    {
      headline: "SECURITY_RISK_DETECTED",
      risk: "HIGH",
      status: "NEW",
      action: "OPEN_OUTSCAN",
      path: "//attacker.example/path",
    },
    {
      headline: "SECURITY_RISK_DETECTED",
      risk: "HIGH",
      status: "NEW",
      action: "OPEN_OUTSCAN",
      path: "/workspace/assets/one",
      rawFindingEvidence: "Authorization: Bearer secret",
    },
  ])("rejects unsafe or extra content %#", (input) => {
    expect(() => createExternalNotificationContent(input)).toThrowError(
      new NotificationError("INVALID_CONTENT"),
    );
  });

  it("supports isolated fake adapters without provider SDKs", async () => {
    const email: EmailProviderAdapter = new FakeNotificationAdapter();
    const customerTelegram: TelegramCustomerAdapter =
      new FakeNotificationAdapter({ outcome: "UNKNOWN" });
    const opsTelegram: TelegramOpsAdapter = new FakeNotificationAdapter({
      outcome: "REJECTED_PERMANENT",
      errorCode: "FAKE_REJECTED",
    });
    const content = createExternalNotificationContent({
      headline: "PLATFORM_ATTENTION_REQUIRED",
      risk: "NONE",
      status: "DEGRADED",
      action: "OPEN_OUTSCAN",
      path: "/admin/operations",
    });
    const baseMessage = {
      deliveryId: "delivery_1",
      idempotencyKey: "idempotency_1",
      endpointId: "ops_endpoint",
      templateId: "platform.health",
      templateVersion: 1,
      content,
    };
    await expect(
      email.send({ ...baseMessage, channel: "EMAIL_TRANSACTIONAL" }),
    ).resolves.toMatchObject({
      outcome: "ACCEPTED",
    });
    await expect(
      customerTelegram.send({
        ...baseMessage,
        channel: "TELEGRAM_CUSTOMER",
      }),
    ).resolves.toEqual({ outcome: "UNKNOWN" });
    await expect(
      opsTelegram.send({ ...baseMessage, channel: "TELEGRAM_OPS" }),
    ).resolves.toEqual({
      outcome: "REJECTED_PERMANENT",
      errorCode: "FAKE_REJECTED",
    });
  });

  it("never exposes evidence or credentials in a safe projection", () => {
    const json = JSON.stringify(
      createExternalNotificationContent({
        headline: "ACCOUNT_ACTION_REQUIRED",
        risk: "NONE",
        status: "PENDING",
        action: "VERIFY_EMAIL",
        path: "/account/verify",
      }),
    );
    expect(json).not.toMatch(/evidence|cookie|authorization|scanner|token/iu);
  });
});
