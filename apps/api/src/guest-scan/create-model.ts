import type { GuestScanPersistence } from "../guest-persistence/index.js";
import type { GuestSessionKeyProvider } from "../guest-session/index.js";

export interface GuestScanCreationRequest {
  body: unknown;
  cookie_header: unknown;
  idempotency_key_header: unknown;
  socket_remote_address: unknown;
  x_forwarded_for: unknown;
}

export interface GuestScanEnqueuer {
  enqueue(guestScanId: unknown): Promise<unknown>;
}

export interface GuestScanCreationDependencies {
  guest_session_key_provider: GuestSessionKeyProvider;
  is_guest_session_revoked(
    guestSessionScope: string,
  ): Promise<unknown> | unknown;
  trusted_proxy_cidrs: readonly string[];
  network_hmac_keyring: Map<number, Uint8Array>;
  active_network_hmac_key_version: number;
  persistence: GuestScanPersistence;
  queue: GuestScanEnqueuer;
  now_unix_seconds(): number;
}

export interface GuestScanCreationSuccessBody {
  scanId: string;
  resultToken: string;
  status: "QUEUED";
  resultAccessExpiresAt: string;
  resultTokenExpiresInSeconds: number;
}

export type GuestScanCreationErrorCode =
  | "INVALID_SCAN_REQUEST"
  | "GUEST_SESSION_REQUIRED"
  | "GUEST_SESSION_INVALID"
  | "IDEMPOTENCY_KEY_REUSED"
  | "GUEST_SCAN_LIMIT_EXCEEDED"
  | "GUEST_SCANNING_UNAVAILABLE"
  | "GUEST_SCAN_UNAVAILABLE";

export type GuestScanCreationResult =
  | {
      ok: true;
      status_code: 200 | 202;
      headers: Readonly<Record<string, string>>;
      body: Readonly<GuestScanCreationSuccessBody>;
    }
  | {
      ok: false;
      status_code: 400 | 401 | 409 | 429 | 503;
      headers: Readonly<Record<string, string>>;
      body: Readonly<{ error: { code: GuestScanCreationErrorCode } }>;
    };
