import { Pool, type PoolConfig } from "pg";

const CONNECTION_TIMEOUT_MS = 5_000;
const IDLE_TIMEOUT_MS = 10_000;
const MAX_POOL_SIZE = 10;

export type DatabaseSslMode = "disable" | "require";

export interface DatabaseEnvironment {
  OUTSCAN_DATABASE_URL?: string;
  OUTSCAN_DATABASE_SSL?: string;
}

export function databasePoolConfig(
  environment: DatabaseEnvironment,
): PoolConfig {
  const connectionString = environment.OUTSCAN_DATABASE_URL;
  const sslMode = environment.OUTSCAN_DATABASE_SSL;
  if (
    typeof connectionString !== "string" ||
    connectionString.length < 1 ||
    connectionString.length > 2_048 ||
    (sslMode !== "disable" && sslMode !== "require")
  ) {
    throw new Error("INVALID_DATABASE_CONFIGURATION");
  }
  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error("INVALID_DATABASE_CONFIGURATION");
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.hostname.length === 0 ||
    [...parsed.searchParams.keys()].some((key) =>
      key.toLowerCase().startsWith("ssl"),
    )
  ) {
    throw new Error("INVALID_DATABASE_CONFIGURATION");
  }
  return Object.freeze({
    application_name: "outscan-api",
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    max: MAX_POOL_SIZE,
    ssl: sslMode === "require" ? { rejectUnauthorized: true } : false,
  });
}

export function createDatabasePool(environment: DatabaseEnvironment): Pool {
  return new Pool(databasePoolConfig(environment));
}
