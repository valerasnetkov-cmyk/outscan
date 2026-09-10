CREATE TABLE platform_guest_queue_telemetry_batches (
  batch_id varchar(128) PRIMARY KEY CHECK (
    batch_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
  ),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  committed integer NOT NULL,
  already_committed integer NOT NULL,
  terminal_acknowledged integer NOT NULL,
  not_acquirable_acknowledged integer NOT NULL,
  retry_lease_held integer NOT NULL,
  retry_persistence integer NOT NULL,
  retry_context integer NOT NULL,
  retry_start integer NOT NULL,
  retry_heartbeat integer NOT NULL,
  retry_supervisor integer NOT NULL,
  retry_rejection_sink integer NOT NULL,
  retry_commit integer NOT NULL,
  counter_saturated boolean NOT NULL,
  alert_code text CHECK (
    alert_code IS NULL OR alert_code IN (
      'GUEST_QUEUE_TELEMETRY_SATURATED',
      'GUEST_QUEUE_SECURITY_PATH_FAILURE',
      'GUEST_QUEUE_RESULT_INGRESS_FAILURE',
      'GUEST_QUEUE_EXECUTION_FAILURE',
      'GUEST_QUEUE_DEPENDENCY_FAILURE'
    )
  ),
  retention_deadline timestamptz NOT NULL,
  CONSTRAINT guest_queue_telemetry_time_contract CHECK (
    date_trunc('second', started_at) = started_at
    AND date_trunc('second', finished_at) = finished_at
    AND date_trunc('second', retention_deadline) = retention_deadline
    AND finished_at >= started_at
    AND retention_deadline = finished_at + interval '30 days'
  ),
  CONSTRAINT guest_queue_telemetry_count_contract CHECK (
    committed BETWEEN 0 AND 2147483647
    AND already_committed BETWEEN 0 AND 2147483647
    AND terminal_acknowledged BETWEEN 0 AND 2147483647
    AND not_acquirable_acknowledged BETWEEN 0 AND 2147483647
    AND retry_lease_held BETWEEN 0 AND 2147483647
    AND retry_persistence BETWEEN 0 AND 2147483647
    AND retry_context BETWEEN 0 AND 2147483647
    AND retry_start BETWEEN 0 AND 2147483647
    AND retry_heartbeat BETWEEN 0 AND 2147483647
    AND retry_supervisor BETWEEN 0 AND 2147483647
    AND retry_rejection_sink BETWEEN 0 AND 2147483647
    AND retry_commit BETWEEN 0 AND 2147483647
    AND 0::bigint + committed + already_committed + terminal_acknowledged
      + not_acquirable_acknowledged + retry_lease_held + retry_persistence
      + retry_context + retry_start + retry_heartbeat + retry_supervisor
      + retry_rejection_sink + retry_commit > 0
  ),
  CONSTRAINT guest_queue_telemetry_alert_contract CHECK (
    (
      counter_saturated
      AND alert_code IS NOT DISTINCT FROM 'GUEST_QUEUE_TELEMETRY_SATURATED'
    )
    OR (
      NOT counter_saturated AND retry_rejection_sink > 0
      AND alert_code IS NOT DISTINCT FROM 'GUEST_QUEUE_SECURITY_PATH_FAILURE'
    )
    OR (
      NOT counter_saturated AND retry_rejection_sink = 0
      AND retry_commit > 0
      AND alert_code IS NOT DISTINCT FROM 'GUEST_QUEUE_RESULT_INGRESS_FAILURE'
    )
    OR (
      NOT counter_saturated AND retry_rejection_sink = 0
      AND retry_commit = 0
      AND (retry_heartbeat > 0 OR retry_supervisor > 0)
      AND alert_code IS NOT DISTINCT FROM 'GUEST_QUEUE_EXECUTION_FAILURE'
    )
    OR (
      NOT counter_saturated AND retry_rejection_sink = 0
      AND retry_commit = 0 AND retry_heartbeat = 0 AND retry_supervisor = 0
      AND (retry_persistence > 0 OR retry_context > 0 OR retry_start > 0)
      AND alert_code IS NOT DISTINCT FROM 'GUEST_QUEUE_DEPENDENCY_FAILURE'
    )
    OR (
      NOT counter_saturated AND retry_rejection_sink = 0
      AND retry_commit = 0 AND retry_heartbeat = 0 AND retry_supervisor = 0
      AND retry_persistence = 0 AND retry_context = 0 AND retry_start = 0
      AND alert_code IS NULL
    )
  )
);

CREATE INDEX platform_guest_queue_telemetry_alert_idx
  ON platform_guest_queue_telemetry_batches(finished_at, alert_code)
  WHERE alert_code IS NOT NULL;

CREATE INDEX platform_guest_queue_telemetry_expiry_idx
  ON platform_guest_queue_telemetry_batches(retention_deadline);

CREATE FUNCTION guard_platform_guest_queue_telemetry_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GuestQueueTelemetryBatch is immutable';
END $$;

CREATE TRIGGER platform_guest_queue_telemetry_update_guard
BEFORE UPDATE ON platform_guest_queue_telemetry_batches
FOR EACH ROW EXECUTE FUNCTION guard_platform_guest_queue_telemetry_update();

REVOKE ALL ON platform_guest_queue_telemetry_batches FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_platform_guest_queue_telemetry_update() FROM PUBLIC;
