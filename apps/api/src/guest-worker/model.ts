import type { ConnectionOptions } from "bullmq";
import type { Pool } from "pg";

import type {
  GuestRedisConnection,
  GuestQueueProcessResult,
} from "../guest-queue/index.js";
import type {
  GuestQueueDurableTelemetry,
  GuestQueueTelemetryFlushResult,
} from "../guest-telemetry/index.js";
import type {
  GuestArtifactApprovalProvider,
  ResultSigningKeyProvider,
  ScannerProcessLauncher,
} from "../supervisor/index.js";

export interface GuestWorkerDependencies {
  pool: Pool;
  redis_connection: GuestRedisConnection;
  approval_provider: GuestArtifactApprovalProvider;
  launcher: ScannerProcessLauncher;
  signing_key_provider: ResultSigningKeyProvider;
  result_verification_keyring: ReadonlyMap<number, Uint8Array>;
  telemetry: GuestQueueDurableTelemetry;
  on_telemetry_outcome(outcome: GuestQueueTelemetryFlushResult): void;
  create_attempt_id(): string;
  now_unix_seconds(): number;
}

export interface GuestWorkerOptions {
  concurrency?: number;
  heartbeat_interval_ms?: number;
  termination_grace_ms?: number;
  telemetry_flush_interval_ms?: number;
}

export interface GuestWorkerTransportHandle {
  waitUntilReady(): Promise<unknown>;
  close(force?: boolean): Promise<unknown>;
}

export interface GuestWorkerTransportFactory {
  start(
    connection: ConnectionOptions,
    process: (value: unknown) => Promise<GuestQueueProcessResult>,
    options: Readonly<{ concurrency: number }>,
  ): unknown;
}

export interface GuestWorkerRuntime {
  ready(): Promise<void>;
  close(): Promise<void>;
}
