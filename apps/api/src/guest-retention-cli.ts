import { randomUUID } from "node:crypto";

import { createDatabasePool } from "./db/index.js";
import { createPostgresGuestRetentionWorker } from "./guest-persistence/index.js";
import {
  createPostgresGuestRetentionRunStore,
  startGuestRetentionScheduler,
} from "./guest-retention/index.js";

const pool = createDatabasePool({
  OUTSCAN_DATABASE_URL: process.env.OUTSCAN_DATABASE_URL,
  OUTSCAN_DATABASE_SSL: process.env.OUTSCAN_DATABASE_SSL,
});
const now = () => Math.floor(Date.now() / 1_000);
const scheduler = startGuestRetentionScheduler(
  {
    worker: createPostgresGuestRetentionWorker({
      pool,
      now_unix_seconds: now,
    }),
    run_store: createPostgresGuestRetentionRunStore(pool),
    create_run_id: randomUUID,
    now_unix_seconds: now,
  },
  { batch_size: 100, max_batches: 10, interval_ms: 60_000 },
  (outcome) => {
    const event = outcome.ok
      ? {
          component: "guest-retention",
          event: "cycle",
          status: outcome.record.status,
          alert_code: outcome.record.alert_code,
          batch_count: outcome.record.batch_count,
          scans_deleted: outcome.record.scans_deleted,
          stale_windows_deleted: outcome.record.stale_windows_deleted,
          inconsistencies: outcome.record.inconsistencies,
        }
      : {
          component: "guest-retention",
          event: "cycle",
          status: "FAILED",
          alert_code: outcome.code,
        };
    process.stdout.write(`${JSON.stringify(event)}\n`);
  },
);

let stopping = false;
async function stop(): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await scheduler.stop();
  } finally {
    await pool.end();
  }
}

function requestStop(): void {
  void stop().catch(() => {
    process.stderr.write("Guest retention shutdown failed.\n");
    process.exitCode = 1;
  });
}

pool.on("error", () => {
  process.stderr.write("Guest retention database pool failed.\n");
  process.exitCode = 1;
  requestStop();
});
process.once("SIGINT", requestStop);
process.once("SIGTERM", requestStop);
