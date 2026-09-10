import { GUEST_QUEUE_OUTCOMES } from "../guest-queue/index.js";
import type {
  GuestQueueAlertCode,
  GuestQueueOutcomeCounts,
  GuestQueueTelemetryBatch,
} from "./model.js";

export const GUEST_QUEUE_MAX_OUTCOME_COUNT = 2_147_483_647;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export function emptyGuestQueueOutcomeCounts(): Record<
  keyof GuestQueueOutcomeCounts,
  number
> {
  return Object.fromEntries(
    GUEST_QUEUE_OUTCOMES.map((outcome) => [outcome, 0]),
  ) as Record<keyof GuestQueueOutcomeCounts, number>;
}

export function classifyGuestQueueAlert(
  counts: GuestQueueOutcomeCounts,
  saturated: boolean,
): GuestQueueAlertCode | null {
  if (saturated) return "GUEST_QUEUE_TELEMETRY_SATURATED";
  if (counts.RETRY_REJECTION_SINK > 0) {
    return "GUEST_QUEUE_SECURITY_PATH_FAILURE";
  }
  if (counts.RETRY_COMMIT > 0) return "GUEST_QUEUE_RESULT_INGRESS_FAILURE";
  if (counts.RETRY_HEARTBEAT > 0 || counts.RETRY_SUPERVISOR > 0) {
    return "GUEST_QUEUE_EXECUTION_FAILURE";
  }
  if (
    counts.RETRY_PERSISTENCE > 0 ||
    counts.RETRY_CONTEXT > 0 ||
    counts.RETRY_START > 0
  ) {
    return "GUEST_QUEUE_DEPENDENCY_FAILURE";
  }
  return null;
}

function snapshotCounts(value: unknown): GuestQueueOutcomeCounts | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== GUEST_QUEUE_OUTCOMES.length ||
      GUEST_QUEUE_OUTCOMES.some((outcome) => !keys.includes(outcome))
    ) {
      return null;
    }
    const result = emptyGuestQueueOutcomeCounts();
    for (const outcome of GUEST_QUEUE_OUTCOMES) {
      const count = Reflect.get(value, outcome);
      if (
        !Number.isSafeInteger(count) ||
        (count as number) < 0 ||
        (count as number) > GUEST_QUEUE_MAX_OUTCOME_COUNT
      ) {
        return null;
      }
      result[outcome] = count as number;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

export function validateGuestQueueTelemetryBatch(
  value: unknown,
): Readonly<GuestQueueTelemetryBatch> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const expected = [
      "batch_id",
      "started_at_unix_seconds",
      "finished_at_unix_seconds",
      "counts",
      "counter_saturated",
      "alert_code",
    ];
    if (
      keys.length !== expected.length ||
      expected.some((key) => !keys.includes(key))
    ) {
      return null;
    }
    const record = value as GuestQueueTelemetryBatch;
    const counts = snapshotCounts(record.counts);
    if (
      typeof record.batch_id !== "string" ||
      !ID.test(record.batch_id) ||
      typeof record.started_at_unix_seconds !== "bigint" ||
      typeof record.finished_at_unix_seconds !== "bigint" ||
      record.started_at_unix_seconds < 0n ||
      record.finished_at_unix_seconds < record.started_at_unix_seconds ||
      !counts ||
      Object.values(counts).every((count) => count === 0) ||
      typeof record.counter_saturated !== "boolean" ||
      record.alert_code !==
        classifyGuestQueueAlert(counts, record.counter_saturated)
    ) {
      return null;
    }
    return Object.freeze({ ...record, counts });
  } catch {
    return null;
  }
}
