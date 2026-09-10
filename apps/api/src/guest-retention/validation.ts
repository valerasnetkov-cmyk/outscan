import type { GuestRetentionRunRecord } from "./model.js";

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_BATCHES = 100;
const MAX_COUNT = 200_000;

function count(value: unknown, maximum = MAX_COUNT): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= maximum
  );
}

function second(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n;
}

export function validateGuestRetentionRunRecord(
  value: unknown,
): Readonly<GuestRetentionRunRecord> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const expected = [
      "run_id",
      "started_at_unix_seconds",
      "finished_at_unix_seconds",
      "status",
      "observed_at_unix_seconds",
      "batch_count",
      "due_scans_selected",
      "scans_deleted",
      "active_counter_decrements",
      "stale_windows_deleted",
      "inconsistencies",
      "more_work",
      "failure_code",
      "alert_code",
    ];
    if (
      keys.length !== expected.length ||
      expected.some((key) => !keys.includes(key))
    ) {
      return null;
    }
    const record = value as GuestRetentionRunRecord;
    if (
      typeof record.run_id !== "string" ||
      !ID.test(record.run_id) ||
      !second(record.started_at_unix_seconds) ||
      !second(record.finished_at_unix_seconds) ||
      record.finished_at_unix_seconds < record.started_at_unix_seconds ||
      !count(record.batch_count, MAX_BATCHES) ||
      record.batch_count < 1 ||
      !count(record.due_scans_selected) ||
      !count(record.scans_deleted) ||
      !count(record.active_counter_decrements) ||
      !count(record.stale_windows_deleted) ||
      !count(record.inconsistencies)
    ) {
      return null;
    }
    if (record.status === "FAILED") {
      if (
        (record.observed_at_unix_seconds !== null &&
          (!second(record.observed_at_unix_seconds) ||
            record.observed_at_unix_seconds < record.started_at_unix_seconds ||
            record.observed_at_unix_seconds >
              record.finished_at_unix_seconds)) ||
        record.more_work !== null ||
        record.failure_code !== "GUEST_RETENTION_UNAVAILABLE" ||
        record.alert_code !== "GUEST_RETENTION_UNAVAILABLE"
      ) {
        return null;
      }
    } else if (record.status === "SUCCEEDED" || record.status === "PARTIAL") {
      if (
        !second(record.observed_at_unix_seconds) ||
        record.observed_at_unix_seconds < record.started_at_unix_seconds ||
        record.observed_at_unix_seconds > record.finished_at_unix_seconds ||
        record.more_work !== (record.status === "PARTIAL") ||
        record.failure_code !== null ||
        (record.inconsistencies === 0
          ? record.alert_code !== null
          : record.alert_code !== "GUEST_RETENTION_INCONSISTENCY")
      ) {
        return null;
      }
    } else {
      return null;
    }
    return Object.freeze({ ...record });
  } catch {
    return null;
  }
}
