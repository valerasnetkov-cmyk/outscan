export const GUEST_RETENTION_RUN_STATUSES = [
  "SUCCEEDED",
  "PARTIAL",
  "FAILED",
] as const;

export type GuestRetentionRunStatus =
  (typeof GUEST_RETENTION_RUN_STATUSES)[number];

export type GuestRetentionAlertCode =
  "GUEST_RETENTION_INCONSISTENCY" | "GUEST_RETENTION_UNAVAILABLE";

export interface GuestRetentionRunRecord {
  run_id: string;
  started_at_unix_seconds: bigint;
  finished_at_unix_seconds: bigint;
  status: GuestRetentionRunStatus;
  observed_at_unix_seconds: bigint | null;
  batch_count: number;
  due_scans_selected: number;
  scans_deleted: number;
  active_counter_decrements: number;
  stale_windows_deleted: number;
  inconsistencies: number;
  more_work: boolean | null;
  failure_code: "GUEST_RETENTION_UNAVAILABLE" | null;
  alert_code: GuestRetentionAlertCode | null;
}

export type GuestRetentionRunStoreResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; code: "INVALID_REQUEST" | "RETENTION_RUN_STORE_UNAVAILABLE" };

export interface GuestRetentionRunStore {
  recordAndPrune(value: unknown): Promise<GuestRetentionRunStoreResult>;
}

export type GuestRetentionCycleResult =
  | {
      ok: true;
      record: Readonly<GuestRetentionRunRecord>;
      duplicate: boolean;
    }
  | {
      ok: false;
      code: "INVALID_RETENTION_RUNTIME" | "RETENTION_RUN_STORE_UNAVAILABLE";
      alert_required: true;
    };
