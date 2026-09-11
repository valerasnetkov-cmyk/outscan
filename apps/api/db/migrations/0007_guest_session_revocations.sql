CREATE TABLE guest_session_revocations (
  guest_session_scope bytea PRIMARY KEY CHECK (
    octet_length(guest_session_scope) = 32
  ),
  revoked_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CONSTRAINT guest_session_revocation_time_contract CHECK (
    date_trunc('second', revoked_at) = revoked_at
    AND date_trunc('second', expires_at) = expires_at
    AND expires_at = revoked_at + interval '24 hours'
  )
);

CREATE INDEX guest_session_revocations_expiry_idx
  ON guest_session_revocations(expires_at);

REVOKE ALL ON guest_session_revocations FROM PUBLIC;
