import type { GuestResultTokenMetadata } from "../guest-crypto/index.js";
import type { SanitizedGuestProjection } from "../scanner-output/index.js";
import type {
  AcceptedResultIdentity,
  AttemptState,
  JobState,
} from "../scan-protocol/index.js";

export const GUEST_SCAN_SCHEMA_VERSION = 1;
export const GUEST_SCAN_POLICY_ID = "outscan-v1";
export const GUEST_SCAN_POLICY_VERSION = "1.0.0";
export const GUEST_SCAN_PROFILE = "GUEST_SAFE";
export const GUEST_RESULT_ACCESS_SECONDS = 30n * 60n;
export const GUEST_RETENTION_SECONDS = 24n * 60n * 60n;

export interface GuestScanRecord {
  schema_version: typeof GUEST_SCAN_SCHEMA_VERSION;
  guest_scan_id: string;
  canonical_target: string;
  principal_scope: string;
  endpoint_operation: "POST:/v1/public/scans";
  idempotency_key: string;
  request_hash: string;
  created_at_unix_seconds: bigint;
  updated_at_unix_seconds: bigint;
  idempotency_expires_at_unix_seconds: bigint;
  deletion_deadline_unix_seconds: bigint;
  job_state: JobState;
  policy_id: typeof GUEST_SCAN_POLICY_ID;
  policy_version: typeof GUEST_SCAN_POLICY_VERSION;
  profile: typeof GUEST_SCAN_PROFILE;
  result_token_metadata: GuestResultTokenMetadata;
  current_attempt_id: string | null;
  current_fence: number;
  accepted_result: Readonly<AcceptedResultIdentity> | null;
}

export interface GuestScanAttemptRecord {
  schema_version: typeof GUEST_SCAN_SCHEMA_VERSION;
  guest_scan_attempt_id: string;
  guest_scan_id: string;
  attempt_no: number;
  monotonic_fence: number;
  lease_version: number;
  lease_expires_at_unix_seconds: bigint | null;
  hard_deadline_unix_seconds: bigint;
  attempt_state: AttemptState;
  created_at_unix_seconds: bigint;
  updated_at_unix_seconds: bigint;
  started_at_unix_seconds: bigint | null;
  finished_at_unix_seconds: bigint | null;
}

export interface GuestResultRecord {
  schema_version: typeof GUEST_SCAN_SCHEMA_VERSION;
  guest_scan_id: string;
  accepted_attempt_id: string;
  accepted_fence: number;
  payload_digest: string;
  completed_at_unix_seconds: bigint;
  projection: SanitizedGuestProjection;
}

export interface GuestResultReadRecord {
  scan: GuestScanRecord;
  result: GuestResultRecord;
}

export interface GuestResultReadStore {
  loadByGuestScanId(guestScanId: string): Promise<unknown | null>;
}
