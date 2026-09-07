import { createDatabasePool } from "./config.js";
import { migrateDatabase } from "./migrate.js";

const pool = createDatabasePool({
  OUTSCAN_DATABASE_URL: process.env.OUTSCAN_DATABASE_URL,
  OUTSCAN_DATABASE_SSL: process.env.OUTSCAN_DATABASE_SSL,
});

try {
  const result = await migrateDatabase(
    pool,
    new URL("../../db/migrations/", import.meta.url),
  );
  process.stdout.write(
    `Database migrations applied=${result.applied.length} existing=${result.already_applied.length}\n`,
  );
} catch {
  process.stderr.write("Database migration failed.\n");
  process.exitCode = 1;
} finally {
  await pool.end();
}
