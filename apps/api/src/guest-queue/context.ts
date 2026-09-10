import {
  ALLOWED_CAPABILITIES,
  BUDGET_CEILINGS,
  SCANNER_POLICY_IDENTITY,
} from "../scanner-policy/index.js";
import {
  parseArtifactIdentity,
  type ScannerTemplateApproval,
} from "../supervisor/index.js";
import type { GuestAttemptLease } from "../guest-persistence/index.js";
import type { GuestExecutionContextProvider } from "./model.js";

const APPROVAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export interface GuestArtifactApprovalProvider {
  get_active_approval(): Promise<unknown> | unknown;
}

export interface GuestExecutionContextDependencies {
  approval_provider: GuestArtifactApprovalProvider;
  now_unix_seconds(): number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseApproval(value: unknown): ScannerTemplateApproval | null {
  if (!isRecord(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    const approvalId = Reflect.get(value, "approval_id");
    const status = Reflect.get(value, "status");
    const artifact = parseArtifactIdentity(
      Reflect.get(value, "artifact_identity"),
    );
    if (
      keys.length !== 3 ||
      !keys.includes("approval_id") ||
      !keys.includes("status") ||
      !keys.includes("artifact_identity") ||
      typeof approvalId !== "string" ||
      !APPROVAL_ID.test(approvalId) ||
      (status !== "APPROVED" && status !== "REVOKED") ||
      !artifact ||
      artifact.policy_id !== SCANNER_POLICY_IDENTITY.policy_id ||
      artifact.policy_version !== SCANNER_POLICY_IDENTITY.policy_version ||
      artifact.profile !== "GUEST_SAFE"
    ) {
      return null;
    }
    return Object.freeze({
      approval_id: approvalId,
      status,
      artifact_identity: Object.freeze(artifact),
    });
  } catch {
    return null;
  }
}

export function createGuestExecutionContextProvider(
  dependencies: GuestExecutionContextDependencies,
): GuestExecutionContextProvider {
  if (
    typeof dependencies?.approval_provider?.get_active_approval !==
      "function" ||
    typeof dependencies?.now_unix_seconds !== "function"
  ) {
    throw new Error("INVALID_GUEST_EXECUTION_CONTEXT_CONFIGURATION");
  }
  return Object.freeze({
    async load(lease: Readonly<GuestAttemptLease>) {
      let now: unknown;
      let rawApproval: unknown;
      try {
        now = dependencies.now_unix_seconds();
        rawApproval =
          await dependencies.approval_provider.get_active_approval();
      } catch {
        return null;
      }
      const approval = parseApproval(rawApproval);
      if (
        !approval ||
        !Number.isSafeInteger(now) ||
        (now as number) <= 0 ||
        (now as number) >= lease.lease_expires_at_unix_seconds ||
        (now as number) >= lease.hard_deadline_unix_seconds
      ) {
        return null;
      }
      const authorizationRef = `guest-scan:${lease.guest_scan_id}`;
      const policy = Object.freeze({
        ...SCANNER_POLICY_IDENTITY,
        profile: "GUEST_SAFE" as const,
        requested_capabilities: Object.freeze([
          ...ALLOWED_CAPABILITIES.GUEST_SAFE,
        ]),
        budgets: Object.freeze({ ...BUDGET_CEILINGS.GUEST_SAFE }),
      });
      const envelope = Object.freeze({
        schema_version: 1 as const,
        job_id: lease.guest_scan_id,
        attempt_id: lease.attempt_id,
        fence: lease.monotonic_fence,
        canonical_target: lease.canonical_target,
        authorization_ref: authorizationRef,
        lease_expires_at_unix_seconds: lease.lease_expires_at_unix_seconds,
        hard_deadline_unix_seconds: lease.hard_deadline_unix_seconds,
        policy,
        artifact_identity: approval.artifact_identity,
      });
      return Object.freeze({
        envelope,
        trusted: Object.freeze({
          now_unix_seconds: now as number,
          job_id: lease.guest_scan_id,
          attempt_id: lease.attempt_id,
          fence: lease.monotonic_fence,
          canonical_target: lease.canonical_target,
          authorization_ref: authorizationRef,
          lease_expires_at_unix_seconds: lease.lease_expires_at_unix_seconds,
          hard_deadline_unix_seconds: lease.hard_deadline_unix_seconds,
          approval,
        }),
      });
    },
  });
}
