import type { GuestAttemptLease } from "../guest-persistence/index.js";
import type {
  GuestAttemptExecutionContext,
  GuestQueueOutcome,
  GuestQueueProcessResult,
  GuestQueueProcessorDependencies,
} from "./model.js";
import { GUEST_QUEUE_HEARTBEAT_INTERVAL_MS } from "./model.js";
import { parseGuestQueueMessage } from "./message.js";

const MIN_HEARTBEAT_MS = 100;
const MAX_HEARTBEAT_MS = 10_000;

export class GuestQueueRetryableError extends Error {
  readonly outcome: GuestQueueOutcome;

  constructor(outcome: GuestQueueOutcome) {
    super(outcome);
    this.name = "GuestQueueRetryableError";
    this.outcome = outcome;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function executionContext(value: unknown): GuestAttemptExecutionContext | null {
  if (!isRecord(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    const envelope = Reflect.get(value, "envelope");
    const trusted = Reflect.get(value, "trusted");
    if (
      keys.length !== 2 ||
      !keys.includes("envelope") ||
      !keys.includes("trusted") ||
      !isRecord(envelope) ||
      !isRecord(trusted)
    ) {
      return null;
    }
    return Object.freeze({
      envelope,
      trusted,
    }) as unknown as GuestAttemptExecutionContext;
  } catch {
    return null;
  }
}

function leaseCommand(lease: Readonly<GuestAttemptLease>) {
  return {
    guest_scan_id: lease.guest_scan_id,
    attempt_id: lease.attempt_id,
    monotonic_fence: lease.monotonic_fence,
    lease_version: lease.lease_version,
  };
}

function retry(
  dependencies: GuestQueueProcessorDependencies,
  outcome: GuestQueueOutcome,
): never {
  dependencies.telemetry.record(outcome);
  throw new GuestQueueRetryableError(outcome);
}

async function runWithHeartbeat(
  lease: Readonly<GuestAttemptLease>,
  context: Readonly<GuestAttemptExecutionContext>,
  dependencies: GuestQueueProcessorDependencies,
  intervalMs: number,
) {
  const controller = new AbortController();
  let currentLease = lease;
  let heartbeatLost = false;
  let heartbeat: Promise<void> | null = null;
  const timer = setInterval(() => {
    if (heartbeat || controller.signal.aborted) return;
    heartbeat = dependencies.leases
      .renew(leaseCommand(currentLease))
      .then((result) => {
        if (!result.ok) {
          heartbeatLost = true;
          controller.abort();
          return;
        }
        currentLease = Object.freeze({
          ...currentLease,
          lease_version: result.lease_version,
          lease_expires_at_unix_seconds: result.lease_expires_at_unix_seconds,
        });
      })
      .catch(() => {
        heartbeatLost = true;
        controller.abort();
      })
      .finally(() => {
        heartbeat = null;
      });
  }, intervalMs);
  try {
    const result = await dependencies.runner.run(context, controller.signal);
    clearInterval(timer);
    if (heartbeat) await heartbeat;
    return { result, heartbeat_lost: heartbeatLost } as const;
  } finally {
    clearInterval(timer);
    controller.abort();
  }
}

function heartbeatInterval(value: unknown): number | null {
  if (value === undefined) return GUEST_QUEUE_HEARTBEAT_INTERVAL_MS;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < MIN_HEARTBEAT_MS ||
    (value as number) > MAX_HEARTBEAT_MS
  ) {
    return null;
  }
  return value as number;
}

export function createGuestQueueProcessor(
  dependencies: GuestQueueProcessorDependencies,
): (value: unknown) => Promise<GuestQueueProcessResult> {
  const intervalMs = heartbeatInterval(dependencies.heartbeat_interval_ms);
  if (
    !intervalMs ||
    typeof dependencies.leases?.acquire !== "function" ||
    typeof dependencies.leases?.start !== "function" ||
    typeof dependencies.leases?.renew !== "function" ||
    typeof dependencies.contexts?.load !== "function" ||
    typeof dependencies.runner?.run !== "function" ||
    typeof dependencies.committer?.commit !== "function" ||
    typeof dependencies.result_rejections?.record !== "function" ||
    typeof dependencies.telemetry?.record !== "function"
  ) {
    throw new Error("INVALID_GUEST_QUEUE_PROCESSOR_CONFIGURATION");
  }

  return async (value: unknown) => {
    const message = parseGuestQueueMessage(value);
    if (!message) throw new Error("INVALID_GUEST_QUEUE_MESSAGE");
    let acquired: Awaited<ReturnType<typeof dependencies.leases.acquire>>;
    try {
      acquired = await dependencies.leases.acquire({
        guest_scan_id: message.guest_scan_id,
      });
    } catch {
      return retry(dependencies, "RETRY_PERSISTENCE");
    }
    if (!acquired.ok) {
      if (acquired.code === "NOT_ACQUIRABLE") {
        dependencies.telemetry.record("NOT_ACQUIRABLE_ACKNOWLEDGED");
        return { outcome: "NOT_ACQUIRABLE_ACKNOWLEDGED" };
      }
      return retry(
        dependencies,
        acquired.code === "LEASE_HELD"
          ? "RETRY_LEASE_HELD"
          : "RETRY_PERSISTENCE",
      );
    }
    if (acquired.action === "JOB_TERMINATED") {
      dependencies.telemetry.record("TERMINAL_ACKNOWLEDGED");
      return { outcome: "TERMINAL_ACKNOWLEDGED" };
    }
    const lease = acquired.lease;
    let started: Awaited<ReturnType<typeof dependencies.leases.start>>;
    try {
      started = await dependencies.leases.start(leaseCommand(lease));
    } catch {
      return retry(dependencies, "RETRY_START");
    }
    if (!started.ok) return retry(dependencies, "RETRY_START");

    let rawContext: unknown;
    try {
      rawContext = await dependencies.contexts.load(lease);
    } catch {
      return retry(dependencies, "RETRY_CONTEXT");
    }
    const context = executionContext(rawContext);
    if (!context) return retry(dependencies, "RETRY_CONTEXT");
    let run: Awaited<ReturnType<typeof runWithHeartbeat>>;
    try {
      run = await runWithHeartbeat(lease, context, dependencies, intervalMs);
    } catch {
      return retry(dependencies, "RETRY_SUPERVISOR");
    }
    if (run.heartbeat_lost) return retry(dependencies, "RETRY_HEARTBEAT");
    if (!run.result.ok) return retry(dependencies, "RETRY_SUPERVISOR");

    let committed: Awaited<ReturnType<typeof dependencies.committer.commit>>;
    try {
      committed = await dependencies.committer.commit(
        run.result.read_submission(),
      );
    } catch {
      return retry(dependencies, "RETRY_COMMIT");
    }
    if (!committed.ok) {
      let recorded: Awaited<
        ReturnType<typeof dependencies.result_rejections.record>
      >;
      try {
        recorded = await dependencies.result_rejections.record({
          schema_version: 1,
          guest_scan_id: lease.guest_scan_id,
          attempt_id: lease.attempt_id,
          monotonic_fence: lease.monotonic_fence,
          rejection_code: committed.code,
        });
      } catch {
        return retry(dependencies, "RETRY_REJECTION_SINK");
      }
      if (!recorded.ok) return retry(dependencies, "RETRY_REJECTION_SINK");
      if (recorded.security_relevant !== committed.emit_security_audit) {
        return retry(dependencies, "RETRY_REJECTION_SINK");
      }
      return retry(dependencies, "RETRY_COMMIT");
    }
    const outcome =
      committed.action === "PRIMARY_COMMIT" ? "COMMITTED" : "ALREADY_COMMITTED";
    dependencies.telemetry.record(outcome);
    return { outcome };
  };
}
