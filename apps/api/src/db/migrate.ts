import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/u;
const ADVISORY_LOCK_KEY = 684_215_117;

export interface AppliedMigration {
  version: string;
  checksum: string;
}

export interface MigrationResult {
  applied: readonly string[];
  already_applied: readonly string[];
}

async function loadMigrations(directory: URL): Promise<AppliedMigration[]> {
  const names = (await readdir(directory))
    .filter((name) => MIGRATION_NAME.test(name))
    .sort();
  if (names.length === 0) throw new Error("NO_DATABASE_MIGRATIONS");
  const seenVersions = new Set<string>();
  const migrations: AppliedMigration[] = [];
  for (const name of names) {
    const version = name.slice(0, 4);
    if (seenVersions.has(version))
      throw new Error("DUPLICATE_MIGRATION_VERSION");
    seenVersions.add(version);
    const sql = await readFile(new URL(name, directory), "utf8");
    if (sql.trim().length === 0) throw new Error("EMPTY_DATABASE_MIGRATION");
    migrations.push({
      version: name,
      checksum: createHash("sha256").update(sql, "utf8").digest("hex"),
    });
  }
  return migrations;
}

async function ensureLedger(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS outscan_schema_migrations (
      version text PRIMARY KEY CHECK (version ~ '^[0-9]{4}_[a-z0-9_]+[.]sql$'),
      checksum character(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
    )
  `);
}

export async function migrateDatabase(
  pool: Pool,
  directory: URL,
): Promise<MigrationResult> {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    await ensureLedger(client);
    const ledger = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM outscan_schema_migrations ORDER BY version",
    );
    const available = new Map(migrations.map((item) => [item.version, item]));
    for (const row of ledger.rows) {
      const migration = available.get(row.version);
      if (!migration || migration.checksum !== row.checksum)
        throw new Error("DATABASE_MIGRATION_DRIFT");
      alreadyApplied.push(row.version);
    }
    const completed = new Set(ledger.rows.map((row) => row.version));
    const lastApplied = ledger.rows.at(-1)?.version;
    for (const migration of migrations) {
      if (completed.has(migration.version)) continue;
      if (lastApplied && migration.version < lastApplied)
        throw new Error("DATABASE_MIGRATION_ORDER");
      const sql = await readFile(new URL(migration.version, directory), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO outscan_schema_migrations(version, checksum) VALUES ($1, $2)",
          [migration.version, migration.checksum],
        );
        await client.query("COMMIT");
        applied.push(migration.version);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return Object.freeze({
      applied: Object.freeze(applied),
      already_applied: Object.freeze(alreadyApplied),
    });
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}
