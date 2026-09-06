import { createHash } from "node:crypto";
import { NotificationError, NOTIFICATION_CHANNELS } from "./model.js";
import { isExactRecord, isNotificationIdentifier } from "./validation.js";

const DOMAIN = Buffer.from("OUTSCAN:NOTIFICATION_DELIVERY:v1", "ascii");
const TEMPLATE_ID = /^[a-z][a-z0-9._-]{0,127}$/u;

function encodedField(value: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(bytes.length);
  return Buffer.concat([length, bytes]);
}

export function deriveNotificationDeliveryKey(input: unknown): string {
  const keys = [
    "eventId",
    "endpointId",
    "channel",
    "templateId",
    "templateVersion",
  ];
  if (!isExactRecord(input, keys)) {
    throw new NotificationError("INVALID_IDEMPOTENCY_INPUT");
  }
  if (
    !isNotificationIdentifier(input.eventId) ||
    !isNotificationIdentifier(input.endpointId) ||
    typeof input.channel !== "string" ||
    !NOTIFICATION_CHANNELS.includes(
      input.channel as (typeof NOTIFICATION_CHANNELS)[number],
    ) ||
    typeof input.templateId !== "string" ||
    !TEMPLATE_ID.test(input.templateId) ||
    !Number.isSafeInteger(input.templateVersion) ||
    (input.templateVersion as number) < 1 ||
    (input.templateVersion as number) > 1_000_000
  ) {
    throw new NotificationError("INVALID_IDEMPOTENCY_INPUT");
  }
  const digest = createHash("sha256");
  digest.update(encodedField(DOMAIN.toString("ascii")));
  digest.update(encodedField(input.eventId));
  digest.update(encodedField(input.endpointId));
  digest.update(encodedField(input.channel));
  digest.update(encodedField(input.templateId));
  digest.update(encodedField(String(input.templateVersion)));
  return digest.digest("base64url");
}
