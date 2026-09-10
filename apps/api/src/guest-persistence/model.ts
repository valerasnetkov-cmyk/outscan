import type { Pool } from "pg";

import type { GuestAbuseDenyCode } from "../guest-abuse/index.js";
import type { GuestResultTokenKeyring } from "../guest-crypto/index.js";
import type { GuestResultReadStore } from "../guest-scan/index.js";
import type { ResultEnvelopeKeyring } from "../result-envelope/index.js";
import type { ResultCommitDenyCode } from "../scan-protocol/index.js";

export interface PersistGuestScanRequest {
  guest_session_scope: string;
  idempotency_key: string;
  request_hash: string;
  canonical_target: string;
  network_signal_digests: readonly string[];
  trusted_now_unix_seconds: bigint;
}

export type PersistGuestScanResult =
  | {
      ok: true;
      action: "CREATE" | "REPLACE_EXPIRED" | "REPLAY";
      guest_scan_id: string;
      result_token: string;
      result_access_expires_at_unix_seconds: bigint;
      result_token_expires_in_seconds: number;
    }
  | {
      ok: false;
      code:
        | "INVALID_REQUEST"
        | "INVALID_RECORD"
        | "IDEMPOTENCY_KEY_REUSED"
        | "RESULT_ACCESS_REVOKED"
        | "RESULT_TOKEN_UNAVAILABLE"
        | "GUEST_PERSISTENCE_UNAVAILABLE";
    }
  | {
      ok: false;
      code: "ABUSE_LIMIT_EXCEEDED";
      abuse_code: GuestAbuseDenyCode;
      retry_after_seconds?: number;
    };

export interface GuestScanPersistence {
  createOrReplay(value: unknown): Promise<PersistGuestScanResult>;
}

export interface GuestPersistenceDependencies {
  pool: Pool;
  token_keyring: GuestResultTokenKeyring;
  active_token_key_version: number;
  create_guest_scan_id(): string;
  create_token_nonce(): Uint8Array;
}

export interface GuestPersistenceAdapters {
  idempotency: GuestScanPersistence;
  result_read: GuestResultReadStore;
}

export interface GuestResultCommitDependencies {
  pool: Pool;
  result_keyring: ResultEnvelopeKeyring;
  expected_workload_identity: string;
  expected_audience: string;
  max_payload_bytes: number;
  now_unix_seconds(): number;
}

export type CommitGuestResultResult =
  | {
      ok: true;
      action: "PRIMARY_COMMIT" | "ALREADY_COMMITTED";
      stored_new_result: boolean;
    }
  | {
      ok: false;
      code:
        | "RESULT_SUBMISSION_REJECTED"
        | ResultCommitDenyCode
        | "GUEST_PERSISTENCE_UNAVAILABLE";
      emit_security_audit: boolean;
    };

export interface GuestResultCommitter {
  commit(value: unknown): Promise<CommitGuestResultResult>;
}

export type GuestResultRejectionCode = Extract<
  CommitGuestResultResult,
  { ok: false }
>["code"];

export interface RecordGuestResultRejection {
  schema_version: 1;
  guest_scan_id: string;
  attempt_id: string;
  monotonic_fence: number;
  rejection_code: GuestResultRejectionCode;
}

export type RecordGuestResultRejectionResult =
  | {
      ok: true;
      action: "RECORDED" | "ALREADY_RECORDED";
      security_relevant: boolean;
    }
  | {
      ok: false;
      code: "INVALID_REQUEST" | "GUEST_PERSISTENCE_UNAVAILABLE";
    };

export interface GuestResultRejectionSink {
  record(value: unknown): Promise<RecordGuestResultRejectionResult>;
}
