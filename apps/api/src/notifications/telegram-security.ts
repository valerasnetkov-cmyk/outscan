import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NotificationError } from "./model.js";
import { isExactRecord, isNotificationIdentifier } from "./validation.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{1,256}$/u;
const TELEGRAM_USER_ID_PATTERN = /^[1-9][0-9]{0,19}$/u;
const MAX_TELEGRAM_USER_ID = 9_223_372_036_854_775_807n;
const TOKEN_DOMAIN = Buffer.from("OUTSCAN:TELEGRAM_BINDING:v1\0", "ascii");
const MAX_TTL_SECONDS = 900;

export interface TelegramBindingRecord {
  userId: string;
  tokenHash: string;
  expiresAtEpochSeconds: number;
  usedAtEpochSeconds: number | null;
  revokedAtEpochSeconds: number | null;
}

export interface TelegramBindingIssue {
  token: string;
  record: TelegramBindingRecord;
}

export type TelegramBindingDecision =
  | { action: "BIND"; userId: string; telegramUserId: string }
  | { action: "DENY" };

function tokenHash(token: string): string {
  return createHash("sha256")
    .update(TOKEN_DOMAIN)
    .update(token, "ascii")
    .digest("base64url");
}

function validTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function issueTelegramBindingToken(
  userId: string,
  nowEpochSeconds: number,
  ttlSeconds = 600,
  randomBytesFn: (size: number) => Uint8Array = randomBytes,
): TelegramBindingIssue {
  if (
    !isNotificationIdentifier(userId) ||
    !validTime(nowEpochSeconds) ||
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 60 ||
    ttlSeconds > MAX_TTL_SECONDS ||
    typeof randomBytesFn !== "function"
  ) {
    throw new NotificationError("INVALID_TELEGRAM_CONFIGURATION");
  }
  const entropy = randomBytesFn(32);
  if (entropy.length !== 32) {
    throw new NotificationError("INVALID_TELEGRAM_CONFIGURATION");
  }
  const token = Buffer.from(entropy).toString("base64url");
  return Object.freeze({
    token,
    record: Object.freeze({
      userId,
      tokenHash: tokenHash(token),
      expiresAtEpochSeconds: nowEpochSeconds + ttlSeconds,
      usedAtEpochSeconds: null,
      revokedAtEpochSeconds: null,
    }),
  });
}

export function verifyTelegramBindingToken(
  token: unknown,
  telegramUserId: unknown,
  record: unknown,
  nowEpochSeconds: number,
): TelegramBindingDecision {
  if (
    typeof token !== "string" ||
    !TOKEN_PATTERN.test(token) ||
    typeof telegramUserId !== "string" ||
    !TELEGRAM_USER_ID_PATTERN.test(telegramUserId) ||
    BigInt(telegramUserId) > MAX_TELEGRAM_USER_ID ||
    !isExactRecord(record, [
      "userId",
      "tokenHash",
      "expiresAtEpochSeconds",
      "usedAtEpochSeconds",
      "revokedAtEpochSeconds",
    ]) ||
    !isNotificationIdentifier(record.userId) ||
    typeof record.tokenHash !== "string" ||
    !TOKEN_PATTERN.test(record.tokenHash) ||
    !validTime(record.expiresAtEpochSeconds) ||
    !validTime(nowEpochSeconds) ||
    nowEpochSeconds >= record.expiresAtEpochSeconds ||
    record.usedAtEpochSeconds !== null ||
    record.revokedAtEpochSeconds !== null
  ) {
    return { action: "DENY" };
  }
  const actual = Buffer.from(tokenHash(token), "ascii");
  const expected = Buffer.from(record.tokenHash, "ascii");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { action: "DENY" };
  }
  return Object.freeze({
    action: "BIND",
    userId: record.userId,
    telegramUserId,
  });
}

export function verifyTelegramWebhookSecret(
  presentedSecret: unknown,
  configuredSecret: unknown,
): boolean {
  if (
    typeof presentedSecret !== "string" ||
    typeof configuredSecret !== "string" ||
    !WEBHOOK_SECRET_PATTERN.test(presentedSecret) ||
    !WEBHOOK_SECRET_PATTERN.test(configuredSecret)
  ) {
    return false;
  }
  const actual = Buffer.from(presentedSecret, "ascii");
  const expected = Buffer.from(configuredSecret, "ascii");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
