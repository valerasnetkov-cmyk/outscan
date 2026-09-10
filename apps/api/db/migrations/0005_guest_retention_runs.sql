CREATE TABLE platform_guest_retention_runs (
  run_id varchar(128) PRIMARY KEY CHECK (
    run_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
  ),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  status text NOT NULL CHECK (
    status IN ('SUCCEEDED', 'PARTIAL', 'FAILED')
  ),
  observed_at timestamptz,
  batch_count integer NOT NULL CHECK (batch_count BETWEEN 1 AND 100),
  due_scans_selected integer NOT NULL CHECK (due_scans_selected >= 0),
  scans_deleted integer NOT NULL CHECK (scans_deleted >= 0),
  active_counter_decrements integer NOT NULL CHECK (
    active_counter_decrements >= 0
  ),
  stale_windows_deleted integer NOT NULL CHECK (stale_windows_deleted >= 0),
  inconsistencies integer NOT NULL CHECK (inconsistencies >= 0),
  more_work boolean,
  failure_code text CHECK (
    failure_code IS NULL OR failure_code = 'GUEST_RETENTION_UNAVAILABLE'
  ),
  alert_code text CHECK (
    alert_code IS NULL OR alert_code IN (
      'GUEST_RETENTION_INCONSISTENCY', 'GUEST_RETENTION_UNAVAILABLE'
    )
  ),
  retention_deadline timestamptz NOT NULL,
  CONSTRAINT guest_retention_run_time_contract CHECK (
    date_trunc('second', started_at) = started_at
    AND date_trunc('second', finished_at) = finished_at
    AND (
      observed_at IS NULL OR date_trunc('second', observed_at) = observed_at
    )
    AND date_trunc('second', retention_deadline) = retention_deadline
    AND finished_at >= started_at
    AND (observed_at IS NULL OR observed_at BETWEEN started_at AND finished_at)
    AND retention_deadline = finished_at + interval '30 days'
  ),
  CONSTRAINT guest_retention_run_status_shape CHECK (
    (
      status = 'FAILED'
      AND more_work IS NULL
      AND failure_code = 'GUEST_RETENTION_UNAVAILABLE'
      AND alert_code = 'GUEST_RETENTION_UNAVAILABLE'
    )
    OR (
      status IN ('SUCCEEDED', 'PARTIAL')
      AND observed_at IS NOT NULL
      AND failure_code IS NULL
      AND more_work = (status = 'PARTIAL')
      AND (
        (inconsistencies = 0 AND alert_code IS NULL)
        OR (
          inconsistencies > 0
          AND alert_code = 'GUEST_RETENTION_INCONSISTENCY'
        )
      )
    )
  ),
  CONSTRAINT guest_retention_run_counter_bounds CHECK (
    due_scans_selected <= batch_count * 1000
    AND scans_deleted <= due_scans_selected
    AND active_counter_decrements <= scans_deleted * 2
    AND stale_windows_deleted <= batch_count * 1000
    AND inconsistencies <= scans_deleted * 2
  )
);

CREATE INDEX platform_guest_retention_alert_idx
  ON platform_guest_retention_runs(finished_at, alert_code)
  WHERE alert_code IS NOT NULL;

CREATE INDEX platform_guest_retention_expiry_idx
  ON platform_guest_retention_runs(retention_deadline);

CREATE FUNCTION guard_platform_guest_retention_run_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GuestRetentionRun is immutable';
END $$;

CREATE TRIGGER platform_guest_retention_run_update_guard
BEFORE UPDATE ON platform_guest_retention_runs
FOR EACH ROW EXECUTE FUNCTION guard_platform_guest_retention_run_update();

REVOKE ALL ON platform_guest_retention_runs FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_platform_guest_retention_run_update() FROM PUBLIC;
