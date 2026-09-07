ALTER TABLE guest_scans
  ADD CONSTRAINT guest_scans_abuse_identity_unique UNIQUE (
    id, guest_session_scope, created_at, deletion_deadline
  );

CREATE TABLE guest_abuse_control (
  singleton smallint PRIMARY KEY CHECK (singleton = 1),
  policy_id text NOT NULL CHECK (policy_id = 'outscan-guest-abuse-v1'),
  service_state text NOT NULL CHECK (service_state IN ('OPEN', 'PAUSED')),
  updated_at timestamptz NOT NULL CHECK (
    date_trunc('second', updated_at) = updated_at
  )
);

INSERT INTO guest_abuse_control(singleton, policy_id, service_state, updated_at)
VALUES (1, 'outscan-guest-abuse-v1', 'OPEN', date_trunc('second', transaction_timestamp()));

CREATE TABLE guest_abuse_window_counters (
  scope_kind text NOT NULL CHECK (scope_kind IN ('SESSION', 'NETWORK')),
  scope_digest bytea NOT NULL CHECK (octet_length(scope_digest) = 32),
  dimension text NOT NULL CHECK (
    dimension IN (
      'SESSION_BURST', 'SESSION_DAILY',
      'NETWORK_BURST', 'NETWORK_DAILY'
    )
  ),
  usage_count integer NOT NULL CHECK (usage_count BETWEEN 0 AND 1000000),
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope_kind, scope_digest, dimension),
  CONSTRAINT guest_abuse_window_scope_shape CHECK (
    (scope_kind = 'SESSION' AND dimension LIKE 'SESSION_%')
    OR (scope_kind = 'NETWORK' AND dimension LIKE 'NETWORK_%')
  ),
  CONSTRAINT guest_abuse_window_time CHECK (
    date_trunc('second', reset_at) = reset_at
    AND date_trunc('second', updated_at) = updated_at
    AND reset_at > updated_at
    AND (
      (dimension LIKE '%_BURST' AND reset_at <= updated_at + interval '10 minutes')
      OR (dimension LIKE '%_DAILY' AND reset_at <= updated_at + interval '24 hours')
    )
  )
);

CREATE TABLE guest_abuse_active_counters (
  scope_kind text NOT NULL CHECK (scope_kind IN ('SESSION', 'NETWORK')),
  scope_digest bytea NOT NULL CHECK (octet_length(scope_digest) = 32),
  dimension text NOT NULL CHECK (
    dimension IN ('SESSION_ACTIVE', 'NETWORK_ACTIVE')
  ),
  active_count integer NOT NULL CHECK (active_count BETWEEN 0 AND 1000000),
  updated_at timestamptz NOT NULL CHECK (
    date_trunc('second', updated_at) = updated_at
  ),
  PRIMARY KEY (scope_kind, scope_digest, dimension),
  CONSTRAINT guest_abuse_active_scope_shape CHECK (
    (scope_kind = 'SESSION' AND dimension = 'SESSION_ACTIVE')
    OR (scope_kind = 'NETWORK' AND dimension = 'NETWORK_ACTIVE')
  )
);

CREATE TABLE guest_abuse_reservations (
  guest_scan_id varchar(128) PRIMARY KEY,
  guest_session_scope bytea NOT NULL CHECK (
    octet_length(guest_session_scope) = 32
  ),
  network_signal_digest bytea NOT NULL CHECK (
    octet_length(network_signal_digest) = 32
  ),
  policy_id text NOT NULL CHECK (policy_id = 'outscan-guest-abuse-v1'),
  reserved_at timestamptz NOT NULL,
  deletion_deadline timestamptz NOT NULL,
  released_at timestamptz,
  release_reason text CHECK (
    release_reason IN (
      'TERMINAL_RESULT', 'EXPIRED_REPLACEMENT',
      'CANCELLED', 'FAILED', 'DELETION'
    )
  ),
  CONSTRAINT guest_abuse_reservation_scan_fk
    FOREIGN KEY (
      guest_scan_id, guest_session_scope, reserved_at, deletion_deadline
    ) REFERENCES guest_scans(
      id, guest_session_scope, created_at, deletion_deadline
    ) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT guest_abuse_reservation_time CHECK (
    date_trunc('second', reserved_at) = reserved_at
    AND date_trunc('second', deletion_deadline) = deletion_deadline
    AND deletion_deadline = reserved_at + interval '24 hours'
    AND (
      released_at IS NULL
      OR (
        date_trunc('second', released_at) = released_at
        AND released_at BETWEEN reserved_at AND deletion_deadline
      )
    )
  ),
  CONSTRAINT guest_abuse_reservation_release_pair CHECK (
    (released_at IS NULL AND release_reason IS NULL)
    OR (released_at IS NOT NULL AND release_reason IS NOT NULL)
  )
);

CREATE INDEX guest_abuse_window_reset_idx
  ON guest_abuse_window_counters(reset_at);
CREATE INDEX guest_abuse_reservation_session_active_idx
  ON guest_abuse_reservations(guest_session_scope)
  WHERE released_at IS NULL;
CREATE INDEX guest_abuse_reservation_network_active_idx
  ON guest_abuse_reservations(network_signal_digest)
  WHERE released_at IS NULL;

REVOKE ALL ON guest_abuse_control, guest_abuse_window_counters,
  guest_abuse_active_counters, guest_abuse_reservations FROM PUBLIC;
