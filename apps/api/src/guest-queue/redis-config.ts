const CONNECTION_TIMEOUT_MS = 5_000;
const MAX_URL_LENGTH = 2_048;

export type GuestRedisTlsMode = "disable" | "require";

export interface GuestRedisEnvironment {
  OUTSCAN_REDIS_URL?: string;
  OUTSCAN_REDIS_TLS?: string;
}

export interface GuestRedisConnection {
  readonly host: string;
  readonly port: number;
  readonly db: number;
  readonly username?: string;
  readonly password?: string;
  readonly connectTimeout: number;
  readonly enableReadyCheck: true;
  readonly maxRetriesPerRequest: null;
  readonly tls?: Readonly<{
    minVersion: "TLSv1.2";
    rejectUnauthorized: true;
    servername: string;
  }>;
}

function credential(value: string, minimum: number, maximum: number) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (
    decoded.length < minimum ||
    decoded.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(decoded)
  ) {
    return null;
  }
  return decoded;
}

function database(pathname: string): number | null {
  if (!/^\/(?:0|[1-9]|1[0-5])$/u.test(pathname)) return null;
  return Number(pathname.slice(1));
}

export function guestRedisConnectionConfig(
  environment: GuestRedisEnvironment,
): GuestRedisConnection {
  let urlValue: unknown;
  let tlsMode: unknown;
  try {
    urlValue = environment.OUTSCAN_REDIS_URL;
    tlsMode = environment.OUTSCAN_REDIS_TLS;
  } catch {
    throw new Error("INVALID_GUEST_REDIS_CONFIGURATION");
  }
  if (
    typeof urlValue !== "string" ||
    urlValue.length < 1 ||
    urlValue.length > MAX_URL_LENGTH ||
    (tlsMode !== "disable" && tlsMode !== "require")
  ) {
    throw new Error("INVALID_GUEST_REDIS_CONFIGURATION");
  }
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error("INVALID_GUEST_REDIS_CONFIGURATION");
  }
  const expectedProtocol = tlsMode === "require" ? "rediss:" : "redis:";
  const db = database(parsed.pathname);
  const port = parsed.port ? Number(parsed.port) : 6379;
  const username = parsed.username ? credential(parsed.username, 1, 128) : null;
  const password = parsed.password ? credential(parsed.password, 1, 512) : null;
  if (
    parsed.protocol !== expectedProtocol ||
    parsed.hostname.length < 1 ||
    parsed.hostname.length > 253 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0 ||
    db === null ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    (parsed.username.length > 0 && username === null) ||
    (parsed.password.length > 0 && password === null) ||
    (username !== null && password === null) ||
    (tlsMode === "require" && password === null)
  ) {
    throw new Error("INVALID_GUEST_REDIS_CONFIGURATION");
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, "");
  return Object.freeze({
    host,
    port,
    db,
    ...(username === null ? {} : { username }),
    ...(password === null ? {} : { password }),
    connectTimeout: CONNECTION_TIMEOUT_MS,
    enableReadyCheck: true as const,
    maxRetriesPerRequest: null,
    ...(tlsMode === "require"
      ? {
          tls: Object.freeze({
            minVersion: "TLSv1.2" as const,
            rejectUnauthorized: true,
            servername: host,
          }),
        }
      : {}),
  });
}
