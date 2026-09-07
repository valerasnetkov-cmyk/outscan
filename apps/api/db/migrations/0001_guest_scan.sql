CREATE TABLE guest_scans (
  id varchar(128) PRIMARY KEY CHECK (
    id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
  ),
  canonical_target varchar(253) NOT NULL,
  guest_session_scope bytea NOT NULL CHECK (octet_length(guest_session_scope) = 32),
  endpoint_operation text NOT NULL DEFAULT 'POST:/v1/public/scans',
  idempotency_key varchar(128) NOT NULL CHECK (
    idempotency_key ~ '^[!-~]{1,128}$'
  ),
  request_hash bytea NOT NULL CHECK (octet_length(request_hash) = 32),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  idempotency_expires_at timestamptz NOT NULL,
  deletion_deadline timestamptz NOT NULL,
  job_state text NOT NULL,
  policy_id text NOT NULL,
  policy_version text NOT NULL,
  profile text NOT NULL,
  result_token_version bigint NOT NULL CHECK (result_token_version >= 0),
  result_token_nonce bytea NOT NULL CHECK (octet_length(result_token_nonce) = 32),
  result_token_key_version bigint NOT NULL CHECK (
    result_token_key_version BETWEEN 0 AND 4294967295
  ),
  result_access_expires_at timestamptz NOT NULL,
  result_access_revoked_at timestamptz,
  current_attempt_id varchar(128),
  current_fence bigint NOT NULL DEFAULT 0 CHECK (
    current_fence BETWEEN 0 AND 9007199254740991
  ),
  accepted_attempt_id varchar(128),
  accepted_fence bigint CHECK (
    accepted_fence BETWEEN 1 AND 9007199254740991
  ),
  accepted_payload_digest bytea CHECK (
    accepted_payload_digest IS NULL OR octet_length(accepted_payload_digest) = 32
  ),
  CONSTRAINT guest_scans_target_canonical CHECK (
    canonical_target = lower(canonical_target)
    AND canonical_target !~ '[.]$'
  ),
  CONSTRAINT guest_scans_operation_fixed CHECK (
    endpoint_operation = 'POST:/v1/public/scans'
  ),
  CONSTRAINT guest_scans_profile_fixed CHECK (
    policy_id = 'outscan-v1'
    AND policy_version = '1.0.0'
    AND profile = 'GUEST_SAFE'
  ),
  CONSTRAINT guest_scans_job_state CHECK (
    job_state IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED')
  ),
  CONSTRAINT guest_scans_time_contract CHECK (
    date_trunc('second', created_at) = created_at
    AND date_trunc('second', updated_at) = updated_at
    AND date_trunc('second', idempotency_expires_at) = idempotency_expires_at
    AND date_trunc('second', deletion_deadline) = deletion_deadline
    AND date_trunc('second', result_access_expires_at) = result_access_expires_at
    AND (
      result_access_revoked_at IS NULL
      OR date_trunc('second', result_access_revoked_at) = result_access_revoked_at
    )
    AND updated_at >= created_at
    AND updated_at <= deletion_deadline
    AND idempotency_expires_at = created_at + interval '30 minutes'
    AND result_access_expires_at = idempotency_expires_at
    AND deletion_deadline = created_at + interval '24 hours'
    AND (
      result_access_revoked_at IS NULL
      OR result_access_revoked_at BETWEEN created_at AND updated_at
    )
  ),
  CONSTRAINT guest_scans_current_pair CHECK (
    (current_attempt_id IS NULL AND current_fence = 0)
    OR (current_attempt_id IS NOT NULL AND current_fence > 0)
  ),
  CONSTRAINT guest_scans_queued_shape CHECK (
    job_state <> 'QUEUED' OR current_attempt_id IS NULL
  ),
  CONSTRAINT guest_scans_running_shape CHECK (
    job_state <> 'RUNNING' OR current_attempt_id IS NOT NULL
  ),
  CONSTRAINT guest_scans_accepted_shape CHECK (
    (
      job_state = 'SUCCEEDED'
      AND accepted_attempt_id = current_attempt_id
      AND accepted_fence = current_fence
      AND accepted_payload_digest IS NOT NULL
    )
    OR (
      job_state <> 'SUCCEEDED'
      AND accepted_attempt_id IS NULL
      AND accepted_fence IS NULL
      AND accepted_payload_digest IS NULL
    )
  ),
  CONSTRAINT guest_scans_idempotency_unique UNIQUE (
    guest_session_scope,
    endpoint_operation,
    idempotency_key
  ),
  CONSTRAINT guest_scans_current_identity_unique UNIQUE (
    id,
    current_attempt_id,
    current_fence
  ),
  CONSTRAINT guest_scans_accepted_identity_unique UNIQUE (
    id,
    accepted_attempt_id,
    accepted_fence,
    accepted_payload_digest
  )
);

CREATE TABLE guest_scan_attempts (
  id varchar(128) PRIMARY KEY CHECK (
    id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
  ),
  guest_scan_id varchar(128) NOT NULL REFERENCES guest_scans(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL CHECK (attempt_no > 0),
  monotonic_fence bigint NOT NULL CHECK (
    monotonic_fence BETWEEN 1 AND 9007199254740991
  ),
  lease_version bigint NOT NULL CHECK (
    lease_version BETWEEN 0 AND 9007199254740991
  ),
  lease_expires_at timestamptz,
  hard_deadline timestamptz NOT NULL,
  attempt_state text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT guest_attempts_state CHECK (
    attempt_state IN (
      'CREATED', 'LEASED', 'RUNNING', 'SUCCEEDED', 'FAILED',
      'TIMED_OUT', 'CANCELLED', 'SUPERSEDED'
    )
  ),
  CONSTRAINT guest_attempts_time_contract CHECK (
    date_trunc('second', created_at) = created_at
    AND date_trunc('second', updated_at) = updated_at
    AND date_trunc('second', hard_deadline) = hard_deadline
    AND (lease_expires_at IS NULL OR date_trunc('second', lease_expires_at) = lease_expires_at)
    AND (started_at IS NULL OR date_trunc('second', started_at) = started_at)
    AND (finished_at IS NULL OR date_trunc('second', finished_at) = finished_at)
    AND hard_deadline > created_at
    AND updated_at >= created_at
    AND (
      lease_expires_at IS NULL
      OR lease_expires_at > created_at AND lease_expires_at <= hard_deadline
    )
    AND (started_at IS NULL OR started_at BETWEEN created_at AND updated_at)
    AND (
      finished_at IS NULL
      OR finished_at BETWEEN coalesce(started_at, created_at) AND updated_at
    )
  ),
  CONSTRAINT guest_attempts_lease_shape CHECK (
    (
      attempt_state = 'CREATED'
      AND lease_version = 0
      AND lease_expires_at IS NULL
    )
    OR (
      attempt_state IN ('LEASED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'SUPERSEDED')
      AND lease_version > 0
      AND lease_expires_at IS NOT NULL
    )
    OR attempt_state = 'CANCELLED'
  ),
  CONSTRAINT guest_attempts_started_shape CHECK (
    (attempt_state IN ('CREATED', 'LEASED') AND started_at IS NULL)
    OR attempt_state IN ('CANCELLED', 'SUPERSEDED')
    OR (attempt_state IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT') AND started_at IS NOT NULL)
  ),
  CONSTRAINT guest_attempts_terminal_shape CHECK (
    (
      attempt_state IN ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'SUPERSEDED')
    ) = (finished_at IS NOT NULL)
  ),
  CONSTRAINT guest_attempts_success_before_expiry CHECK (
    attempt_state <> 'SUCCEEDED'
    OR (finished_at < lease_expires_at AND finished_at < hard_deadline)
  ),
  CONSTRAINT guest_attempt_number_unique UNIQUE (guest_scan_id, attempt_no),
  CONSTRAINT guest_attempt_fence_unique UNIQUE (guest_scan_id, monotonic_fence),
  CONSTRAINT guest_attempt_identity_unique UNIQUE (guest_scan_id, id, monotonic_fence)
);

ALTER TABLE guest_scans
  ADD CONSTRAINT guest_scans_current_attempt_fk
  FOREIGN KEY (id, current_attempt_id, current_fence)
  REFERENCES guest_scan_attempts(guest_scan_id, id, monotonic_fence)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE guest_results (
  guest_scan_id varchar(128) PRIMARY KEY REFERENCES guest_scans(id) ON DELETE CASCADE,
  accepted_attempt_id varchar(128) NOT NULL,
  accepted_fence bigint NOT NULL,
  payload_digest bytea NOT NULL CHECK (octet_length(payload_digest) = 32),
  completed_at timestamptz NOT NULL,
  projection jsonb NOT NULL,
  CONSTRAINT guest_results_projection_shape CHECK (
    jsonb_typeof(projection) = 'object'
    AND projection ->> 'schema_version' = '1'
    AND octet_length(projection::text) <= 262144
  ),
  CONSTRAINT guest_results_completed_whole_second CHECK (
    date_trunc('second', completed_at) = completed_at
  ),
  CONSTRAINT guest_results_attempt_fk
    FOREIGN KEY (guest_scan_id, accepted_attempt_id, accepted_fence)
    REFERENCES guest_scan_attempts(guest_scan_id, id, monotonic_fence)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT guest_results_accepted_identity_unique UNIQUE (
    guest_scan_id,
    accepted_attempt_id,
    accepted_fence,
    payload_digest
  )
);

ALTER TABLE guest_scans
  ADD CONSTRAINT guest_scans_accepted_result_fk
  FOREIGN KEY (id, accepted_attempt_id, accepted_fence, accepted_payload_digest)
  REFERENCES guest_results(
    guest_scan_id,
    accepted_attempt_id,
    accepted_fence,
    payload_digest
  )
  DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION guard_guest_scan_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.job_state <> 'QUEUED' OR NEW.updated_at <> NEW.created_at
      OR NEW.current_attempt_id IS NOT NULL OR NEW.current_fence <> 0
      OR NEW.accepted_attempt_id IS NOT NULL OR NEW.accepted_fence IS NOT NULL
      OR NEW.accepted_payload_digest IS NOT NULL
      OR NEW.result_access_revoked_at IS NOT NULL
    THEN RAISE EXCEPTION 'GuestScan must start queued'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.canonical_target, NEW.guest_session_scope,
      NEW.endpoint_operation, NEW.idempotency_key, NEW.request_hash,
      NEW.created_at, NEW.idempotency_expires_at, NEW.deletion_deadline,
      NEW.policy_id, NEW.policy_version, NEW.profile,
      NEW.result_token_version, NEW.result_token_nonce,
      NEW.result_token_key_version, NEW.result_access_expires_at)
    IS DISTINCT FROM
     (OLD.id, OLD.canonical_target, OLD.guest_session_scope,
      OLD.endpoint_operation, OLD.idempotency_key, OLD.request_hash,
      OLD.created_at, OLD.idempotency_expires_at, OLD.deletion_deadline,
      OLD.policy_id, OLD.policy_version, OLD.profile,
      OLD.result_token_version, OLD.result_token_nonce,
      OLD.result_token_key_version, OLD.result_access_expires_at)
  THEN RAISE EXCEPTION 'immutable GuestScan identity changed'; END IF;
  IF NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'GuestScan updated_at regressed';
  END IF;
  IF OLD.result_access_revoked_at IS NOT NULL
     AND NEW.result_access_revoked_at IS DISTINCT FROM OLD.result_access_revoked_at
  THEN RAISE EXCEPTION 'Guest result revocation changed'; END IF;
  IF OLD.current_attempt_id IS NOT NULL AND (
    NEW.current_attempt_id IS NULL
    OR NEW.current_fence < OLD.current_fence
    OR (NEW.current_attempt_id = OLD.current_attempt_id AND NEW.current_fence <> OLD.current_fence)
    OR (NEW.current_attempt_id <> OLD.current_attempt_id AND NEW.current_fence <= OLD.current_fence)
  ) THEN RAISE EXCEPTION 'Guest attempt fence regressed'; END IF;
  IF OLD.accepted_attempt_id IS NOT NULL AND
     (NEW.accepted_attempt_id, NEW.accepted_fence, NEW.accepted_payload_digest)
       IS DISTINCT FROM
     (OLD.accepted_attempt_id, OLD.accepted_fence, OLD.accepted_payload_digest)
  THEN RAISE EXCEPTION 'accepted Guest result changed'; END IF;
  IF NOT (
    NEW.job_state = OLD.job_state
    OR (OLD.job_state = 'QUEUED' AND NEW.job_state IN ('RUNNING', 'CANCELLED', 'EXPIRED'))
    OR (OLD.job_state = 'RUNNING' AND NEW.job_state IN ('SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'))
  ) THEN RAISE EXCEPTION 'invalid GuestScan transition'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guest_scans_update_guard
BEFORE INSERT OR UPDATE ON guest_scans
FOR EACH ROW EXECUTE FUNCTION guard_guest_scan_update();

CREATE FUNCTION guard_guest_attempt_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.attempt_state <> 'CREATED' OR NEW.lease_version <> 0
      OR NEW.lease_expires_at IS NOT NULL OR NEW.started_at IS NOT NULL
      OR NEW.finished_at IS NOT NULL OR NEW.updated_at <> NEW.created_at
    THEN RAISE EXCEPTION 'GuestScanAttempt must start created'; END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.guest_scan_id, NEW.attempt_no, NEW.monotonic_fence,
      NEW.created_at, NEW.hard_deadline)
    IS DISTINCT FROM
     (OLD.id, OLD.guest_scan_id, OLD.attempt_no, OLD.monotonic_fence,
      OLD.created_at, OLD.hard_deadline)
  THEN RAISE EXCEPTION 'immutable GuestScanAttempt identity changed'; END IF;
  IF NEW.updated_at < OLD.updated_at OR NEW.lease_version < OLD.lease_version THEN
    RAISE EXCEPTION 'GuestScanAttempt version regressed';
  END IF;
  IF NEW.lease_expires_at IS DISTINCT FROM OLD.lease_expires_at
     AND NEW.lease_version <= OLD.lease_version
  THEN RAISE EXCEPTION 'GuestScanAttempt lease changed without CAS version'; END IF;
  IF OLD.started_at IS NOT NULL AND NEW.started_at IS DISTINCT FROM OLD.started_at
  THEN RAISE EXCEPTION 'GuestScanAttempt start changed'; END IF;
  IF OLD.finished_at IS NOT NULL AND NEW.finished_at IS DISTINCT FROM OLD.finished_at
  THEN RAISE EXCEPTION 'GuestScanAttempt finish changed'; END IF;
  IF NOT (
    NEW.attempt_state = OLD.attempt_state
    OR (OLD.attempt_state = 'CREATED' AND NEW.attempt_state IN ('LEASED', 'CANCELLED'))
    OR (OLD.attempt_state = 'LEASED' AND NEW.attempt_state IN ('RUNNING', 'SUPERSEDED'))
    OR (OLD.attempt_state = 'RUNNING' AND NEW.attempt_state IN (
      'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'SUPERSEDED'
    ))
  ) THEN RAISE EXCEPTION 'invalid GuestScanAttempt transition'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guest_attempts_update_guard
BEFORE INSERT OR UPDATE ON guest_scan_attempts
FOR EACH ROW EXECUTE FUNCTION guard_guest_attempt_update();

CREATE FUNCTION guard_guest_result_write() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  scan guest_scans%ROWTYPE;
  attempt guest_scan_attempts%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'GuestResult is immutable'; END IF;
  SELECT * INTO scan FROM guest_scans WHERE id = NEW.guest_scan_id FOR UPDATE;
  SELECT * INTO attempt FROM guest_scan_attempts
    WHERE guest_scan_id = NEW.guest_scan_id
      AND id = NEW.accepted_attempt_id
      AND monotonic_fence = NEW.accepted_fence;
  IF NOT FOUND OR scan.job_state <> 'SUCCEEDED'
    OR (NEW.accepted_attempt_id, NEW.accepted_fence, NEW.payload_digest)
      IS DISTINCT FROM
       (scan.accepted_attempt_id, scan.accepted_fence, scan.accepted_payload_digest)
    OR attempt.attempt_state <> 'SUCCEEDED'
    OR attempt.finished_at IS DISTINCT FROM NEW.completed_at
    OR NEW.completed_at < scan.created_at
    OR NEW.completed_at > scan.updated_at
    OR NEW.completed_at >= scan.deletion_deadline
    OR NEW.projection ->> 'canonical_host' IS DISTINCT FROM scan.canonical_target
  THEN RAISE EXCEPTION 'GuestResult does not match accepted GuestScan'; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guest_results_write_guard
BEFORE INSERT OR UPDATE ON guest_results
FOR EACH ROW EXECUTE FUNCTION guard_guest_result_write();

CREATE INDEX guest_scans_deletion_due_idx ON guest_scans(deletion_deadline);
CREATE INDEX guest_scans_job_state_idx ON guest_scans(job_state, updated_at);
CREATE INDEX guest_attempts_scan_state_idx
  ON guest_scan_attempts(guest_scan_id, attempt_state, monotonic_fence DESC);

REVOKE ALL ON guest_scans, guest_scan_attempts, guest_results FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_guest_scan_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_guest_attempt_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION guard_guest_result_write() FROM PUBLIC;
