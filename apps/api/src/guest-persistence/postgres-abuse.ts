import type { PoolClient } from "pg";

import {
  decideGuestAbuseAdmission,
  GUEST_ABUSE_POLICY,
  type GuestAbuseDecision,
} from "../guest-abuse/index.js";

export type GuestAbuseReleaseReason =
  | "TERMINAL_RESULT"
  | "EXPIRED_REPLACEMENT"
  | "CANCELLED"
  | "FAILED"
  | "DELETION";

interface ReservationInput {
  guest_scan_id: string;
  guest_session_scope: string;
  network_signal_digest: string;
  now_unix_seconds: bigint;
}

interface CounterSpec {
  scope_kind: "SESSION" | "NETWORK";
  dimension:
    "SESSION_BURST" | "SESSION_DAILY" | "NETWORK_BURST" | "NETWORK_DAILY";
  digest: Buffer;
  window_seconds: bigint;
}

interface WindowState extends CounterSpec {
  count: number;
  reset_at: bigint;
}

const CONTROL_SQL = `
  SELECT service_state FROM guest_abuse_control
  WHERE singleton = 1 AND policy_id = $1
  FOR SHARE`;

const INSERT_WINDOW_SQL = `
  INSERT INTO guest_abuse_window_counters (
    scope_kind, scope_digest, dimension, usage_count, reset_at, updated_at
  ) VALUES (
    $1, $2, $3, 0, to_timestamp($4::double precision),
    to_timestamp($5::double precision)
  ) ON CONFLICT (scope_kind, scope_digest, dimension) DO NOTHING`;

const INSERT_ACTIVE_SQL = `
  INSERT INTO guest_abuse_active_counters (
    scope_kind, scope_digest, dimension, active_count, updated_at
  ) VALUES ($1, $2, $3, 0, to_timestamp($4::double precision))
  ON CONFLICT (scope_kind, scope_digest, dimension) DO NOTHING`;

const LOAD_WINDOWS_SQL = `
  SELECT scope_kind, dimension, usage_count::text,
    extract(epoch FROM reset_at)::bigint::text AS reset_at
  FROM guest_abuse_window_counters
  WHERE (scope_kind = 'SESSION' AND scope_digest = $1)
    OR (scope_kind = 'NETWORK' AND scope_digest = $2)
  ORDER BY scope_kind, dimension
  FOR UPDATE`;

const LOAD_ACTIVE_SQL = `
  SELECT scope_kind, dimension, active_count::text
  FROM guest_abuse_active_counters
  WHERE (scope_kind = 'SESSION' AND scope_digest = $1)
    OR (scope_kind = 'NETWORK' AND scope_digest = $2)
  ORDER BY scope_kind, dimension
  FOR UPDATE`;

const INSERT_RESERVATION_SQL = `
  INSERT INTO guest_abuse_reservations (
    guest_scan_id, guest_session_scope, network_signal_digest,
    policy_id, reserved_at, deletion_deadline
  ) VALUES (
    $1, $2, $3, $4, to_timestamp($5::double precision),
    to_timestamp($5::double precision) + interval '24 hours'
  )`;

function digestBytes(value: string, prefix: string): Buffer {
  return Buffer.from(value.slice(prefix.length), "hex");
}

function integer(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function specs(session: Buffer, network: Buffer): CounterSpec[] {
  return [
    {
      scope_kind: "NETWORK",
      dimension: "NETWORK_BURST",
      digest: network,
      window_seconds: GUEST_ABUSE_POLICY.network_burst_window_seconds,
    },
    {
      scope_kind: "NETWORK",
      dimension: "NETWORK_DAILY",
      digest: network,
      window_seconds: GUEST_ABUSE_POLICY.network_daily_window_seconds,
    },
    {
      scope_kind: "SESSION",
      dimension: "SESSION_BURST",
      digest: session,
      window_seconds: GUEST_ABUSE_POLICY.session_burst_window_seconds,
    },
    {
      scope_kind: "SESSION",
      dimension: "SESSION_DAILY",
      digest: session,
      window_seconds: GUEST_ABUSE_POLICY.session_daily_window_seconds,
    },
  ];
}

function activeSpecs(session: Buffer, network: Buffer) {
  return [
    {
      scope_kind: "NETWORK" as const,
      dimension: "NETWORK_ACTIVE" as const,
      digest: network,
    },
    {
      scope_kind: "SESSION" as const,
      dimension: "SESSION_ACTIVE" as const,
      digest: session,
    },
  ];
}

async function loadWindowState(
  client: PoolClient,
  counterSpecs: CounterSpec[],
  session: Buffer,
  network: Buffer,
  now: bigint,
): Promise<WindowState[]> {
  for (const spec of counterSpecs) {
    await client.query(INSERT_WINDOW_SQL, [
      spec.scope_kind,
      spec.digest,
      spec.dimension,
      (now + spec.window_seconds).toString(),
      now.toString(),
    ]);
  }
  const loaded = await client.query<Record<string, unknown>>(LOAD_WINDOWS_SQL, [
    session,
    network,
  ]);
  if (loaded.rowCount !== counterSpecs.length) throw new Error("ABUSE_STATE");
  const byDimension = new Map(
    counterSpecs.map((item) => [item.dimension, item]),
  );
  const states: WindowState[] = [];
  for (const row of loaded.rows) {
    const spec = byDimension.get(row.dimension as CounterSpec["dimension"]);
    const count = integer(row.usage_count);
    const resetAt = integer(row.reset_at);
    if (
      !spec ||
      row.scope_kind !== spec.scope_kind ||
      count === null ||
      count > 1_000_000n ||
      resetAt === null
    ) {
      throw new Error("ABUSE_STATE");
    }
    if (resetAt <= now) {
      const nextReset = now + spec.window_seconds;
      const reset = await client.query(
        `UPDATE guest_abuse_window_counters
         SET usage_count = 0, reset_at = to_timestamp($4::double precision),
           updated_at = to_timestamp($5::double precision)
         WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3`,
        [
          spec.scope_kind,
          spec.digest,
          spec.dimension,
          nextReset.toString(),
          now.toString(),
        ],
      );
      if (reset.rowCount !== 1) throw new Error("ABUSE_STATE");
      states.push({ ...spec, count: 0, reset_at: nextReset });
    } else {
      states.push({ ...spec, count: Number(count), reset_at: resetAt });
    }
  }
  return states;
}

async function loadActiveState(
  client: PoolClient,
  session: Buffer,
  network: Buffer,
  now: bigint,
): Promise<Map<string, number>> {
  const counterSpecs = activeSpecs(session, network);
  for (const spec of counterSpecs) {
    await client.query(INSERT_ACTIVE_SQL, [
      spec.scope_kind,
      spec.digest,
      spec.dimension,
      now.toString(),
    ]);
  }
  const loaded = await client.query<Record<string, unknown>>(LOAD_ACTIVE_SQL, [
    session,
    network,
  ]);
  if (loaded.rowCount !== counterSpecs.length) throw new Error("ABUSE_STATE");
  const counts = new Map<string, number>();
  for (const row of loaded.rows) {
    const count = integer(row.active_count);
    if (
      typeof row.dimension !== "string" ||
      count === null ||
      count > 1_000_000n
    )
      throw new Error("ABUSE_STATE");
    counts.set(row.dimension, Number(count));
  }
  return counts;
}

export async function reserveGuestAbuseCounters(
  client: PoolClient,
  input: ReservationInput,
): Promise<GuestAbuseDecision> {
  const session = digestBytes(input.guest_session_scope, "sha256:");
  const network = digestBytes(input.network_signal_digest, "hmac-sha256:");
  const control = await client.query<{ service_state: "OPEN" | "PAUSED" }>(
    CONTROL_SQL,
    [GUEST_ABUSE_POLICY.policy_id],
  );
  if (control.rowCount !== 1) throw new Error("ABUSE_STATE");
  const windowStates = await loadWindowState(
    client,
    specs(session, network),
    session,
    network,
    input.now_unix_seconds,
  );
  const active = await loadActiveState(
    client,
    session,
    network,
    input.now_unix_seconds,
  );
  const windows = new Map(windowStates.map((item) => [item.dimension, item]));
  const usageWindow = (dimension: CounterSpec["dimension"]) => {
    const state = windows.get(dimension);
    if (!state) throw new Error("ABUSE_STATE");
    return { count: state.count, reset_at_unix_seconds: state.reset_at };
  };
  const decision = decideGuestAbuseAdmission({
    guest_session_scope: input.guest_session_scope,
    network_signal_digest: input.network_signal_digest,
    now_unix_seconds: input.now_unix_seconds,
    service_state: control.rows[0]?.service_state,
    usage: {
      session_burst: usageWindow("SESSION_BURST"),
      session_daily: usageWindow("SESSION_DAILY"),
      network_burst: usageWindow("NETWORK_BURST"),
      network_daily: usageWindow("NETWORK_DAILY"),
      session_active: active.get("SESSION_ACTIVE"),
      network_active: active.get("NETWORK_ACTIVE"),
    },
  });
  if (!decision.ok) return decision;
  for (const state of windowStates) {
    const updated = await client.query(
      `UPDATE guest_abuse_window_counters
       SET usage_count = usage_count + 1,
         updated_at = to_timestamp($4::double precision)
       WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3`,
      [
        state.scope_kind,
        state.digest,
        state.dimension,
        input.now_unix_seconds.toString(),
      ],
    );
    if (updated.rowCount !== 1) throw new Error("ABUSE_STATE");
  }
  for (const spec of activeSpecs(session, network)) {
    const updated = await client.query(
      `UPDATE guest_abuse_active_counters
       SET active_count = active_count + 1,
         updated_at = to_timestamp($4::double precision)
       WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3`,
      [
        spec.scope_kind,
        spec.digest,
        spec.dimension,
        input.now_unix_seconds.toString(),
      ],
    );
    if (updated.rowCount !== 1) throw new Error("ABUSE_STATE");
  }
  await client.query(INSERT_RESERVATION_SQL, [
    input.guest_scan_id,
    session,
    network,
    GUEST_ABUSE_POLICY.policy_id,
    input.now_unix_seconds.toString(),
  ]);
  return decision;
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
  const reservedAt = integer(row.reserved_at);
  const deadline = integer(row.deletion_deadline);
  if (
    !(row.guest_session_scope instanceof Uint8Array) ||
    !(row.network_signal_digest instanceof Uint8Array) ||
    reservedAt === null ||
    deadline === null ||
    nowUnixSeconds < reservedAt ||
    nowUnixSeconds > deadline
  ) {
    return false;
  }
  const counters = activeSpecs(
    Buffer.from(row.guest_session_scope),
    Buffer.from(row.network_signal_digest),
  );
  for (const spec of counters) {
    const decremented = await client.query<{ active_count: number }>(
      `UPDATE guest_abuse_active_counters
       SET active_count = active_count - 1,
         updated_at = to_timestamp($4::double precision)
       WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3
         AND active_count > 0 RETURNING active_count`,
      [spec.scope_kind, spec.digest, spec.dimension, nowUnixSeconds.toString()],
    );
    if (decremented.rowCount !== 1) return false;
    if (decremented.rows[0]?.active_count === 0) {
      const removed = await client.query(
        `DELETE FROM guest_abuse_active_counters
         WHERE scope_kind = $1 AND scope_digest = $2 AND dimension = $3
           AND active_count = 0`,
        [spec.scope_kind, spec.digest, spec.dimension],
      );
      if (removed.rowCount !== 1) return false;
    }
  }
  const released = await client.query(
    `UPDATE guest_abuse_reservations
     SET released_at = to_timestamp($2::double precision), release_reason = $3
     WHERE guest_scan_id = $1 AND released_at IS NULL`,
    [guestScanId, nowUnixSeconds.toString(), reason],
  );
  return released.rowCount === 1;
}
