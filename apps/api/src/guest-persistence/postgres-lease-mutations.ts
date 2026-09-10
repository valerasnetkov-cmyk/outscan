import type { PoolClient } from "pg";

import { releaseGuestAbuseReservation } from "./postgres-abuse.js";
import {
  GUEST_ATTEMPT_HARD_DEADLINE_SECONDS,
  GUEST_ATTEMPT_LEASE_SECONDS,
  immutableLease,
  integer,
  validAttempt,
  type AcquireGuestLeaseResult,
  type AttemptRow,
  type GuestAttemptLease,
  type ScanRow,
} from "./postgres-lease-support.js";

export const LOAD_ATTEMPT_SQL = `
  SELECT id, attempt_no, monotonic_fence::text, lease_version::text,
    CASE WHEN lease_expires_at IS NULL THEN NULL
      ELSE extract(epoch FROM lease_expires_at)::bigint::text END
      AS lease_expires_at,
    extract(epoch FROM hard_deadline)::bigint::text AS hard_deadline,
    attempt_state
  FROM guest_scan_attempts
  WHERE guest_scan_id = $1 AND id = $2 FOR UPDATE`;

export async function createAttempt(
  client: PoolClient,
  scan: ScanRow,
  attemptId: string,
  attemptNo: number,
  fence: bigint,
  now: bigint,
): Promise<Readonly<GuestAttemptLease>> {
  const accessExpiry = integer(scan.result_access_expires_at) as bigint;
  const hardDeadline =
    now + GUEST_ATTEMPT_HARD_DEADLINE_SECONDS < accessExpiry
      ? now + GUEST_ATTEMPT_HARD_DEADLINE_SECONDS
      : accessExpiry;
  const leaseExpiry =
    now + GUEST_ATTEMPT_LEASE_SECONDS < hardDeadline
      ? now + GUEST_ATTEMPT_LEASE_SECONDS
      : hardDeadline;
  if (leaseExpiry <= now || hardDeadline <= now) throw new Error("NO_TIME");
  await client.query(
    `INSERT INTO guest_scan_attempts (
      id, guest_scan_id, attempt_no, monotonic_fence, lease_version,
      lease_expires_at, hard_deadline, attempt_state, created_at, updated_at
    ) VALUES ($1, $2, $3, $4::bigint, 0, NULL,
      to_timestamp($5::double precision), 'CREATED',
      to_timestamp($6::double precision), to_timestamp($6::double precision))`,
    [
      attemptId,
      scan.id,
      attemptNo,
      fence.toString(),
      hardDeadline.toString(),
      now.toString(),
    ],
  );
  const leased = await client.query(
    `UPDATE guest_scan_attempts SET attempt_state = 'LEASED', lease_version = 1,
      lease_expires_at = to_timestamp($3::double precision)
     WHERE guest_scan_id = $1 AND id = $2 AND attempt_state = 'CREATED'
       AND lease_version = 0`,
    [scan.id, attemptId, leaseExpiry.toString()],
  );
  if (leased.rowCount !== 1) throw new Error("LEASE_CAS");
  const job = await client.query(
    `UPDATE guest_scans SET job_state = 'RUNNING', current_attempt_id = $2,
      current_fence = $3::bigint, updated_at = to_timestamp($4::double precision)
     WHERE id = $1 AND job_state IN ('QUEUED', 'RUNNING')`,
    [scan.id, attemptId, fence.toString(), now.toString()],
  );
  if (job.rowCount !== 1) throw new Error("JOB_CAS");
  return immutableLease(
    scan,
    attemptId,
    attemptNo,
    fence,
    1n,
    leaseExpiry,
    hardDeadline,
  );
}

export async function terminateJob(
  client: PoolClient,
  scan: ScanRow,
  now: bigint,
  terminalState: "FAILED" | "EXPIRED",
): Promise<AcquireGuestLeaseResult> {
  if (scan.job_state === "RUNNING" && scan.current_attempt_id !== null) {
    const attempts = await client.query<AttemptRow>(LOAD_ATTEMPT_SQL, [
      scan.id,
      scan.current_attempt_id,
    ]);
    if (attempts.rowCount !== 1 || !validAttempt(attempts.rows[0])) {
      throw new Error("ATTEMPT_STATE");
    }
    const attempt = attempts.rows[0];
    if (["LEASED", "RUNNING"].includes(attempt.attempt_state)) {
      const deadline = integer(attempt.hard_deadline) as bigint;
      const nextState =
        attempt.attempt_state === "LEASED"
          ? "SUPERSEDED"
          : now >= deadline
            ? "TIMED_OUT"
            : "CANCELLED";
      const terminalized = await client.query(
        `UPDATE guest_scan_attempts SET attempt_state = $3,
          finished_at = to_timestamp($4::double precision),
          updated_at = to_timestamp($4::double precision)
         WHERE guest_scan_id = $1 AND id = $2
           AND attempt_state IN ('LEASED', 'RUNNING')`,
        [scan.id, attempt.id, nextState, now.toString()],
      );
      if (terminalized.rowCount !== 1) throw new Error("ATTEMPT_CAS");
    } else if (
      !["FAILED", "TIMED_OUT", "CANCELLED", "SUPERSEDED"].includes(
        attempt.attempt_state,
      )
    ) {
      throw new Error("ATTEMPT_STATE");
    }
  }
  const updated = await client.query(
    `UPDATE guest_scans SET job_state = $2,
      updated_at = to_timestamp($3::double precision)
     WHERE id = $1 AND job_state IN ('QUEUED', 'RUNNING')`,
    [scan.id, terminalState, now.toString()],
  );
  if (updated.rowCount !== 1) throw new Error("JOB_TERMINAL_CAS");
  if (
    !(await releaseGuestAbuseReservation(client, scan.id, now, terminalState))
  ) {
    throw new Error("ABUSE_RELEASE");
  }
  return { ok: true, action: "JOB_TERMINATED", terminal_state: terminalState };
}
