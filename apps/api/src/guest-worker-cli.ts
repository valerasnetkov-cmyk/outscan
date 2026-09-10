import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { createDatabasePool } from "./db/index.js";
import { guestRedisConnectionConfig } from "./guest-queue/index.js";
import {
  createDurableGuestQueueTelemetry,
  createPostgresGuestQueueTelemetryStore,
  type GuestQueueTelemetryFlushResult,
} from "./guest-telemetry/index.js";
import {
  approvedGuestArtifact,
  createGuestWorkerRuntime,
  guestWorkerProcessConfiguration,
  type GuestWorkerRuntime,
} from "./guest-worker/index.js";
import {
  bindResultSigningKeyProviderToVerificationKeyring,
  createFixedScannerProcessLauncher,
  createMountedGuestArtifactApprovalProvider,
  createMountedResultSigningKeyProvider,
  loadMountedResultVerificationKeyring,
} from "./supervisor/index.js";

const now = () => Math.floor(Date.now() / 1_000);
let pool: Pool | undefined;
let runtime: GuestWorkerRuntime | undefined;
let stopping: Promise<void> | undefined;

async function stop(): Promise<void> {
  stopping ??= (async () => {
    let failed = false;
    if (runtime) {
      try {
        await runtime.close();
      } catch {
        failed = true;
      }
    }
    if (pool) {
      try {
        await pool.end();
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("GUEST_WORKER_SHUTDOWN_FAILED");
  })();
  return stopping;
}

function requestStop(): void {
  void stop().catch(() => {
    process.stderr.write("Guest worker shutdown failed.\n");
    process.exitCode = 1;
  });
}

function reportTelemetry(outcome: GuestQueueTelemetryFlushResult): void {
  if (!outcome.ok) {
    process.stderr.write("Guest worker telemetry persistence failed.\n");
    process.exitCode = 1;
    requestStop();
  } else if (outcome.action === "STORED") {
    process.stdout.write(
      `${JSON.stringify({
        component: "guest-worker",
        event: "telemetry-flush",
        status: "STORED",
        duplicate: outcome.duplicate,
      })}\n`,
    );
  }
}

try {
  const configuration = guestWorkerProcessConfiguration(process.env);
  const approvalProvider = createMountedGuestArtifactApprovalProvider({
    file_path: configuration.approval_file,
  });
  const artifact = approvedGuestArtifact(
    await approvalProvider.get_active_approval(),
  );
  const verificationKeyring = await loadMountedResultVerificationKeyring({
    file_path: configuration.verification_keyring_file,
  });
  if (!artifact || !verificationKeyring) {
    throw new Error("GUEST_WORKER_BOOTSTRAP_UNAVAILABLE");
  }
  const signingKeyProvider = bindResultSigningKeyProviderToVerificationKeyring(
    createMountedResultSigningKeyProvider({
      file_path: configuration.signing_key_file,
    }),
    verificationKeyring,
  );
  if (!(await signingKeyProvider.get_active_key())) {
    throw new Error("GUEST_WORKER_BOOTSTRAP_UNAVAILABLE");
  }
  const redisConnection = guestRedisConnectionConfig({
    OUTSCAN_REDIS_URL: process.env.OUTSCAN_REDIS_URL,
    OUTSCAN_REDIS_TLS: process.env.OUTSCAN_REDIS_TLS,
  });
  pool = createDatabasePool({
    OUTSCAN_DATABASE_URL: process.env.OUTSCAN_DATABASE_URL,
    OUTSCAN_DATABASE_SSL: process.env.OUTSCAN_DATABASE_SSL,
  });
  const telemetry = createDurableGuestQueueTelemetry({
    store: createPostgresGuestQueueTelemetryStore(pool),
    create_batch_id: randomUUID,
    now_unix_seconds: now,
  });
  runtime = createGuestWorkerRuntime({
    pool,
    redis_connection: redisConnection,
    approval_provider: approvalProvider,
    launcher: createFixedScannerProcessLauncher({
      executable_path: configuration.scanner_executable,
      arguments: configuration.scanner_arguments,
      working_directory: configuration.scanner_working_directory,
      artifact_identity: artifact,
    }),
    signing_key_provider: signingKeyProvider,
    result_verification_keyring: verificationKeyring,
    telemetry,
    on_telemetry_outcome: reportTelemetry,
    create_attempt_id: randomUUID,
    now_unix_seconds: now,
  });
  process.once("SIGINT", requestStop);
  process.once("SIGTERM", requestStop);
  pool.on("error", () => {
    process.stderr.write("Guest worker database pool failed.\n");
    process.exitCode = 1;
    requestStop();
  });
  await runtime.ready();
  process.stdout.write(
    `${JSON.stringify({
      component: "guest-worker",
      event: "ready",
      status: "READY",
    })}\n`,
  );
} catch {
  process.stderr.write("Guest worker startup failed.\n");
  process.exitCode = 1;
  await stop().catch(() => {
    process.stderr.write("Guest worker shutdown failed.\n");
  });
}
