import type {
  GuestRetentionBatchResult,
  GuestSessionRevocationStore,
  GuestRetentionWorker,
} from "../guest-persistence/index.js";
import type {
  GuestRetentionCycleResult,
  GuestRetentionRunRecord,
  GuestRetentionRunStore,
} from "./model.js";

const MAX_BATCH_SIZE = 1_000;
const MAX_BATCHES_PER_CYCLE = 100;

export interface GuestRetentionRuntimeDependencies {
  worker: GuestRetentionWorker;
  revocation_pruner: Pick<GuestSessionRevocationStore, "pruneExpired">;
  run_store: GuestRetentionRunStore;
  create_run_id(): string;
  now_unix_seconds(): number;
}

export interface GuestRetentionCycleOptions {
  batch_size: number;
  max_batches: number;
}

export interface GuestRetentionSchedulerOptions extends GuestRetentionCycleOptions {
  interval_ms: number;
}

export interface GuestRetentionScheduler {
  stop(): Promise<void>;
}

function integer(value: unknown, minimum: number, maximum: number): boolean {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function trustedSecond(operation: () => number): bigint | null {
  try {
    const value = operation();
    return integer(value, 0, Number.MAX_SAFE_INTEGER) ? BigInt(value) : null;
  } catch {
    return null;
  }
}

function validSuccessResult(
  value: unknown,
  batchSize: number,
): value is Extract<GuestRetentionBatchResult, { ok: true }> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const expected = [
      "ok",
      "observed_at_unix_seconds",
      "due_scans_selected",
      "scans_deleted",
      "active_counter_decrements",
      "stale_windows_deleted",
      "inconsistencies",
      "more_work",
      "alert_required",
    ];
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expected.length ||
      expected.some((key) => !keys.includes(key))
    ) {
      return false;
    }
    const result = value as Extract<GuestRetentionBatchResult, { ok: true }>;
    const counters = [
      result.due_scans_selected,
      result.scans_deleted,
      result.active_counter_decrements,
      result.stale_windows_deleted,
      result.inconsistencies,
    ];
    return (
      result.ok === true &&
      typeof result.observed_at_unix_seconds === "bigint" &&
      result.observed_at_unix_seconds >= 0n &&
      counters.every((counter) => integer(counter, 0, batchSize * 2)) &&
      result.due_scans_selected <= batchSize &&
      result.scans_deleted <= result.due_scans_selected &&
      result.stale_windows_deleted <= batchSize &&
      result.active_counter_decrements <= result.scans_deleted * 2 &&
      result.inconsistencies <= result.scans_deleted * 2 &&
      typeof result.more_work === "boolean" &&
      result.alert_required === result.inconsistencies > 0
    );
  } catch {
    return false;
  }
}

function validPruneResult(
  value: unknown,
  batchSize: number,
): value is { ok: true; deleted: number; more_work: boolean } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === 3 &&
      keys.includes("ok") &&
      keys.includes("deleted") &&
      keys.includes("more_work") &&
      Reflect.get(value, "ok") === true &&
      integer(Reflect.get(value, "deleted"), 0, batchSize) &&
      typeof Reflect.get(value, "more_work") === "boolean"
    );
  } catch {
    return false;
  }
}

function validDependencies(
  value: GuestRetentionRuntimeDependencies,
): value is GuestRetentionRuntimeDependencies {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      typeof value.worker?.runBatch === "function" &&
      typeof value.revocation_pruner?.pruneExpired === "function" &&
      typeof value.run_store?.recordAndPrune === "function" &&
      typeof value.create_run_id === "function" &&
      typeof value.now_unix_seconds === "function"
    );
  } catch {
    return false;
  }
}

function validCycleOptions(
  value: GuestRetentionCycleOptions,
): value is GuestRetentionCycleOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    integer(value.batch_size, 1, MAX_BATCH_SIZE) &&
    integer(value.max_batches, 1, MAX_BATCHES_PER_CYCLE)
  );
}

function emptyRecord(
  runId: string,
  startedAt: bigint,
): GuestRetentionRunRecord {
  return {
    run_id: runId,
    started_at_unix_seconds: startedAt,
    finished_at_unix_seconds: startedAt,
    status: "FAILED",
    observed_at_unix_seconds: null,
    batch_count: 1,
    due_scans_selected: 0,
    scans_deleted: 0,
    active_counter_decrements: 0,
    stale_windows_deleted: 0,
    session_revocations_deleted: 0,
    inconsistencies: 0,
    more_work: null,
    failure_code: "GUEST_RETENTION_UNAVAILABLE",
    alert_code: "GUEST_RETENTION_UNAVAILABLE",
  };
}

export async function runGuestRetentionCycle(
  dependencies: GuestRetentionRuntimeDependencies,
  options: GuestRetentionCycleOptions,
): Promise<GuestRetentionCycleResult> {
  if (!validDependencies(dependencies) || !validCycleOptions(options)) {
    return {
      ok: false,
      code: "INVALID_RETENTION_RUNTIME",
      alert_required: true,
    };
  }
  const startedAt = trustedSecond(dependencies.now_unix_seconds);
  let runId: string;
  try {
    runId = dependencies.create_run_id();
  } catch {
    return {
      ok: false,
      code: "INVALID_RETENTION_RUNTIME",
      alert_required: true,
    };
  }
  if (startedAt === null || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(runId)) {
    return {
      ok: false,
      code: "INVALID_RETENTION_RUNTIME",
      alert_required: true,
    };
  }
  const record = emptyRecord(runId, startedAt);
  for (let batch = 0; batch < options.max_batches; batch += 1) {
    let result: Awaited<ReturnType<GuestRetentionWorker["runBatch"]>>;
    try {
      result = await dependencies.worker.runBatch({
        batch_size: options.batch_size,
      });
    } catch {
      result = { ok: false, code: "GUEST_RETENTION_UNAVAILABLE" };
    }
    record.batch_count = batch + 1;
    if (!validSuccessResult(result, options.batch_size)) {
      record.status = "FAILED";
      record.more_work = null;
      record.failure_code = "GUEST_RETENTION_UNAVAILABLE";
      record.alert_code = "GUEST_RETENTION_UNAVAILABLE";
      break;
    }
    record.observed_at_unix_seconds = result.observed_at_unix_seconds;
    record.due_scans_selected += result.due_scans_selected;
    record.scans_deleted += result.scans_deleted;
    record.active_counter_decrements += result.active_counter_decrements;
    record.stale_windows_deleted += result.stale_windows_deleted;
    record.inconsistencies += result.inconsistencies;
    let pruned: Awaited<
      ReturnType<GuestSessionRevocationStore["pruneExpired"]>
    >;
    try {
      pruned = await dependencies.revocation_pruner.pruneExpired({
        batch_size: options.batch_size,
      });
    } catch {
      pruned = { ok: false, code: "GUEST_REVOCATION_UNAVAILABLE" };
    }
    if (!validPruneResult(pruned, options.batch_size)) {
      record.status = "FAILED";
      record.more_work = null;
      record.failure_code = "GUEST_RETENTION_UNAVAILABLE";
      record.alert_code = "GUEST_RETENTION_UNAVAILABLE";
      break;
    }
    record.session_revocations_deleted += pruned.deleted;
    record.more_work = result.more_work || pruned.more_work;
    record.failure_code = null;
    record.alert_code =
      record.inconsistencies > 0 ? "GUEST_RETENTION_INCONSISTENCY" : null;
    record.status = record.more_work ? "PARTIAL" : "SUCCEEDED";
    if (!record.more_work) break;
  }
  const finishedAt = trustedSecond(dependencies.now_unix_seconds);
  if (
    finishedAt === null ||
    finishedAt < startedAt ||
    (record.observed_at_unix_seconds !== null &&
      (record.observed_at_unix_seconds < startedAt ||
        record.observed_at_unix_seconds > finishedAt))
  ) {
    return {
      ok: false,
      code: "INVALID_RETENTION_RUNTIME",
      alert_required: true,
    };
  }
  record.finished_at_unix_seconds = finishedAt;
  const stored = await dependencies.run_store.recordAndPrune(record);
  if (!stored.ok) {
    return {
      ok: false,
      code: "RETENTION_RUN_STORE_UNAVAILABLE",
      alert_required: true,
    };
  }
  return Object.freeze({
    ok: true as const,
    record: Object.freeze({ ...record }),
    duplicate: stored.duplicate,
  });
}

export function startGuestRetentionScheduler(
  dependencies: GuestRetentionRuntimeDependencies,
  options: GuestRetentionSchedulerOptions,
  onOutcome: (outcome: GuestRetentionCycleResult) => void,
): GuestRetentionScheduler {
  if (
    !validDependencies(dependencies) ||
    !validCycleOptions(options) ||
    !integer(options.interval_ms, 1_000, 3_600_000) ||
    typeof onOutcome !== "function"
  ) {
    throw new Error("INVALID_RETENTION_SCHEDULER_CONFIGURATION");
  }
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> = Promise.resolve();
  const run = (): void => {
    inFlight = runGuestRetentionCycle(dependencies, options)
      .then((outcome) => {
        try {
          onOutcome(outcome);
        } catch {
          // Runtime reporting cannot stop retention scheduling.
        }
      })
      .finally(() => {
        if (!stopped) timer = setTimeout(run, options.interval_ms);
      });
  };
  run();
  return Object.freeze({
    async stop(): Promise<void> {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    },
  });
}
