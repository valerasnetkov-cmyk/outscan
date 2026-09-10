import type {
  GuestQueueOutcome,
  GuestQueueTelemetry,
} from "../guest-queue/index.js";

export type GuestQueueOutcomeCounts = Readonly<
  Record<GuestQueueOutcome, number>
>;

export type GuestQueueAlertCode =
  | "GUEST_QUEUE_TELEMETRY_SATURATED"
  | "GUEST_QUEUE_SECURITY_PATH_FAILURE"
  | "GUEST_QUEUE_RESULT_INGRESS_FAILURE"
  | "GUEST_QUEUE_EXECUTION_FAILURE"
  | "GUEST_QUEUE_DEPENDENCY_FAILURE";

export interface GuestQueueTelemetryBatch {
  batch_id: string;
  started_at_unix_seconds: bigint;
  finished_at_unix_seconds: bigint;
  counts: GuestQueueOutcomeCounts;
  counter_saturated: boolean;
  alert_code: GuestQueueAlertCode | null;
}

export type GuestQueueTelemetryStoreResult =
  | { ok: true; duplicate: boolean }
  | {
      ok: false;
      code: "INVALID_REQUEST" | "QUEUE_TELEMETRY_STORE_UNAVAILABLE";
    };

export interface GuestQueueTelemetryStore {
  recordAndPrune(value: unknown): Promise<GuestQueueTelemetryStoreResult>;
}

export type GuestQueueTelemetryFlushResult =
  | { ok: true; action: "EMPTY" | "STORED"; duplicate: boolean }
  | {
      ok: false;
      code:
        "INVALID_QUEUE_TELEMETRY_RUNTIME" | "QUEUE_TELEMETRY_STORE_UNAVAILABLE";
      alert_required: true;
    };

export interface GuestQueueDurableTelemetry extends GuestQueueTelemetry {
  flush(): Promise<GuestQueueTelemetryFlushResult>;
}

export interface GuestQueueTelemetryScheduler {
  stop(): Promise<GuestQueueTelemetryFlushResult>;
}
