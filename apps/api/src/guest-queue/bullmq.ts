import {
  Queue,
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type Job,
  type QueueOptions,
  type WorkerOptions,
} from "bullmq";

import {
  GUEST_SCAN_JOB_NAME,
  GUEST_SCAN_QUEUE_NAME,
  type GuestQueueMessage,
  type GuestQueueProcessResult,
} from "./model.js";
import { createGuestQueueMessage, parseGuestQueueMessage } from "./message.js";

const TRANSPORT_ATTEMPTS = 12;

export interface GuestQueueProducer {
  enqueue(guestScanId: unknown): Promise<Readonly<GuestQueueMessage>>;
  close(): Promise<void>;
}

function queueOptions(connection: ConnectionOptions): QueueOptions {
  return {
    connection,
    defaultJobOptions: {
      attempts: TRANSPORT_ATTEMPTS,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 3_600, count: 10_000 },
      removeOnFail: { age: 86_400, count: 10_000 },
    },
  };
}

export function createBullMqGuestQueueProducer(
  connection: ConnectionOptions,
): GuestQueueProducer {
  const queue = new Queue<GuestQueueMessage>(
    GUEST_SCAN_QUEUE_NAME,
    queueOptions(connection),
  );
  return Object.freeze({
    async enqueue(guestScanId: unknown) {
      const message = createGuestQueueMessage(guestScanId);
      await queue.add(GUEST_SCAN_JOB_NAME, message, {
        jobId: `guest_scan_${message.guest_scan_id}`,
      });
      return message;
    },
    async close() {
      await queue.close();
    },
  });
}

export function createBullMqGuestQueueWorker(
  connection: ConnectionOptions,
  process: (value: unknown) => Promise<GuestQueueProcessResult>,
  options: Readonly<{ concurrency?: number }> = {},
): Worker<GuestQueueMessage, GuestQueueProcessResult> {
  const concurrency = options.concurrency ?? 1;
  if (
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 64
  ) {
    throw new Error("INVALID_GUEST_QUEUE_CONCURRENCY");
  }
  const workerOptions: WorkerOptions = {
    connection,
    concurrency,
    autorun: true,
  };
  return new Worker<GuestQueueMessage, GuestQueueProcessResult>(
    GUEST_SCAN_QUEUE_NAME,
    async (job: Job<GuestQueueMessage>) => {
      if (
        job.name !== GUEST_SCAN_JOB_NAME ||
        !parseGuestQueueMessage(job.data)
      ) {
        throw new UnrecoverableError("INVALID_GUEST_QUEUE_JOB");
      }
      return process(job.data);
    },
    workerOptions,
  );
}
