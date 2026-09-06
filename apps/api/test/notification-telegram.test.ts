import { describe, expect, it } from "vitest";

import {
  issueTelegramBindingToken,
  NotificationError,
  verifyTelegramBindingToken,
  verifyTelegramWebhookSecret,
} from "../src/notifications/index.js";

function deterministicIssue() {
  return issueTelegramBindingToken("user_1", 1_000, 600, () =>
    new Uint8Array(32).fill(7),
  );
}

describe("Telegram notification security", () => {
  it("issues a 32-byte base64url deep-link token and stores only its hash", () => {
    const issue = deterministicIssue();
    expect(issue.token).toHaveLength(43);
    expect(issue.token).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(issue.record.tokenHash).toHaveLength(43);
    expect(issue.record.tokenHash).not.toBe(issue.token);
    expect(JSON.stringify(issue.record)).not.toContain(issue.token);
    expect(issue.record.expiresAtEpochSeconds).toBe(1_600);
  });

  it("binds the immutable numeric Telegram identity to the stored user", () => {
    const issue = deterministicIssue();
    expect(
      verifyTelegramBindingToken(
        issue.token,
        "1234567890123",
        issue.record,
        1_599,
      ),
    ).toEqual({
      action: "BIND",
      userId: "user_1",
      telegramUserId: "1234567890123",
    });
  });

  it.each([
    ["tampered", "123", 1_599, null, null],
    ["valid", "username", 1_599, null, null],
    ["valid", "123", 1_600, null, null],
    ["valid", "123", 1_599, 1_500, null],
    ["valid", "123", 1_599, null, 1_500],
    ["valid", "9223372036854775808", 1_599, null, null],
  ])(
    "denies invalid, expired, used or revoked binding %#",
    (
      tokenKind,
      telegramUserId,
      now,
      usedAtEpochSeconds,
      revokedAtEpochSeconds,
    ) => {
      const issue = deterministicIssue();
      expect(
        verifyTelegramBindingToken(
          tokenKind === "valid" ? issue.token : tokenKind,
          telegramUserId,
          {
            ...issue.record,
            usedAtEpochSeconds,
            revokedAtEpochSeconds,
          },
          now,
        ),
      ).toEqual({ action: "DENY" });
    },
  );

  it.each([59, 901, 1.5])("rejects unsafe TTL %s", (ttlSeconds) => {
    expect(() =>
      issueTelegramBindingToken(
        "user_1",
        1_000,
        ttlSeconds,
        () => new Uint8Array(32),
      ),
    ).toThrowError(new NotificationError("INVALID_TELEGRAM_CONFIGURATION"));
  });

  it("authenticates customer and Ops webhook secrets independently", () => {
    const customerSecret = "customer_secret_123";
    const opsSecret = "ops_secret_456";
    expect(verifyTelegramWebhookSecret(customerSecret, customerSecret)).toBe(
      true,
    );
    expect(verifyTelegramWebhookSecret(opsSecret, opsSecret)).toBe(true);
    expect(verifyTelegramWebhookSecret(customerSecret, opsSecret)).toBe(false);
    expect(verifyTelegramWebhookSecret(undefined, opsSecret)).toBe(false);
    expect(verifyTelegramWebhookSecret("invalid secret", opsSecret)).toBe(
      false,
    );
    expect(verifyTelegramWebhookSecret("a".repeat(257), opsSecret)).toBe(false);
  });
});
