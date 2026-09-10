import type { PoolClient } from "pg";

import { GUEST_ABUSE_POLICY } from "../guest-abuse/index.js";

export type WindowDimension =
  "SESSION_BURST" | "SESSION_DAILY" | "NETWORK_BURST" | "NETWORK_DAILY";
export type ActiveDimension = "SESSION_ACTIVE" | "NETWORK_ACTIVE";

export interface WindowCounterSpec {
  scope_kind: "SESSION" | "NETWORK";
  dimension: WindowDimension;
  digest: Buffer;
  window_seconds: bigint;
}

export interface ActiveCounterSpec {
  scope_kind: "SESSION" | "NETWORK";
  dimension: ActiveDimension;
  digest: Buffer;
}

export interface AbuseCounterState {
  active: ReadonlyMap<ActiveDimension, number>;
  increment_active: readonly ActiveCounterSpec[];
  increment_windows: readonly WindowCounterSpec[];
  windows: ReadonlyMap<
    WindowDimension,
    { count: number; reset_at_unix_seconds: bigint }
  >;
}

const INSERT_WINDOW_SQL = `
  INSERT INTO guest_abuse_window_counters (
    scope_kind, scope_digest, dimension, usage_count, reset_at, updated_at
  ) VALUES (
    $1, $2, $3, 0, to_timestamp($4::double precision),
    to_timestamp($5::double precision)
  ) ON CONFLICT (scope_kind, scope_digest, dimension) DO UPDATE
    SET usage_count = 0, reset_at = EXCLUDED.reset_at,
      updated_at = EXCLUDED.updated_at
    WHERE guest_abuse_window_counters.reset_at <= EXCLUDED.updated_at`;

const INSERT_ACTIVE_SQL = `
  INSERT INTO guest_abuse_active_counters (
    scope_kind, scope_digest, dimension, active_count, updated_at
  ) VALUES ($1, $2, $3, 0, to_timestamp($4::double precision))
  ON CONFLICT (scope_kind, scope_digest, dimension) DO NOTHING`;

const LOAD_WINDOWS_SQL = `
  SELECT scope_kind, encode(scope_digest, 'hex') AS digest_hex, dimension,
    usage_count::text, extract(epoch FROM reset_at)::bigint::text AS reset_at
  FROM guest_abuse_window_counters
  WHERE (scope_kind = 'SESSION' AND scope_digest = $1)
    OR (scope_kind = 'NETWORK' AND scope_digest = ANY(
      SELECT decode(value, 'hex') FROM unnest($2::text[]) AS value
    ))
  ORDER BY scope_kind, scope_digest, dimension
  FOR UPDATE`;

const LOAD_ACTIVE_SQL = `
  SELECT scope_kind, encode(scope_digest, 'hex') AS digest_hex, dimension,
    active_count::text
  FROM guest_abuse_active_counters
  WHERE (scope_kind = 'SESSION' AND scope_digest = $1)
    OR (scope_kind = 'NETWORK' AND scope_digest = ANY(
      SELECT decode(value, 'hex') FROM unnest($2::text[]) AS value
    ))
  ORDER BY scope_kind, scope_digest, dimension
  FOR UPDATE`;

export function digestBytes(value: string, prefix: string): Buffer {
  return Buffer.from(value.slice(prefix.length), "hex");
}

export function strictInteger(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/u.test(value))
    return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export function windowSpecs(
  session: Buffer,
  network: Buffer,
): WindowCounterSpec[] {
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

export function activeSpecs(
  session: Buffer,
  network: Buffer,
): ActiveCounterSpec[] {
  return [
    {
      scope_kind: "NETWORK",
      dimension: "NETWORK_ACTIVE",
      digest: network,
    },
    {
      scope_kind: "SESSION",
      dimension: "SESSION_ACTIVE",
      digest: session,
    },
  ];
}

function expectedWindowSeconds(dimension: WindowDimension): bigint {
  switch (dimension) {
    case "SESSION_BURST":
      return GUEST_ABUSE_POLICY.session_burst_window_seconds;
    case "SESSION_DAILY":
      return GUEST_ABUSE_POLICY.session_daily_window_seconds;
    case "NETWORK_BURST":
      return GUEST_ABUSE_POLICY.network_burst_window_seconds;
    case "NETWORK_DAILY":
      return GUEST_ABUSE_POLICY.network_daily_window_seconds;
  }
}

function isWindowDimension(value: unknown): value is WindowDimension {
  return (
    value === "SESSION_BURST" ||
    value === "SESSION_DAILY" ||
    value === "NETWORK_BURST" ||
    value === "NETWORK_DAILY"
  );
}

function isActiveDimension(value: unknown): value is ActiveDimension {
  return value === "SESSION_ACTIVE" || value === "NETWORK_ACTIVE";
}

async function insertCurrentRows(
  client: PoolClient,
  windows: readonly WindowCounterSpec[],
  active: readonly ActiveCounterSpec[],
  now: bigint,
): Promise<void> {
  for (const spec of windows) {
    await client.query(INSERT_WINDOW_SQL, [
      spec.scope_kind,
      spec.digest,
      spec.dimension,
      (now + spec.window_seconds).toString(),
      now.toString(),
    ]);
  }
  for (const spec of active) {
    await client.query(INSERT_ACTIVE_SQL, [
      spec.scope_kind,
      spec.digest,
      spec.dimension,
      now.toString(),
    ]);
  }
}

async function loadWindows(
  client: PoolClient,
  session: Buffer,
  networkDigests: readonly Buffer[],
  now: bigint,
): Promise<
  Map<WindowDimension, { count: number; reset_at_unix_seconds: bigint }>
> {
  const loaded = await client.query<Record<string, unknown>>(LOAD_WINDOWS_SQL, [
    session,
    networkDigests.map((digest) => digest.toString("hex")),
  ]);
  const aggregate = new Map<
    WindowDimension,
    { count: number; reset_at_unix_seconds: bigint }
  >();
  for (const row of loaded.rows) {
    const dimension = row.dimension;
    const count = strictInteger(row.usage_count);
    const resetAt = strictInteger(row.reset_at);
    if (
      !isWindowDimension(dimension) ||
      count === null ||
      count > 1_000_000n ||
      resetAt === null ||
      typeof row.digest_hex !== "string" ||
      !/^[0-9a-f]{64}$/u.test(row.digest_hex) ||
      (row.scope_kind !== "SESSION" && row.scope_kind !== "NETWORK") ||
      resetAt > now + expectedWindowSeconds(dimension)
    )
      throw new Error("ABUSE_STATE");
    if (resetAt <= now) continue;
    const previous = aggregate.get(dimension);
    aggregate.set(dimension, {
      count: (previous?.count ?? 0) + Number(count),
      reset_at_unix_seconds:
        previous && previous.reset_at_unix_seconds > resetAt
          ? previous.reset_at_unix_seconds
          : resetAt,
    });
  }
  return aggregate;
}

async function loadActive(
  client: PoolClient,
  session: Buffer,
  networkDigests: readonly Buffer[],
): Promise<Map<ActiveDimension, number>> {
  const loaded = await client.query<Record<string, unknown>>(LOAD_ACTIVE_SQL, [
    session,
    networkDigests.map((digest) => digest.toString("hex")),
  ]);
  const aggregate = new Map<ActiveDimension, number>();
  for (const row of loaded.rows) {
    const dimension = row.dimension;
    const count = strictInteger(row.active_count);
    if (
      !isActiveDimension(dimension) ||
      count === null ||
      count > 1_000_000n ||
      typeof row.digest_hex !== "string" ||
      !/^[0-9a-f]{64}$/u.test(row.digest_hex) ||
      (row.scope_kind !== "SESSION" && row.scope_kind !== "NETWORK")
    )
      throw new Error("ABUSE_STATE");
    aggregate.set(dimension, (aggregate.get(dimension) ?? 0) + Number(count));
  }
  return aggregate;
}

export async function loadAbuseCounterState(
  client: PoolClient,
  session: Buffer,
  networkDigests: readonly Buffer[],
  now: bigint,
): Promise<AbuseCounterState> {
  const activeNetwork = networkDigests[0];
  if (!activeNetwork) throw new Error("ABUSE_STATE");
  const currentWindows = windowSpecs(session, activeNetwork);
  const currentActive = activeSpecs(session, activeNetwork);
  await insertCurrentRows(client, currentWindows, currentActive, now);
  const windows = await loadWindows(client, session, networkDigests, now);
  const active = await loadActive(client, session, networkDigests);
  for (const spec of currentWindows) {
    if (!windows.has(spec.dimension)) throw new Error("ABUSE_STATE");
  }
  for (const spec of currentActive) {
    if (!active.has(spec.dimension)) throw new Error("ABUSE_STATE");
  }
  return {
    active,
    increment_active: currentActive,
    increment_windows: currentWindows,
    windows,
  };
}
