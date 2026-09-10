import type {
  ScannerProcessExit,
  ScannerProcessHandle,
} from "./runtime-model.js";

export type ScannerProcessCompletion =
  { kind: "EXIT"; exit: ScannerProcessExit } | { kind: "ERROR" };
export type ScannerProcessWaitDecision =
  ScannerProcessCompletion | { kind: "TIMEOUT" } | { kind: "ABORTED" };
export type ScannerLaunchDecision =
  | { kind: "LAUNCHED"; value: unknown }
  | { kind: "ERROR" }
  | { kind: "TIMEOUT" }
  | { kind: "ABORTED" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

export function snapshotScannerProcessHandle(
  value: unknown,
): ScannerProcessHandle | null {
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
      stopMalformedHandle(value);
      return null;
    }
    return {
      stdout: stdout as AsyncIterable<Uint8Array>,
      wait: wait.bind(value) as () => Promise<unknown>,
      stop: stop.bind(value) as ScannerProcessHandle["stop"],
    };
  } catch {
    stopMalformedHandle(value);
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

export function scannerProcessCompletion(
  handle: ScannerProcessHandle,
): Promise<ScannerProcessCompletion> {
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

function waitForDecision<T>(
  operation: Promise<T>,
  signal: AbortSignal,
  timeoutMs: number,
  success: (value: T) => ScannerProcessWaitDecision | ScannerLaunchDecision,
  failure: () => ScannerProcessWaitDecision | ScannerLaunchDecision,
): Promise<ScannerProcessWaitDecision | ScannerLaunchDecision> {
  if (signal.aborted) return Promise.resolve({ kind: "ABORTED" });
  if (timeoutMs <= 0) return Promise.resolve({ kind: "TIMEOUT" });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (
      value: ScannerProcessWaitDecision | ScannerLaunchDecision,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish({ kind: "ABORTED" });
    const timer = setTimeout(() => finish({ kind: "TIMEOUT" }), timeoutMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    operation.then(
      (value) => finish(success(value)),
      () => finish(failure()),
    );
  });
}

export function waitForScannerCompletion(
  completion: Promise<ScannerProcessCompletion>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ScannerProcessWaitDecision> {
  return waitForDecision(
    completion,
    signal,
    timeoutMs,
    (value) => value,
    () => ({ kind: "ERROR" }),
  ) as Promise<ScannerProcessWaitDecision>;
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

export async function waitForScannerLaunch(
  launch: Promise<unknown>,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<ScannerLaunchDecision> {
  const result = (await waitForDecision(
    launch,
    signal,
    timeoutMs,
    (value) => ({ kind: "LAUNCHED", value }),
    () => ({ kind: "ERROR" }),
  )) as ScannerLaunchDecision;
  if (result.kind === "ABORTED" || result.kind === "TIMEOUT") {
    void launch.then(
      (value) => {
        const handle = snapshotScannerProcessHandle(value);
        if (handle) requestStop(handle, "KILL");
      },
      () => undefined,
    );
  }
  return result;
}

export async function stopScannerWithEscalation(
  handle: ScannerProcessHandle,
  completion: Promise<ScannerProcessCompletion>,
  graceMs: number,
): Promise<void> {
  requestStop(handle, "TERM");
  if (graceMs === 0) {
    requestStop(handle, "KILL");
    return;
  }
  const result = await waitForScannerCompletion(
    completion,
    new AbortController().signal,
    graceMs,
  );
  if (result.kind !== "EXIT") requestStop(handle, "KILL");
}
