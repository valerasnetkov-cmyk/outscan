import { afterEach, describe, expect, it, vi } from "vitest";

import type { GuestRetentionWorker } from "../src/guest-persistence/index.js";
import {
  runGuestRetentionCycle,
  startGuestRetentionScheduler,
  validateGuestRetentionRunRecord,
  type GuestRetentionRunRecord,
  type GuestRetentionRunStore,
} from "../src/guest-retention/index.js";

const OBSERVED = 1_800_000_000n;

function success(moreWork: boolean, inconsistencies = 0) {
  return {
    ok: true as const,
    observed_at_unix_seconds: OBSERVED,
    due_scans_selected: 2,
    scans_deleted: 2,
    active_counter_decrements: 4,
    stale_windows_deleted: 3,
    inconsistencies,
    more_work: moreWork,
    alert_required: inconsistencies > 0,
  };
}

function runtime(
  worker: GuestRetentionWorker,
  store: GuestRetentionRunStore,
  now = () => Number(OBSERVED),
) {
  return {
    worker,
    run_store: store,
    create_run_id: () => "retention_run_01",
    now_unix_seconds: now,
  };
}

function memoryStore(
  records: GuestRetentionRunRecord[],
): GuestRetentionRunStore {
  return {
    async recordAndPrune(value) {
      const record = validateGuestRetentionRunRecord(value);
      if (!record) return { ok: false, code: "INVALID_REQUEST" };
      records.push(record);
      return { ok: true, duplicate: false };
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Guest retention runtime", () => {
  it("drains bounded batches and stores one aggregate outcome", async () => {
    const records: GuestRetentionRunRecord[] = [];
    const worker = {
      runBatch: vi
        .fn()
        .mockResolvedValueOnce(success(true))
        .mockResolvedValueOnce(success(false)),
    };
    const result = await runGuestRetentionCycle(
      runtime(worker, memoryStore(records)),
      { batch_size: 100, max_batches: 10 },
    );

    expect(result.ok).toBe(true);
    expect(worker.runBatch).toHaveBeenCalledTimes(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: "SUCCEEDED",
      batch_count: 2,
      scans_deleted: 4,
      stale_windows_deleted: 6,
      more_work: false,
      alert_code: null,
    });
  });

  it("records PARTIAL when the cycle budget is exhausted", async () => {
    const records: GuestRetentionRunRecord[] = [];
    const worker = { runBatch: vi.fn().mockResolvedValue(success(true)) };
    await runGuestRetentionCycle(runtime(worker, memoryStore(records)), {
      batch_size: 100,
      max_batches: 2,
    });
    expect(records[0]).toMatchObject({
      status: "PARTIAL",
      batch_count: 2,
      more_work: true,
    });
  });

  it("persists a closed alert when a later batch becomes unavailable", async () => {
    const records: GuestRetentionRunRecord[] = [];
    const worker = {
      runBatch: vi
        .fn()
        .mockResolvedValueOnce(success(true))
        .mockRejectedValueOnce(new Error("database credential detail")),
    };
    await runGuestRetentionCycle(runtime(worker, memoryStore(records)), {
      batch_size: 100,
      max_batches: 10,
    });
    expect(records[0]).toMatchObject({
      status: "FAILED",
      batch_count: 2,
      scans_deleted: 2,
      more_work: null,
      failure_code: "GUEST_RETENTION_UNAVAILABLE",
      alert_code: "GUEST_RETENTION_UNAVAILABLE",
    });
  });

  it("preserves inconsistency alert state across a drained cycle", async () => {
    const records: GuestRetentionRunRecord[] = [];
    const worker = {
      runBatch: vi
        .fn()
        .mockResolvedValueOnce(success(true, 1))
        .mockResolvedValueOnce(success(false)),
    };
    await runGuestRetentionCycle(runtime(worker, memoryStore(records)), {
      batch_size: 100,
      max_batches: 10,
    });
    expect(records[0]).toMatchObject({
      status: "SUCCEEDED",
      inconsistencies: 1,
      alert_code: "GUEST_RETENTION_INCONSISTENCY",
    });
  });

  it("fails closed on invalid clocks, options and telemetry storage", async () => {
    const worker = { runBatch: vi.fn().mockResolvedValue(success(false)) };
    const unavailable: GuestRetentionRunStore = {
      recordAndPrune: async () => ({
        ok: false,
        code: "RETENTION_RUN_STORE_UNAVAILABLE",
      }),
    };
    await expect(
      runGuestRetentionCycle(runtime(worker, unavailable), {
        batch_size: 100,
        max_batches: 1,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "RETENTION_RUN_STORE_UNAVAILABLE",
      alert_required: true,
    });
    await expect(
      runGuestRetentionCycle(
        runtime(worker, unavailable, () => -1),
        {
          batch_size: 0,
          max_batches: 1,
        },
      ),
    ).resolves.toEqual({
      ok: false,
      code: "INVALID_RETENTION_RUNTIME",
      alert_required: true,
    });

    const records: GuestRetentionRunRecord[] = [];
    const malformedWorker = {
      runBatch: vi.fn().mockResolvedValue({
        ...success(false),
        scans_deleted: 101,
      }),
    };
    await runGuestRetentionCycle(
      runtime(malformedWorker, memoryStore(records)),
      { batch_size: 100, max_batches: 1 },
    );
    expect(records[0]).toMatchObject({
      status: "FAILED",
      alert_code: "GUEST_RETENTION_UNAVAILABLE",
    });
  });

  it("does not overlap scheduled cycles", async () => {
    vi.useFakeTimers();
    let release: (() => void) | undefined;
    const worker = {
      runBatch: vi.fn(
        () =>
          new Promise<ReturnType<typeof success>>((resolve) => {
            release = () => resolve(success(false));
          }),
      ),
    };
    const scheduler = startGuestRetentionScheduler(
      runtime(worker, memoryStore([])),
      { batch_size: 1, max_batches: 1, interval_ms: 1_000 },
      () => undefined,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(worker.runBatch).toHaveBeenCalledTimes(1);
    release?.();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(worker.runBatch).toHaveBeenCalledTimes(2);
    release?.();
    await scheduler.stop();
  });

  it("rejects unknown record fields and inconsistent state", () => {
    const base: GuestRetentionRunRecord = {
      run_id: "retention_run_01",
      started_at_unix_seconds: OBSERVED,
      finished_at_unix_seconds: OBSERVED,
      status: "SUCCEEDED",
      observed_at_unix_seconds: OBSERVED,
      batch_count: 1,
      due_scans_selected: 0,
      scans_deleted: 0,
      active_counter_decrements: 0,
      stale_windows_deleted: 0,
      inconsistencies: 0,
      more_work: false,
      failure_code: null,
      alert_code: null,
    };
    expect(
      validateGuestRetentionRunRecord({ ...base, target: "secret" }),
    ).toBeNull();
    expect(
      validateGuestRetentionRunRecord({ ...base, status: "PARTIAL" }),
    ).toBeNull();
  });
});
