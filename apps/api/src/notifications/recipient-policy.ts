import { getNotificationEventDefinition } from "./catalog.js";
import {
  NotificationError,
  type NotificationEvent,
  type NotificationRecipientIntent,
} from "./model.js";
import { isExactRecord, isNotificationIdentifier } from "./validation.js";

const MEMBER_ROLES = ["OWNER", "ADMIN", "ANALYST"] as const;

function invalid(): never {
  throw new NotificationError("INVALID_RECIPIENT_CONTEXT");
}

function intent(
  eventId: string,
  principalId: string,
  endpointId: string,
  channel: NotificationRecipientIntent["channel"],
): NotificationRecipientIntent {
  return Object.freeze({
    eventId,
    principalKind: "USER",
    principalId,
    endpointId,
    channel,
  });
}

function resolveAccount(
  event: Extract<NotificationEvent, { scope: "ACCOUNT" }>,
  context: unknown,
): readonly NotificationRecipientIntent[] {
  const keys = ["scope", "userId", "emailEndpointId", "endpointActive"];
  if (!isExactRecord(context, keys)) return invalid();
  if (
    context.scope !== "ACCOUNT" ||
    context.userId !== event.userId ||
    !isNotificationIdentifier(context.userId) ||
    !isNotificationIdentifier(context.emailEndpointId) ||
    typeof context.endpointActive !== "boolean"
  ) {
    return invalid();
  }
  if (!context.endpointActive) return Object.freeze([]);
  return Object.freeze([
    intent(
      event.eventId,
      context.userId,
      context.emailEndpointId,
      "EMAIL_TRANSACTIONAL",
    ),
  ]);
}

function resolveTenant(
  event: Extract<NotificationEvent, { scope: "TENANT" }>,
  context: unknown,
): readonly NotificationRecipientIntent[] {
  if (!isExactRecord(context, ["scope", "organizationId", "members"])) {
    return invalid();
  }
  if (
    context.scope !== "TENANT" ||
    !isNotificationIdentifier(context.organizationId) ||
    !Array.isArray(context.members) ||
    context.members.length > 1_000
  ) {
    return invalid();
  }
  if (context.organizationId !== event.organizationId) {
    throw new NotificationError("CROSS_TENANT_CONTEXT");
  }

  const intents: NotificationRecipientIntent[] = [];
  const endpointIds = new Set<string>();
  for (const member of context.members) {
    const keys = [
      "organizationId",
      "userId",
      "role",
      "status",
      "emailEndpointId",
      "telegramEndpointId",
      "technicalEmailEnabled",
      "technicalTelegramEnabled",
    ];
    if (!isExactRecord(member, keys)) return invalid();
    if (member.organizationId !== event.organizationId) {
      throw new NotificationError("CROSS_TENANT_CONTEXT");
    }
    if (
      !isNotificationIdentifier(member.userId) ||
      !MEMBER_ROLES.includes(member.role as (typeof MEMBER_ROLES)[number]) ||
      !["ACTIVE", "REMOVED"].includes(member.status as string) ||
      typeof member.technicalEmailEnabled !== "boolean" ||
      typeof member.technicalTelegramEnabled !== "boolean" ||
      (member.emailEndpointId !== null &&
        !isNotificationIdentifier(member.emailEndpointId)) ||
      (member.telegramEndpointId !== null &&
        !isNotificationIdentifier(member.telegramEndpointId))
    ) {
      return invalid();
    }
    if (member.status !== "ACTIVE") continue;
    if (
      member.technicalEmailEnabled &&
      typeof member.emailEndpointId === "string" &&
      !endpointIds.has(member.emailEndpointId)
    ) {
      endpointIds.add(member.emailEndpointId);
      intents.push(
        intent(
          event.eventId,
          member.userId,
          member.emailEndpointId,
          "EMAIL_TECHNICAL",
        ),
      );
    }
    if (
      member.technicalTelegramEnabled &&
      typeof member.telegramEndpointId === "string" &&
      !endpointIds.has(member.telegramEndpointId)
    ) {
      endpointIds.add(member.telegramEndpointId);
      intents.push(
        intent(
          event.eventId,
          member.userId,
          member.telegramEndpointId,
          "TELEGRAM_CUSTOMER",
        ),
      );
    }
  }
  return Object.freeze(intents);
}

function resolvePlatform(
  event: Extract<NotificationEvent, { scope: "PLATFORM" }>,
  context: unknown,
): readonly NotificationRecipientIntent[] {
  if (!isExactRecord(context, ["scope", "opsEndpointId", "endpointActive"])) {
    return invalid();
  }
  if (
    context.scope !== "PLATFORM" ||
    !isNotificationIdentifier(context.opsEndpointId) ||
    typeof context.endpointActive !== "boolean"
  ) {
    return invalid();
  }
  if (!context.endpointActive) return Object.freeze([]);
  return Object.freeze([
    Object.freeze({
      eventId: event.eventId,
      principalKind: "OPS_CONFIG",
      principalId: "OUTSCAN_OPS",
      endpointId: context.opsEndpointId,
      channel: "TELEGRAM_OPS",
    }),
  ]);
}

export function resolveNotificationRecipients(
  event: NotificationEvent,
  trustedContext: unknown,
): readonly NotificationRecipientIntent[] {
  const definition = getNotificationEventDefinition(event.eventType);
  if (definition.scope !== event.scope) {
    throw new NotificationError("SCOPE_MISMATCH");
  }
  if (event.scope === "ACCOUNT") return resolveAccount(event, trustedContext);
  if (event.scope === "TENANT") return resolveTenant(event, trustedContext);
  return resolvePlatform(event, trustedContext);
}
