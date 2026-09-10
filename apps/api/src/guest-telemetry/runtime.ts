import {
  GUEST_QUEUE_OUTCOMES,
  type GuestQueueOutcome,
} from "../guest-queue/index.js";
import type {
  GuestQueueDurableTelemetry,
  GuestQueueTelemetryBatch,
  GuestQueueTelemetryFlushResult,
  GuestQueueTelemetryScheduler,
  GuestQueueTelemetryStore,
} from "./model.js";
import {
  classifyGuestQueueAlert,
  emptyGuestQueueOutcomeCounts,
  GUEST_QUEUE_MAX_OUTCOME_COUNT,
  validateGuestQueueTelemetryBatch,
} from "./validation.js";

export interface GuestQueueTelemetryDependencies {
  store: GuestQueueTelemetryStore;
  create_batch_id(): string;
  now_unix_seconds(): number;
}

const MIN_FLUSH_INTERVAL_MS = 1_000;
const MAX_FLUSH_INTERVAL_MS = 300_000;

function failure(
  code: Extract<GuestQueueTelemetryFlushResult, { ok: false }>["code"],
): GuestQueueTelemetryFlushResult {
  return { ok: false, code, alert_required: true };
}

function snapshotDependencies(value: GuestQueueTelemetryDependencies) {
  if (!value || typeof value !== "object") return null;
  try {
    if (
      typeof value.store?.recordAndPrune !== "function" ||
      typeof value.create_batch_id !== "function" ||
      typeof value.now_unix_seconds !== "function"
    ) {
      return null;
    }
    return {
      store: {
        recordAndPrune: value.store.recordAndPrune.bind(value.store),
      },
      create_batch_id: value.create_batch_id.bind(value),
      now_unix_seconds: value.now_unix_seconds.bind(value),
    };
  } catch {
    return null;
  }
}

export function createDurableGuestQueueTelemetry(
  rawDependencies: GuestQueueTelemetryDependencies,
): GuestQueueDurableTelemetry {
  const dependencies = snapshotDependencies(rawDependencies);
  if (!dependencies) {
    throw new Error("INVALID_GUEST_QUEUE_TELEMETRY_CONFIGURATION");
  }
  const active = emptyGuestQueueOutcomeCounts();
  let activeStartedAt: bigint | null = null;
  let activeSaturated = false;
  let pending: Readonly<GuestQueueTelemetryBatch> | null = null;
  let flushing: Promise<GuestQueueTelemetryFlushResult> | null = null;

  const runFlush = async (): Promise<GuestQueueTelemetryFlushResult> => {
    if (!pending) {
      if (activeStartedAt === null) {
        return { ok: true, action: "EMPTY", duplicate: false };
      }
      let id: unknown;
      let now: unknown;
      try {
        id = dependencies.create_batch_id();
        now = dependencies.now_unix_seconds();
      } catch {
        return failure("INVALID_QUEUE_TELEMETRY_RUNTIME");
      }
      const record = validateGuestQueueTelemetryBatch({
        batch_id: id,
        started_at_unix_seconds: activeStartedAt,
        finished_at_unix_seconds:
          Number.isSafeInteger(now) && (now as number) >= 0
            ? BigInt(now as number)
            : -1n,
        counts: { ...active },
        counter_saturated: activeSaturated,
        alert_code: classifyGuestQueueAlert(active, activeSaturated),
      });
      if (!record) return failure("INVALID_QUEUE_TELEMETRY_RUNTIME");
      pending = record;
      for (const outcome of GUEST_QUEUE_OUTCOMES) active[outcome] = 0;
      activeStartedAt = null;
      activeSaturated = false;
    }
    let stored: unknown;
    try {
      stored = await dependencies.store.recordAndPrune(pending);
    } catch {
      return failure("QUEUE_TELEMETRY_STORE_UNAVAILABLE");
    }
    if (
      !stored ||
      typeof stored !== "object" ||
      Reflect.ownKeys(stored).length !== 2 ||
      Reflect.get(stored, "ok") !== true ||
      typeof Reflect.get(stored, "duplicate") !== "boolean"
    ) {
      return failure("QUEUE_TELEMETRY_STORE_UNAVAILABLE");
    }
    const duplicate = Reflect.get(stored, "duplicate") as boolean;
    pending = null;
    return { ok: true, action: "STORED", duplicate };
  };

  return Object.freeze({
    record(outcome: GuestQueueOutcome) {
      if (!GUEST_QUEUE_OUTCOMES.includes(outcome)) {
        throw new Error("INVALID_GUEST_QUEUE_TELEMETRY_OUTCOME");
      }
      if (activeStartedAt === null) {
        let now: unknown;
        try {
          now = dependencies.now_unix_seconds();
        } catch {
          throw new Error("INVALID_GUEST_QUEUE_TELEMETRY_CLOCK");
        }
        if (!Number.isSafeInteger(now) || (now as number) < 0) {
          throw new Error("INVALID_GUEST_QUEUE_TELEMETRY_CLOCK");
        }
        activeStartedAt = BigInt(now as number);
      }
      if (active[outcome] === GUEST_QUEUE_MAX_OUTCOME_COUNT) {
        activeSaturated = true;
      } else {
        active[outcome] += 1;
      }
    },
    flush() {
      flushing ??= runFlush().finally(() => {
        flushing = null;
      });
      return flushing;
    },
  });
}

function flushResult(value: unknown): GuestQueueTelemetryFlushResult | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const ok = Reflect.get(value, "ok");
    const action = Reflect.get(value, "action");
    const duplicate = Reflect.get(value, "duplicate");
    const code = Reflect.get(value, "code");
    const alertRequired = Reflect.get(value, "alert_required");
    if (ok === true) {
      return keys.length === 3 &&
        keys.includes("ok") &&
        keys.includes("action") &&
        keys.includes("duplicate") &&
        (action === "EMPTY" || action === "STORED") &&
        typeof duplicate === "boolean"
        ? Object.freeze({
            ok: true,
            action,
            duplicate,
          })
        : null;
    }
    return keys.length === 3 &&
      keys.includes("ok") &&
      keys.includes("code") &&
      keys.includes("alert_required") &&
      ok === false &&
      (code === "INVALID_QUEUE_TELEMETRY_RUNTIME" ||
        code === "QUEUE_TELEMETRY_STORE_UNAVAILABLE") &&
      alertRequired === true
      ? Object.freeze({ ok: false, code, alert_required: true })
      : null;
  } catch {
    return null;
  }
}

export function startGuestQueueTelemetryScheduler(
  telemetry: GuestQueueDurableTelemetry,
  intervalMs: number,
  onOutcome: (outcome: GuestQueueTelemetryFlushResult) => void,
): GuestQueueTelemetryScheduler {
  let flushOperation: GuestQueueDurableTelemetry["flush"];
  try {
    if (
      typeof telemetry?.flush !== "function" ||
      !Number.isSafeInteger(intervalMs) ||
      intervalMs < MIN_FLUSH_INTERVAL_MS ||
      intervalMs > MAX_FLUSH_INTERVAL_MS ||
      typeof onOutcome !== "function"
    ) {
      throw new Error();
    }
    flushOperation = telemetry.flush.bind(telemetry);
  } catch {
    throw new Error("INVALID_GUEST_QUEUE_TELEMETRY_SCHEDULER_CONFIGURATION");
  }
  const safeFailure = Object.freeze(
    failure("QUEUE_TELEMETRY_STORE_UNAVAILABLE"),
  );
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<GuestQueueTelemetryFlushResult> | null = null;
  let stopping: Promise<GuestQueueTelemetryFlushResult> | null = null;
  const flush = () => {
    inFlight ??= Promise.resolve()
      .then(() => flushOperation())
      .then(
        (value) => flushResult(value) ?? safeFailure,
        () => safeFailure,
      )
      .then((outcome) => {
        try {
          onOutcome(outcome);
        } catch {
          // Reporting must not stop durable collection.
        }
        return outcome;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
  const schedule = () => {
    timer = setTimeout(() => {
      void flush().finally(() => {
        if (!stopped) schedule();
      });
    }, intervalMs);
    timer.unref();
  };
  schedule();
  return Object.freeze({
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      stopping ??= (async () => {
        if (inFlight) await inFlight;
        return flush();
      })();
      return stopping;
    },
  });
}
