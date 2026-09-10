ALTER TABLE guest_abuse_reservations
  DROP CONSTRAINT guest_abuse_reservations_release_reason_check;

ALTER TABLE guest_abuse_reservations
  ADD CONSTRAINT guest_abuse_reservations_release_reason_check CHECK (
    release_reason IN (
      'TERMINAL_RESULT', 'EXPIRED_REPLACEMENT',
      'CANCELLED', 'FAILED', 'EXPIRED', 'DELETION'
    )
  );
