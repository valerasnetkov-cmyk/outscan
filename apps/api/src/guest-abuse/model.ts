export const GUEST_ABUSE_POLICY = Object.freeze({
  schema_version: 1,
  policy_id: "outscan-guest-abuse-v1",
  session_burst_window_seconds: 600n,
  session_burst_limit: 3,
  session_daily_window_seconds: 86_400n,
  session_daily_limit: 10,
  network_burst_window_seconds: 600n,
  network_burst_limit: 20,
  network_daily_window_seconds: 86_400n,
  network_daily_limit: 100,
  session_concurrency_limit: 1,
  network_concurrency_limit: 4,
} as const);

export const GUEST_ABUSE_RESERVATION_DIMENSIONS = Object.freeze([
  "SESSION_BURST",
  "SESSION_DAILY",
  "NETWORK_BURST",
  "NETWORK_DAILY",
  "SESSION_ACTIVE",
  "NETWORK_ACTIVE",
] as const);

export type GuestAbuseReservationDimension =
  (typeof GUEST_ABUSE_RESERVATION_DIMENSIONS)[number];

export interface GuestAbuseWindowUsage {
  count: number;
  reset_at_unix_seconds: bigint;
}

export interface GuestAbuseUsageSnapshot {
  session_burst: GuestAbuseWindowUsage;
  session_daily: GuestAbuseWindowUsage;
  network_burst: GuestAbuseWindowUsage;
  network_daily: GuestAbuseWindowUsage;
  session_active: number;
  network_active: number;
}

export interface GuestAbuseRequest {
  guest_session_scope: string;
  network_signal_digest: string;
  now_unix_seconds: bigint;
  service_state: "OPEN" | "PAUSED";
  usage: GuestAbuseUsageSnapshot;
}

export interface GuestAbuseReservation {
  policy_id: typeof GUEST_ABUSE_POLICY.policy_id;
  guest_session_scope: string;
  network_signal_digest: string;
  observed_at_unix_seconds: bigint;
  dimensions: readonly GuestAbuseReservationDimension[];
}

export type GuestAbuseDenyCode =
  | "GUEST_SCANNING_PAUSED"
  | "SESSION_CONCURRENCY_LIMIT"
  | "SESSION_BURST_LIMIT"
  | "SESSION_DAILY_LIMIT"
  | "NETWORK_CONCURRENCY_LIMIT"
  | "NETWORK_BURST_LIMIT"
  | "NETWORK_DAILY_LIMIT";

export type GuestAbuseDecision =
  | {
      ok: true;
      action: "ALLOW_NEW_SCAN";
      reservation: Readonly<GuestAbuseReservation>;
    }
  | { ok: false; code: "INVALID_ABUSE_CONTEXT" }
  | {
      ok: false;
      code: GuestAbuseDenyCode;
      retry_after_seconds?: number;
    };
