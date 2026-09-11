ALTER TABLE platform_guest_retention_runs
  ADD COLUMN session_revocations_deleted integer NOT NULL DEFAULT 0;

ALTER TABLE platform_guest_retention_runs
  ADD CONSTRAINT guest_retention_revocation_counter_bounds CHECK (
    session_revocations_deleted BETWEEN 0 AND batch_count * 1000
  );

ALTER TABLE platform_guest_retention_runs
  ALTER COLUMN session_revocations_deleted DROP DEFAULT;
