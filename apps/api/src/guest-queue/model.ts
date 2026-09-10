import type {
  GuestAttemptLease,
  GuestLeasePersistence,
  GuestResultRejectionSink,
  GuestResultCommitter,
} from "../guest-persistence/index.js";
import type {
  ExecutionEnvelope,
  GuestSupervisorRunResult,
  TrustedExecutionState,
} from "../supervisor/index.js";

export const GUEST_SCAN_QUEUE_NAME = "outscan-guest-scan-v1";
export const GUEST_SCAN_JOB_NAME = "run-guest-scan-v1";
export const GUEST_QUEUE_HEARTBEAT_INTERVAL_MS = 5_000;

export interface GuestQueueMessage {
  schema_version: 1;
  guest_scan_id: string;
}

export interface GuestAttemptExecutionContext {
  envelope: ExecutionEnvelope;
  trusted: TrustedExecutionState;
}

export interface GuestExecutionContextProvider {
  load(lease: Readonly<GuestAttemptLease>): Promise<unknown>;
}

export interface GuestAttemptRunner {
  run(
    context: Readonly<GuestAttemptExecutionContext>,
    signal: AbortSignal,
  ): Promise<GuestSupervisorRunResult>;
}

export const GUEST_QUEUE_OUTCOMES = [
  "COMMITTED",
  "ALREADY_COMMITTED",
  "TERMINAL_ACKNOWLEDGED",
  "NOT_ACQUIRABLE_ACKNOWLEDGED",
  "RETRY_LEASE_HELD",
  "RETRY_PERSISTENCE",
  "RETRY_CONTEXT",
  "RETRY_START",
  "RETRY_HEARTBEAT",
  "RETRY_SUPERVISOR",
  "RETRY_REJECTION_SINK",
  "RETRY_COMMIT",
] as const;

export type GuestQueueOutcome = (typeof GUEST_QUEUE_OUTCOMES)[number];

export interface GuestQueueTelemetry {
  record(outcome: GuestQueueOutcome): void;
}

export interface GuestQueueProcessorDependencies {
  leases: GuestLeasePersistence;
  contexts: GuestExecutionContextProvider;
  runner: GuestAttemptRunner;
  committer: GuestResultCommitter;
  result_rejections: GuestResultRejectionSink;
  telemetry: GuestQueueTelemetry;
  heartbeat_interval_ms?: number;
}

export type GuestQueueProcessResult = Readonly<{
  outcome:
    | "COMMITTED"
    | "ALREADY_COMMITTED"
    | "TERMINAL_ACKNOWLEDGED"
    | "NOT_ACQUIRABLE_ACKNOWLEDGED";
}>;
