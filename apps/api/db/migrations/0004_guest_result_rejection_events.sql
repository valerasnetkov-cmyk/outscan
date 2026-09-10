CREATE TABLE guest_result_rejection_events (
  guest_scan_id varchar(128) NOT NULL,
  attempt_id varchar(128) NOT NULL,
  monotonic_fence bigint NOT NULL CHECK (
    monotonic_fence BETWEEN 1 AND 9007199254740991
  ),
  rejection_code text NOT NULL CHECK (
    rejection_code IN (
      'RESULT_SUBMISSION_REJECTED', 'INVALID_STATE', 'JOB_NOT_RUNNING',
      'ATTEMPT_NOT_RUNNING', 'STALE_ATTEMPT', 'LEASE_EXPIRED',
      'ATTEMPT_DEADLINE_EXCEEDED', 'RESULT_DIGEST_CONFLICT',
      'GUEST_PERSISTENCE_UNAVAILABLE'
    )
  ),
  security_relevant boolean NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT date_trunc(
    'second', transaction_timestamp()
  ),
  CONSTRAINT guest_result_rejection_whole_second CHECK (
    date_trunc('second', occurred_at) = occurred_at
  ),
  CONSTRAINT guest_result_rejection_security_class CHECK (
    security_relevant = (
      rejection_code IN (
        'RESULT_SUBMISSION_REJECTED', 'INVALID_STATE',
        'RESULT_DIGEST_CONFLICT'
      )
    )
  ),
  CONSTRAINT guest_result_rejection_attempt_fk
    FOREIGN KEY (guest_scan_id, attempt_id, monotonic_fence)
    REFERENCES guest_scan_attempts(guest_scan_id, id, monotonic_fence)
    ON DELETE CASCADE,
  CONSTRAINT guest_result_rejection_identity PRIMARY KEY (
    guest_scan_id, attempt_id, monotonic_fence, rejection_code
  )
);

CREATE INDEX guest_result_rejection_metrics_idx
  ON guest_result_rejection_events(occurred_at, rejection_code);

CREATE FUNCTION guard_guest_result_rejection_event_insert() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  scan_created_at timestamptz;
  scan_deletion_deadline timestamptz;
BEGIN
  SELECT created_at, deletion_deadline
    INTO scan_created_at, scan_deletion_deadline
    FROM guest_scans WHERE id = NEW.guest_scan_id;
  IF NOT FOUND OR NEW.occurred_at < scan_created_at
    OR NEW.occurred_at >= scan_deletion_deadline
  THEN
    RAISE EXCEPTION 'GuestResultRejectionEvent outside retention window';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION guard_guest_result_rejection_event_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GuestResultRejectionEvent is immutable';
END $$;

CREATE TRIGGER guest_result_rejection_event_insert_guard
BEFORE INSERT ON guest_result_rejection_events
FOR EACH ROW EXECUTE FUNCTION guard_guest_result_rejection_event_insert();

CREATE TRIGGER guest_result_rejection_event_update_guard
BEFORE UPDATE ON guest_result_rejection_events
FOR EACH ROW EXECUTE FUNCTION guard_guest_result_rejection_event_update();

REVOKE ALL ON guest_result_rejection_events FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_guest_result_rejection_event_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_guest_result_rejection_event_update() FROM PUBLIC;
