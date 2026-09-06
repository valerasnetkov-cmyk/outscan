import type {
  NotificationChannel,
  NotificationEvent,
  NotificationRecipientIntent,
} from "./model.js";
import type { ExternalNotificationContent } from "./content.js";

export interface NotificationDeliveryMessage {
  deliveryId: string;
  idempotencyKey: string;
  channel: NotificationChannel;
  endpointId: string;
  templateId: string;
  templateVersion: number;
  content: ExternalNotificationContent;
}

export type EmailDeliveryMessage = NotificationDeliveryMessage & {
  channel: "EMAIL_TRANSACTIONAL" | "EMAIL_TECHNICAL";
};
export type TelegramCustomerDeliveryMessage = NotificationDeliveryMessage & {
  channel: "TELEGRAM_CUSTOMER";
};
export type TelegramOpsDeliveryMessage = NotificationDeliveryMessage & {
  channel: "TELEGRAM_OPS";
};

export type NotificationAdapterResult =
  | { outcome: "ACCEPTED"; providerReference: string }
  | { outcome: "UNKNOWN" }
  | { outcome: "REJECTED_PERMANENT"; errorCode: string };

export interface EmailProviderAdapter {
  send(message: EmailDeliveryMessage): Promise<NotificationAdapterResult>;
}

export interface TelegramCustomerAdapter {
  send(
    message: TelegramCustomerDeliveryMessage,
  ): Promise<NotificationAdapterResult>;
}

export interface TelegramOpsAdapter {
  send(message: TelegramOpsDeliveryMessage): Promise<NotificationAdapterResult>;
}

export interface NotificationOutboxTransactionPort {
  append(event: NotificationEvent): Promise<void>;
}

export interface NotificationDeliveryQueuePort {
  enqueue(intent: NotificationRecipientIntent): Promise<void>;
}
