import {
  RESULT_ENVELOPE_AUDIENCE,
  signResultEnvelope,
} from "../result-envelope/index.js";
import { readScannerIpcFrame } from "../scanner-ipc/index.js";
import { produceCanonicalGuestScannerResult } from "../scanner-output/index.js";
import { authorizeSupervisorExecution } from "./authorize.js";
import type { ExecutionEnvelope, TrustedExecutionState } from "./model.js";
import {
  GUEST_RESULT_ENVELOPE_LIFETIME_SECONDS,
  GUEST_SUPERVISOR_WORKLOAD_IDENTITY,
  SUPERVISOR_MAX_TERMINATION_GRACE_MS,
  type GuestSupervisorDependencies,
  type GuestSupervisorRunCode,
  type GuestSupervisorRunResult,
  type ScannerLaunchPlan,
  type ScannerProcessExit,
  type ScannerProcessHandle,
} from "./runtime-model.js";

type Completion =
  { kind: "EXIT"; exit: ScannerProcessExit } | { kind: "ERROR" };
type WaitDecision = Completion | { kind: "TIMEOUT" } | { kind: "ABORTED" };

function fail(code: GuestSupervisorRunCode): GuestSupervisorRunResult {
  return { ok: false, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function snapshotDependencies(
  value: unknown,
): GuestSupervisorDependencies | null {
  if (!isRecord(value)) return null;
  try {
    const launcher = value.launcher;
    const signingKeyProvider = value.signing_key_provider;
    const now = value.now_unix_seconds;
    const signal = value.signal;
    const grace = value.termination_grace_ms;
    if (!isRecord(launcher) || !isRecord(signingKeyProvider)) return null;
    const launch = launcher.launch;
    const getActiveKey = signingKeyProvider.get_active_key;
    if (
      typeof launch !== "function" ||
      typeof getActiveKey !== "function" ||
      typeof now !== "function" ||
      !(signal instanceof AbortSignal) ||
      !Number.isSafeInteger(grace) ||
      (grace as number) < 0 ||
      (grace as number) > SUPERVISOR_MAX_TERMINATION_GRACE_MS
    ) {
      return null;
    }
    return {
      launcher: { launch: launch.bind(launcher) },
      signing_key_provider: {
        get_active_key: getActiveKey.bind(signingKeyProvider),
      },
      now_unix_seconds: now.bind(value),
      signal,
      termination_grace_ms: grace as number,
    };
  } catch {
    return null;
  }
}

function stopMalformedHandle(value: unknown): void {
  if (!isRecord(value)) return;
  try {
    const stop = value.stop;
    if (typeof stop === "function") {
      void Promise.resolve(stop.call(value, "KILL")).catch(() => undefined);
    }
  } catch {
    // A malformed launcher result is already a stable launch failure.
  }
}

function snapshotHandle(value: unknown): ScannerProcessHandle | null {
  if (!isRecord(value)) return null;
  try {
    const stdout = value.stdout;
    const wait = value.wait;
    const stop = value.stop;
    if (
      !isRecord(stdout) ||
      !(Symbol.asyncIterator in stdout) ||
      typeof wait !== "function" ||
      typeof stop !== "function"
    ) {
      return null;
    }
    return {
      stdout: stdout as AsyncIterable<Uint8Array>,
      wait: wait.bind(value) as () => Promise<unknown>,
      stop: stop.bind(value) as ScannerProcessHandle["stop"],
    };
  } catch {
    return null;
  }
}

function snapshotExit(value: unknown): ScannerProcessExit | null {
  if (!isRecord(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    const exitCode = value.exit_code;
    const signal = value.signal;
    if (
      keys.length !== 2 ||
      !keys.includes("exit_code") ||
      !keys.includes("signal") ||
      !(
        exitCode === null ||
        (Number.isSafeInteger(exitCode) &&
          (exitCode as number) >= 0 &&
          (exitCode as number) <= 255)
      ) ||
      !(
        signal === null ||
        (typeof signal === "string" && /^[A-Z][A-Z0-9_]{0,31}$/u.test(signal))
      )
    ) {
      return null;
    }
    return { exit_code: exitCode as number | null, signal };
  } catch {
    return null;
  }
}

function completionOf(handle: ScannerProcessHandle): Promise<Completion> {
  return Promise.resolve()
    .then(() => handle.wait())
    .then(
      (value) => {
        const exit = snapshotExit(value);
        return exit
          ? { kind: "EXIT" as const, exit }
          : { kind: "ERROR" as const };
      },
      () => ({ kind: "ERROR" as const }),
    );
}

function waitForCompletion(
  completion: Promise<Completion>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<WaitDecision> {
  if (signal.aborted) return Promise.resolve({ kind: "ABORTED" });
  if (timeoutMs <= 0) return Promise.resolve({ kind: "TIMEOUT" });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: WaitDecision) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish({ kind: "ABORTED" });
    const timer = setTimeout(() => finish({ kind: "TIMEOUT" }), timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    completion.then(finish);
  });
}

function requestStop(
  handle: ScannerProcessHandle,
  signal: "TERM" | "KILL",
): void {
  try {
    void Promise.resolve(handle.stop(signal)).catch(() => undefined);
  } catch {
    // Shutdown is best-effort; stable supervisor failure remains authoritative.
  }
}

async function stopWithEscalation(
  handle: ScannerProcessHandle,
  completion: Promise<Completion>,
  graceMs: number,
): Promise<void> {
  requestStop(handle, "TERM");
  if (graceMs === 0) {
    requestStop(handle, "KILL");
    return;
  }
  const controller = new AbortController();
  const result = await waitForCompletion(
    completion,
    controller.signal,
    graceMs,
  );
  if (result.kind !== "EXIT") requestStop(handle, "KILL");
}

function launchPlan(envelope: ExecutionEnvelope): Readonly<ScannerLaunchPlan> {
  return Object.freeze({
    schema_version: 1,
    artifact_identity: envelope.artifact_identity,
    scanner_input: Object.freeze({
      schema_version: 1,
      canonical_target: envelope.canonical_target,
      policy: envelope.policy,
    }),
  });
}

function snapshotSigningKey(
  value: unknown,
): { key_version: number; key: Uint8Array } | null {
  if (!isRecord(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    const version = value.key_version;
    const key = value.key;
    if (
      keys.length !== 2 ||
      !keys.includes("key_version") ||
      !keys.includes("key") ||
      !Number.isSafeInteger(version) ||
      (version as number) < 0 ||
      (version as number) > 0xffff_ffff ||
      !(key instanceof Uint8Array) ||
      key.byteLength < 32 ||
      key.byteLength > 64
    ) {
      return null;
    }
    return { key_version: version as number, key: Buffer.from(key) };
  } catch {
    return null;
  }
}

export async function runGuestScannerAttempt(
  input: unknown,
  trusted: TrustedExecutionState,
  rawDependencies: unknown,
): Promise<GuestSupervisorRunResult> {
  const dependencies = snapshotDependencies(rawDependencies);
  if (!dependencies) return fail("INVALID_RUNTIME_CONTEXT");
  if (dependencies.signal.aborted) return fail("RUN_ABORTED");

  const authorization = authorizeSupervisorExecution(input, trusted);
  if (!authorization.allowed) {
    return {
      ok: false,
      code: "EXECUTION_DENIED",
      execution_denial_code: authorization.code,
    };
  }
  const envelope = authorization.envelope;
  if (envelope.policy.profile !== "GUEST_SAFE") {
    return fail("PROFILE_NOT_SUPPORTED");
  }
  const timeoutMs = Math.min(
    envelope.policy.budgets.hard_duration_seconds * 1_000,
    (envelope.hard_deadline_unix_seconds - trusted.now_unix_seconds) * 1_000,
  );
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return fail("RUN_TIMEOUT");
  }

  let rawHandle: unknown;
  try {
    rawHandle = await dependencies.launcher.launch(launchPlan(envelope));
  } catch {
    return fail("SCANNER_LAUNCH_FAILED");
  }
  const handle = snapshotHandle(rawHandle);
  if (!handle) {
    stopMalformedHandle(rawHandle);
    return fail("SCANNER_LAUNCH_FAILED");
  }
  const completion = completionOf(handle);
  const overallDeadline = Date.now() + timeoutMs;
  const ipc = await readScannerIpcFrame(handle.stdout, {
    max_payload_bytes: envelope.policy.budgets.max_output_bytes,
    timeout_ms: timeoutMs,
    signal: dependencies.signal,
  });
  if (!ipc.ok) {
    await stopWithEscalation(
      handle,
      completion,
      dependencies.termination_grace_ms,
    );
    if (ipc.code === "IPC_ABORTED") return fail("RUN_ABORTED");
    if (ipc.code === "IPC_TIMEOUT") return fail("RUN_TIMEOUT");
    return fail("SCANNER_OUTPUT_REJECTED");
  }

  const exit = await waitForCompletion(
    completion,
    dependencies.signal,
    overallDeadline - Date.now(),
  );
  if (exit.kind === "ABORTED" || exit.kind === "TIMEOUT") {
    await stopWithEscalation(
      handle,
      completion,
      dependencies.termination_grace_ms,
    );
    return fail(exit.kind === "ABORTED" ? "RUN_ABORTED" : "RUN_TIMEOUT");
  }
  if (exit.kind === "ERROR") {
    await stopWithEscalation(
      handle,
      completion,
      dependencies.termination_grace_ms,
    );
    return fail("SCANNER_PROCESS_FAILED");
  }
  if (exit.exit.exit_code !== 0 || exit.exit.signal !== null) {
    return fail("SCANNER_PROCESS_FAILED");
  }

  const canonical = produceCanonicalGuestScannerResult(
    ipc.result.read_payload(),
    envelope.policy.budgets.max_output_bytes,
  );
  if (
    !canonical.ok ||
    canonical.result.projection.canonical_host !== envelope.canonical_target
  ) {
    return fail("SCANNER_OUTPUT_REJECTED");
  }

  let now: unknown;
  try {
    now = dependencies.now_unix_seconds();
  } catch {
    return fail("INVALID_RUNTIME_CONTEXT");
  }
  if (
    !Number.isSafeInteger(now) ||
    (now as number) <= 0 ||
    (now as number) >= envelope.hard_deadline_unix_seconds
  ) {
    return fail("RUN_TIMEOUT");
  }

  let rawKey: unknown;
  try {
    rawKey = await dependencies.signing_key_provider.get_active_key();
  } catch {
    return fail("RESULT_SIGNING_KEY_UNAVAILABLE");
  }
  const signingKey = snapshotSigningKey(rawKey);
  if (!signingKey) return fail("RESULT_SIGNING_KEY_UNAVAILABLE");
  const signed = signResultEnvelope(
    {
      job_id: envelope.job_id,
      attempt_id: envelope.attempt_id,
      fence: envelope.fence,
      payload: canonical.result.read_canonical_payload(),
    },
    {
      now_unix_seconds: now,
      lifetime_seconds: GUEST_RESULT_ENVELOPE_LIFETIME_SECONDS,
      workload_identity: GUEST_SUPERVISOR_WORKLOAD_IDENTITY,
      audience: RESULT_ENVELOPE_AUDIENCE,
      max_payload_bytes: envelope.policy.budgets.max_output_bytes,
      key_version: signingKey.key_version,
      key: signingKey.key,
    },
  );
  if (!signed.ok) return fail("RESULT_SIGNING_FAILED");

  return Object.freeze({
    ok: true,
    signed_result: signed.signed,
    projection: canonical.result.projection,
    read_submission: signed.signed.read_submission,
  });
}
