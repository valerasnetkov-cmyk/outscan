import { describe, expect, it, vi } from "vitest";

import {
  classifyGuestQueueAlert,
  createDurableGuestQueueTelemetry,
  emptyGuestQueueOutcomeCounts,
  startGuestQueueTelemetryScheduler,
  validateGuestQueueTelemetryBatch,
  type GuestQueueTelemetryBatch,
  type GuestQueueTelemetryStore,
} from "../src/guest-telemetry/index.js";

function memoryStore(
  records: GuestQueueTelemetryBatch[],
): GuestQueueTelemetryStore {
  return {
    async recordAndPrune(value) {
      const record = validateGuestQueueTelemetryBatch(value);
      if (!record) return { ok: false, code: "INVALID_REQUEST" };
      records.push(record);
      return { ok: true, duplicate: false };
    },
  };
}

describe("durable Guest queue telemetry", () => {
  it("stores bounded counters and the highest-priority closed alert", async () => {
    const records: GuestQueueTelemetryBatch[] = [];
    let now = 100;
    const telemetry = createDurableGuestQueueTelemetry({
      store: memoryStore(records),
      create_batch_id: () => "queue_batch_01",
      now_unix_seconds: () => now,
    });
    telemetry.record("COMMITTED");
    telemetry.record("RETRY_COMMIT");
    now = 105;

    await expect(telemetry.flush()).resolves.toEqual({
      ok: true,
      action: "STORED",
      duplicate: false,
    });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      batch_id: "queue_batch_01",
      started_at_unix_seconds: 100n,
      finished_at_unix_seconds: 105n,
      counts: { COMMITTED: 1, RETRY_COMMIT: 1 },
      counter_saturated: false,
      alert_code: "GUEST_QUEUE_RESULT_INGRESS_FAILURE",
    });
    expect(
      JSON.stringify(records[0], (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    ).not.toMatch(/guest_scan|target|payload|token|organization/iu);
  });

  it("retains an exact pending batch across failure while collecting new data", async () => {
    const calls: unknown[] = [];
    let attempt = 0;
    let id = 0;
    let now = 100;
    const telemetry = createDurableGuestQueueTelemetry({
      store: {
        async recordAndPrune(value) {
          calls.push(value);
          attempt += 1;
          return attempt === 1
            ? { ok: false, code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE" }
            : { ok: true, duplicate: attempt === 2 };
        },
      },
      create_batch_id: () => `queue_batch_${++id}`,
      now_unix_seconds: () => now,
    });
    telemetry.record("COMMITTED");
    now = 101;
    await expect(telemetry.flush()).resolves.toMatchObject({ ok: false });
    telemetry.record("RETRY_HEARTBEAT");
    now = 102;
    await expect(telemetry.flush()).resolves.toEqual({
      ok: true,
      action: "STORED",
      duplicate: true,
    });
    expect(calls[1]).toBe(calls[0]);
    await telemetry.flush();
    expect(calls).toHaveLength(3);
    expect(calls[2]).toMatchObject({
      batch_id: "queue_batch_2",
      counts: { RETRY_HEARTBEAT: 1 },
    });
  });

  it("serializes concurrent flush calls and reports an empty buffer", async () => {
    const store = vi.fn(async () => ({ ok: true as const, duplicate: false }));
    const telemetry = createDurableGuestQueueTelemetry({
      store: { recordAndPrune: store },
      create_batch_id: () => "queue_batch_01",
      now_unix_seconds: () => 100,
    });
    await expect(telemetry.flush()).resolves.toEqual({
      ok: true,
      action: "EMPTY",
      duplicate: false,
    });
    telemetry.record("ALREADY_COMMITTED");
    const first = telemetry.flush();
    const second = telemetry.flush();
    expect(first).toBe(second);
    await first;
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown outcomes and invalid runtime state", async () => {
    const telemetry = createDurableGuestQueueTelemetry({
      store: memoryStore([]),
      create_batch_id: () => "invalid id",
      now_unix_seconds: () => 100,
    });
    expect(() => telemetry.record("UNKNOWN" as never)).toThrow(
      "INVALID_GUEST_QUEUE_TELEMETRY_OUTCOME",
    );
    telemetry.record("COMMITTED");
    await expect(telemetry.flush()).resolves.toEqual({
      ok: false,
      code: "INVALID_QUEUE_TELEMETRY_RUNTIME",
      alert_required: true,
    });
  });

  it("validates exact counter and alert projections", () => {
    const counts = emptyGuestQueueOutcomeCounts();
    counts.RETRY_REJECTION_SINK = 1;
    expect(classifyGuestQueueAlert(counts, false)).toBe(
      "GUEST_QUEUE_SECURITY_PATH_FAILURE",
    );
    const valid = {
      batch_id: "queue_batch_01",
      started_at_unix_seconds: 100n,
      finished_at_unix_seconds: 101n,
      counts,
      counter_saturated: false,
      alert_code: "GUEST_QUEUE_SECURITY_PATH_FAILURE",
    };
    expect(validateGuestQueueTelemetryBatch(valid)).not.toBeNull();
    expect(
      validateGuestQueueTelemetryBatch({ ...valid, target: "secret" }),
    ).toBeNull();
    expect(
      validateGuestQueueTelemetryBatch({ ...valid, alert_code: null }),
    ).toBeNull();
  });

  it("schedules non-overlapping flushes and flushes once more on stop", async () => {
    vi.useFakeTimers();
    try {
      let release: ((value: unknown) => void) | undefined;
      const first = new Promise((resolve) => {
        release = resolve;
      });
      const flush = vi
        .fn<() => Promise<unknown>>()
        .mockImplementationOnce(() => first)
        .mockResolvedValue({ ok: true, action: "EMPTY", duplicate: false });
      const outcomes: unknown[] = [];
      const scheduler = startGuestQueueTelemetryScheduler(
        { record: vi.fn(), flush } as never,
        1_000,
        (outcome) => outcomes.push(outcome),
      );

      await vi.advanceTimersByTimeAsync(5_000);
      expect(flush).toHaveBeenCalledTimes(1);
      release?.({ ok: true, action: "STORED", duplicate: false });
      await Promise.resolve();
      await scheduler.stop();

      expect(flush).toHaveBeenCalledTimes(2);
      expect(outcomes).toEqual([
        { ok: true, action: "STORED", duplicate: false },
        { ok: true, action: "EMPTY", duplicate: false },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("contains telemetry adapter and reporting failures", async () => {
    const report = vi.fn(() => {
      throw new Error("reporter detail");
    });
    const scheduler = startGuestQueueTelemetryScheduler(
      {
        record: vi.fn(),
        flush: async () => {
          throw new Error("database detail");
        },
      },
      1_000,
      report,
    );
    await expect(scheduler.stop()).resolves.toEqual({
      ok: false,
      code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE",
      alert_required: true,
    });
    expect(report).toHaveBeenCalledWith({
      ok: false,
      code: "QUEUE_TELEMETRY_STORE_UNAVAILABLE",
      alert_required: true,
    });
    expect(() =>
      startGuestQueueTelemetryScheduler(
        { record: vi.fn(), flush: vi.fn() } as never,
        999,
        vi.fn(),
      ),
    ).toThrow("INVALID_GUEST_QUEUE_TELEMETRY_SCHEDULER_CONFIGURATION");
  });
});
