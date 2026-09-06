import type {
  PolicyDecision,
  ScannerExecutionRequest,
} from "../scanner-policy/index.js";

export interface ScannerArtifactIdentity {
  template_workflow_digest: string;
  transitive_dependency_digests: string[];
  engine_version: string;
  scanner_image_digest: string;
  config_version: string;
  policy_id: string;
  policy_version: string;
  profile: string;
}

export interface ScannerTemplateApproval {
  approval_id: string;
  status: "APPROVED" | "REVOKED";
  artifact_identity: ScannerArtifactIdentity;
}

export interface ExecutionEnvelope {
  schema_version: 1;
  job_id: string;
  attempt_id: string;
  fence: number;
  canonical_target: string;
  authorization_ref: string;
  lease_expires_at_unix_seconds: number;
  hard_deadline_unix_seconds: number;
  policy: ScannerExecutionRequest;
  artifact_identity: ScannerArtifactIdentity;
}

export interface TrustedExecutionState {
  now_unix_seconds: number;
  job_id: string;
  attempt_id: string;
  fence: number;
  canonical_target: string;
  authorization_ref: string;
  lease_expires_at_unix_seconds: number;
  hard_deadline_unix_seconds: number;
  approval: ScannerTemplateApproval | null;
}

export type SupervisorDenyCode =
  | "INVALID_ENVELOPE"
  | "STALE_ATTEMPT"
  | "AUTHORIZATION_MISMATCH"
  | "LEASE_EXPIRED"
  | "ATTEMPT_DEADLINE_EXCEEDED"
  | "POLICY_DENIED"
  | "APPROVAL_REQUIRED"
  | "APPROVAL_REVOKED"
  | "ARTIFACT_NOT_APPROVED";

export type SupervisorDecision =
  | {
      allowed: true;
      envelope: ExecutionEnvelope;
    }
  | {
      allowed: false;
      code: SupervisorDenyCode;
      message: string;
      policy_decision?: Extract<PolicyDecision, { allowed: false }>;
    };
