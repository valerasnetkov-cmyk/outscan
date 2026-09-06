import type {
  AuthenticatedResultSubmission,
  SignedResultEnvelope,
} from "../result-envelope/index.js";
import type { SanitizedGuestProjection } from "../scanner-output/index.js";
import type { ExecutionEnvelope, SupervisorDenyCode } from "./model.js";

export const GUEST_SUPERVISOR_WORKLOAD_IDENTITY = "supervisor:guest-safe:v1";
export const GUEST_RESULT_ENVELOPE_LIFETIME_SECONDS = 60;
export const SUPERVISOR_MAX_TERMINATION_GRACE_MS = 10_000;

export interface ScannerLaunchPlan {
  schema_version: 1;
  artifact_identity: ExecutionEnvelope["artifact_identity"];
  scanner_input: Readonly<{
    schema_version: 1;
    canonical_target: string;
    policy: ExecutionEnvelope["policy"];
  }>;
}

export interface ScannerProcessExit {
  exit_code: number | null;
  signal: string | null;
}

export interface ScannerProcessHandle {
  stdout: AsyncIterable<Uint8Array>;
  wait: () => Promise<unknown>;
  stop: (signal: "TERM" | "KILL") => void | Promise<void>;
}

export interface ScannerProcessLauncher {
  launch: (plan: Readonly<ScannerLaunchPlan>) => Promise<unknown>;
}

export interface ResultSigningKeyProvider {
  get_active_key: () =>
    Promise<unknown> | Readonly<{ key_version: number; key: Uint8Array }>;
}

export interface GuestSupervisorDependencies {
  launcher: ScannerProcessLauncher;
  signing_key_provider: ResultSigningKeyProvider;
  now_unix_seconds: () => number;
  signal: AbortSignal;
  termination_grace_ms: number;
}

export type GuestSupervisorRunCode =
  | "INVALID_RUNTIME_CONTEXT"
  | "EXECUTION_DENIED"
  | "PROFILE_NOT_SUPPORTED"
  | "RUN_ABORTED"
  | "RUN_TIMEOUT"
  | "SCANNER_LAUNCH_FAILED"
  | "SCANNER_PROCESS_FAILED"
  | "SCANNER_OUTPUT_REJECTED"
  | "RESULT_SIGNING_KEY_UNAVAILABLE"
  | "RESULT_SIGNING_FAILED";

export type GuestSupervisorRunResult =
  | {
      ok: true;
      signed_result: Readonly<SignedResultEnvelope>;
      projection: SanitizedGuestProjection;
      read_submission: () => AuthenticatedResultSubmission;
    }
  | {
      ok: false;
      code: GuestSupervisorRunCode;
      execution_denial_code?: SupervisorDenyCode;
    };
