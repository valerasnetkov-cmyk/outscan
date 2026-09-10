import type { PoolClient } from "pg";

import {
  decideGuestAbuseAdmission,
  GUEST_ABUSE_POLICY,
  type GuestAbuseDecision,
} from "../guest-abuse/index.js";
import {
  activeSpecs,
  digestBytes,
  loadAbuseCounterState,
  strictInteger,
  type ActiveCounterSpec,
  type WindowCounterSpec,
} from "./postgres-abuse-state.js";

export type GuestAbuseReleaseReason =
  | "TERMINAL_RESULT"
  | "EXPIRED_REPLACEMENT"
  | "CANCELLED"
  | "FAILED"
  | "EXPIRED"
  | "DELETION";

interface ReservationInput {
  guest_scan_id: string;
  guest_session_scope: string;
  network_signal_digests: readonly string[];
  now_unix_seconds: bigint;
}

const CONTROL_SQL = `
  SELECT service_state FROM guest_abuse_control
  WHERE singleton = 1 AND policy_id = $1
  FOR SHARE`;

const INSERT_RESERVATION_SQL = `
  INSERT INTO guest_abuse_reservations (
    guest_scan_id, guest_session_scope, network_signal_digest,
    policy_id, reserved_at, deletion_deadline
  ) VALUES (
    $1, $2, $3, $4, to_timestamp($5::double precision),
    to_timestamp($5::double precision) + interval '24 hours'
  )`;

async function incrementWindows(
  client: PoolClient,
  specs: readonly WindowCounterSpec[],
  now: bigint,
): Promise<void> {
  for (const spec of specs) {
    const updated = await client.query(
      `UPDATE guest_abuse_window_counters
       SET usage_count = usage_count + 1,
         updated_at = to_timestamp($4::double precision)
       WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3`,
      [spec.scope_kind, spec.digest, spec.dimension, now.toString()],
    );
    if (updated.rowCount !== 1) throw new Error("ABUSE_STATE");
  }
}

async function incrementActive(
  client: PoolClient,
  specs: readonly ActiveCounterSpec[],
  now: bigint,
): Promise<void> {
  for (const spec of specs) {
    const updated = await client.query(
      `UPDATE guest_abuse_active_counters
       SET active_count = active_count + 1,
         updated_at = to_timestamp($4::double precision)
       WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3`,
      [spec.scope_kind, spec.digest, spec.dimension, now.toString()],
    );
    if (updated.rowCount !== 1) throw new Error("ABUSE_STATE");
  }
}

export async function reserveGuestAbuseCounters(
  client: PoolClient,
  input: ReservationInput,
): Promise<GuestAbuseDecision> {
  const session = digestBytes(input.guest_session_scope, "sha256:");
  const networks = input.network_signal_digests.map((digest) =>
    digestBytes(digest, "hmac-sha256:"),
  );
  const activeNetwork = networks[0];
  if (!activeNetwork) throw new Error("ABUSE_STATE");
  const control = await client.query<{ service_state: "OPEN" | "PAUSED" }>(
    CONTROL_SQL,
    [GUEST_ABUSE_POLICY.policy_id],
  );
  if (control.rowCount !== 1) throw new Error("ABUSE_STATE");
  const state = await loadAbuseCounterState(
    client,
    session,
    networks,
    input.now_unix_seconds,
  );
  const usageWindow = (dimension: WindowCounterSpec["dimension"]) => {
    const usage = state.windows.get(dimension);
    if (!usage) throw new Error("ABUSE_STATE");
    return usage;
  };
  const decision = decideGuestAbuseAdmission({
    guest_session_scope: input.guest_session_scope,
    network_signal_digest: input.network_signal_digests[0],
    now_unix_seconds: input.now_unix_seconds,
    service_state: control.rows[0]?.service_state,
    usage: {
      session_burst: usageWindow("SESSION_BURST"),
      session_daily: usageWindow("SESSION_DAILY"),
      network_burst: usageWindow("NETWORK_BURST"),
      network_daily: usageWindow("NETWORK_DAILY"),
      session_active: state.active.get("SESSION_ACTIVE"),
      network_active: state.active.get("NETWORK_ACTIVE"),
    },
  });
  if (!decision.ok) return decision;
  await incrementWindows(
    client,
    state.increment_windows,
    input.now_unix_seconds,
  );
  await incrementActive(client, state.increment_active, input.now_unix_seconds);
  await client.query(INSERT_RESERVATION_SQL, [
    input.guest_scan_id,
    session,
    activeNetwork,
    GUEST_ABUSE_POLICY.policy_id,
    input.now_unix_seconds.toString(),
  ]);
  return decision;
}

async function decrementAndRemove(
  client: PoolClient,
  spec: ActiveCounterSpec,
  now: bigint,
): Promise<boolean> {
  const decremented = await client.query<{ active_count: number }>(
    `UPDATE guest_abuse_active_counters
     SET active_count = active_count - 1,
       updated_at = to_timestamp($4::double precision)
     WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3
       AND active_count > 0 RETURNING active_count`,
    [spec.scope_kind, spec.digest, spec.dimension, now.toString()],
  );
  if (decremented.rowCount !== 1) return false;
  if (decremented.rows[0]?.active_count !== 0) return true;
  const removed = await client.query(
    `DELETE FROM guest_abuse_active_counters
     WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3
       AND active_count = 0`,
    [spec.scope_kind, spec.digest, spec.dimension],
  );
  return removed.rowCount === 1;
}

export async function releaseGuestAbuseReservation(
  client: PoolClient,
  guestScanId: string,
  nowUnixSeconds: bigint,
  reason: GuestAbuseReleaseReason,
): Promise<boolean> {
  const found = await client.query<Record<string, unknown>>(
    `SELECT guest_session_scope, network_signal_digest, released_at,
       extract(epoch FROM reserved_at)::bigint::text AS reserved_at,
       extract(epoch FROM deletion_deadline)::bigint::text AS deletion_deadline
     FROM guest_abuse_reservations WHERE guest_scan_id = $1 FOR UPDATE`,
    [guestScanId],
  );
  if (found.rowCount !== 1) return false;
  const row = found.rows[0] ?? {};
  if (row.released_at !== null) return true;
  const reservedAt = strictInteger(row.reserved_at);
  const deadline = strictInteger(row.deletion_deadline);
  if (
    !(row.guest_session_scope instanceof Uint8Array) ||
    !(row.network_signal_digest instanceof Uint8Array) ||
    reservedAt === null ||
    deadline === null ||
    nowUnixSeconds < reservedAt ||
    nowUnixSeconds > deadline
  )
    return false;
  const specs = activeSpecs(
    Buffer.from(row.guest_session_scope),
    Buffer.from(row.network_signal_digest),
  );
  for (const spec of specs) {
    if (!(await decrementAndRemove(client, spec, nowUnixSeconds))) return false;
  }
  const released = await client.query(
    `UPDATE guest_abuse_reservations
     SET released_at = to_timestamp($2::double precision), release_reason = $3
     WHERE guest_scan_id = $1 AND released_at IS NULL`,
    [guestScanId, nowUnixSeconds.toString(), reason],
  );
  return released.rowCount === 1;
}
