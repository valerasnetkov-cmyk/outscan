import type { GuestResultTokenMetadata } from "../guest-crypto/index.js";

export const GUEST_SCAN_ENDPOINT_OPERATION = "POST:/v1/public/scans";
export const GUEST_IDEMPOTENCY_WINDOW_SECONDS = 30n * 60n;

export interface GuestIdempotencyRequest {
  guest_session_scope: string;
  idempotency_key: string;
  request_hash: string;
  now_unix_seconds: bigint;
}

export interface GuestIdempotencyLookup {
  principal_scope: string;
  endpoint_operation: typeof GUEST_SCAN_ENDPOINT_OPERATION;
  idempotency_key: string;
}

export interface GuestIdempotencyRecord extends GuestIdempotencyLookup {
  request_hash: string;
  created_at_unix_seconds: bigint;
  idempotency_expires_at_unix_seconds: bigint;
  token_metadata: GuestResultTokenMetadata;
}

export type GuestIdempotencyResult =
  | {
      ok: true;
      action: "CREATE" | "REPLACE_EXPIRED";
      lookup: Readonly<GuestIdempotencyLookup>;
      request_hash: string;
      idempotency_expires_at_unix_seconds: bigint;
    }
  | {
      ok: true;
      action: "REPLAY";
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
        | "RESULT_TOKEN_UNAVAILABLE";
    };
