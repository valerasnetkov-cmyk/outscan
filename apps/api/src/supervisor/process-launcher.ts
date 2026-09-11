import { spawn, type ChildProcessByStdio } from "node:child_process";
import { isAbsolute } from "node:path";
import type { Readable, Writable } from "node:stream";

import { authorizeScannerExecution } from "../scanner-policy/index.js";
import { canonicalizeHostname } from "../target/index.js";
import { matchesApproval, parseArtifactIdentity } from "./artifact-approval.js";
import type { ScannerArtifactIdentity } from "./model.js";
import type {
  ScannerLaunchPlan,
  ScannerProcessExit,
  ScannerProcessHandle,
  ScannerProcessLauncher,
} from "./runtime-model.js";

const MAX_ARGUMENTS = 32;
const MAX_VALUE_LENGTH = 2_048;
const MAX_INPUT_BYTES = 16 * 1_024;
const PROCESS_INITIALIZATION_TIMEOUT_MS = 5_000;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export interface FixedScannerProcessConfiguration {
  executable_path: string;
  arguments: readonly string[];
  working_directory: string;
  artifact_identity: ScannerArtifactIdentity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length &&
      actual.every((key) => typeof key === "string" && keys.includes(key))
    );
  } catch {
    return false;
  }
}

function safeAbsolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VALUE_LENGTH &&
    !CONTROL_CHARACTERS.test(value) &&
    isAbsolute(value)
  );
}

function snapshotConfiguration(
  value: unknown,
): Readonly<FixedScannerProcessConfiguration> | null {
  if (
    !exact(value, [
      "executable_path",
      "arguments",
      "working_directory",
      "artifact_identity",
    ])
  ) {
    return null;
  }
  try {
    const executable = Reflect.get(value as object, "executable_path");
    const workingDirectory = Reflect.get(value as object, "working_directory");
    const rawArguments = Reflect.get(value as object, "arguments");
    const artifact = parseArtifactIdentity(
      Reflect.get(value as object, "artifact_identity"),
    );
    if (
      !safeAbsolutePath(executable) ||
      !safeAbsolutePath(workingDirectory) ||
      !Array.isArray(rawArguments) ||
      rawArguments.length > MAX_ARGUMENTS ||
      !rawArguments.every(
        (argument) =>
          typeof argument === "string" &&
          argument.length <= MAX_VALUE_LENGTH &&
          !CONTROL_CHARACTERS.test(argument),
      ) ||
      !artifact
    ) {
      return null;
    }
    return Object.freeze({
      executable_path: executable,
      arguments: Object.freeze([...rawArguments]),
      working_directory: workingDirectory,
      artifact_identity: Object.freeze(artifact),
    });
  } catch {
    return null;
  }
}

export function encodeApprovedScannerInput(
  value: unknown,
  configuredArtifact: ScannerArtifactIdentity,
): Uint8Array | null {
  if (!exact(value, ["schema_version", "artifact_identity", "scanner_input"])) {
    return null;
  }
  try {
    if (Reflect.get(value as object, "schema_version") !== 1) return null;
    const artifact = parseArtifactIdentity(
      Reflect.get(value as object, "artifact_identity"),
    );
    const input = Reflect.get(value as object, "scanner_input");
    if (
      !artifact ||
      !matchesApproval(artifact, {
        approval_id: "fixed-process",
        status: "APPROVED",
        artifact_identity: configuredArtifact,
      }) ||
      !exact(input, ["schema_version", "canonical_target", "policy"]) ||
      Reflect.get(input as object, "schema_version") !== 1
    ) {
      return null;
    }
    const target = Reflect.get(input as object, "canonical_target");
    const canonical = canonicalizeHostname(target);
    const policy = authorizeScannerExecution(
      Reflect.get(input as object, "policy"),
    );
    if (
      !canonical.ok ||
      canonical.canonical_host !== target ||
      !policy.allowed ||
      artifact.profile !== policy.request.profile ||
      artifact.policy_id !== policy.request.policy_id ||
      artifact.policy_version !== policy.request.policy_version
    ) {
      return null;
    }
    const bytes = Buffer.from(
      `${JSON.stringify({
        schema_version: 1,
        canonical_target: canonical.canonical_host,
        policy: policy.request,
      })}\n`,
      "utf8",
    );
    return bytes.byteLength <= MAX_INPUT_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

type ScannerChildProcess = ChildProcessByStdio<Writable, Readable, null>;

function completion(child: ScannerChildProcess) {
  return new Promise<ScannerProcessExit>((resolve) => {
    let settled = false;
    const finish = (result: ScannerProcessExit) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once("exit", (exitCode, signal) =>
      finish({ exit_code: exitCode, signal }),
    );
    child.once("error", () =>
      finish({ exit_code: null, signal: "PROCESS_ERROR" }),
    );
  });
}

function started(child: ScannerChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", () =>
      reject(new Error("SCANNER_PROCESS_START_FAILED")),
    );
  });
}

function writeInput(
  child: ScannerChildProcess,
  input: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      child.stdin.removeListener("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onError = () => finish(new Error("SCANNER_PROCESS_INPUT_FAILED"));
    child.stdin.once("error", onError);
    child.stdin.end(input, () => finish());
  });
}

async function initializeProcess(
  child: ScannerChildProcess,
  input: Uint8Array,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      started(child).then(() => writeInput(child, input)),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("SCANNER_PROCESS_INITIALIZATION_TIMEOUT"));
        }, PROCESS_INITIALIZATION_TIMEOUT_MS);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createFixedScannerProcessLauncher(
  rawConfiguration: FixedScannerProcessConfiguration,
): ScannerProcessLauncher {
  const configuration = snapshotConfiguration(rawConfiguration);
  if (!configuration) {
    throw new Error("INVALID_SCANNER_PROCESS_CONFIGURATION");
  }
  return Object.freeze({
    async launch(plan: Readonly<ScannerLaunchPlan>) {
      const input = encodeApprovedScannerInput(
        plan,
        configuration.artifact_identity,
      );
      if (!input) throw new Error("SCANNER_PROCESS_LAUNCH_DENIED");
      let child: ScannerChildProcess | undefined;
      try {
        child = spawn(
          configuration.executable_path,
          [...configuration.arguments],
          {
            cwd: configuration.working_directory,
            env: {},
            shell: false,
            windowsHide: true,
            stdio: ["pipe", "pipe", "ignore"],
          },
        );
        const wait = completion(child);
        await initializeProcess(child, input);
        const runningChild = child;
        const handle: ScannerProcessHandle = Object.freeze({
          stdout: runningChild.stdout,
          wait: () => wait,
          stop(signal: "TERM" | "KILL") {
            runningChild.kill(signal === "TERM" ? "SIGTERM" : "SIGKILL");
          },
        });
        return handle;
      } catch {
        child?.kill("SIGKILL");
        throw new Error("SCANNER_PROCESS_LAUNCH_FAILED");
      }
    },
  });
}
