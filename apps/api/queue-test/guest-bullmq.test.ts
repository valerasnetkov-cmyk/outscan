import { Queue, type ConnectionOptions, type Job } from "bullmq";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createBullMqGuestQueueProducer,
  createBullMqGuestQueueWorker,
  GUEST_SCAN_QUEUE_NAME,
  type GuestQueueMessage,
  type GuestQueueProcessResult,
} from "../src/guest-queue/index.js";

const redisUrl = process.env.OUTSCAN_TEST_REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

function connectionFromUrl(value: string): ConnectionOptions {
  const parsed = new URL(value);
  const database = parsed.pathname.slice(1);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.password
      ? { password: decodeURIComponent(parsed.password) }
      : {}),
    ...(database ? { db: Number(database) } : {}),
  };
}

function waitForEvent<T>(
  subscribe: (resolve: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("QUEUE_EVENT_TIMEOUT")),
      5_000,
    );
    subscribe((value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
}

describeRedis("BullMQ Guest transport", () => {
  const connection = connectionFromUrl(redisUrl ?? "redis://127.0.0.1:6379/0");
  const admin = new Queue<GuestQueueMessage>(GUEST_SCAN_QUEUE_NAME, {
    connection,
  });
  const closeables: Array<{ close(): Promise<void> }> = [];

  beforeEach(async () => {
    await admin.obliterate({ force: true });
  });

  afterEach(async () => {
    await Promise.allSettled(
      closeables.splice(0).map((value) => value.close()),
    );
    await admin.obliterate({ force: true });
  });

  afterAll(async () => {
    await admin.close();
  });

  it("delivers the minimal payload once for duplicate enqueue", async () => {
    const process = vi.fn(
      async (value: unknown): Promise<GuestQueueProcessResult> => {
        expect(value).toEqual({
          schema_version: 1,
          guest_scan_id: "scan_queue_01",
        });
        return { outcome: "COMMITTED" };
      },
    );
    const worker = createBullMqGuestQueueWorker(connection, process);
    const producer = createBullMqGuestQueueProducer(connection);
    closeables.push(worker, producer);
    await worker.waitUntilReady();
    const completed = waitForEvent<Job<GuestQueueMessage>>((resolve) => {
      worker.once("completed", resolve);
    });

    await producer.enqueue("scan_queue_01");
    const job = await completed;
    await producer.enqueue("scan_queue_01");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(job.id).toBe("guest_scan_scan_queue_01");
    expect(process).toHaveBeenCalledTimes(1);
    expect(await admin.getJobCounts("completed")).toMatchObject({
      completed: 1,
    });
  });

  it("fails an unknown job name without invoking the processor or retrying", async () => {
    const process = vi.fn(async (): Promise<GuestQueueProcessResult> => {
      return { outcome: "COMMITTED" };
    });
    const worker = createBullMqGuestQueueWorker(connection, process);
    closeables.push(worker);
    await worker.waitUntilReady();
    const failed = waitForEvent<Job<GuestQueueMessage>>((resolve) => {
      worker.once("failed", (job) => {
        if (job) resolve(job);
      });
    });

    await admin.add(
      "foreign-job",
      { schema_version: 1, guest_scan_id: "scan_queue_02" },
      { attempts: 5 },
    );
    const job = await failed;

    expect(job.attemptsMade).toBe(1);
    expect(process).not.toHaveBeenCalled();
  });
});
