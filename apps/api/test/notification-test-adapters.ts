import type {
  NotificationAdapterResult,
  NotificationDeliveryMessage,
} from "../src/notifications/index.js";

export class FakeNotificationAdapter {
  readonly messages: NotificationDeliveryMessage[] = [];

  constructor(
    private readonly result: NotificationAdapterResult = {
      outcome: "ACCEPTED",
      providerReference: "fake-provider-reference",
    },
  ) {}

  async send(
    message: NotificationDeliveryMessage,
  ): Promise<NotificationAdapterResult> {
    this.messages.push(
      Object.freeze({
        ...message,
        content: Object.freeze({ ...message.content }),
      }),
    );
    return Object.freeze({ ...this.result });
  }
}
