import {
  createAttempt,
  LOAD_ATTEMPT_SQL,
  terminateJob,
} from "./postgres-lease-mutations.js";
import {
  acquireRequest,
  GUEST_ATTEMPT_LEASE_SECONDS,
  GUEST_MAX_ATTEMPTS,
  integer,
  leaseCommand,
  nowValue,
  snapshotDependencies,
  transaction,
  validAttempt,
  validId,
  validScan,
  type AcquireGuestLeaseResult,
  type AttemptRow,
  type GuestLeaseDependencies,
  type GuestLeasePersistence,
  type RenewGuestLeaseResult,
  type ScanRow,
  type StartGuestAttemptResult,
} from "./postgres-lease-support.js";

const LOAD_SCAN_SQL = `
  SELECT id, canonical_target, job_state, current_attempt_id,
    current_fence::text,
    extract(epoch FROM result_access_expires_at)::bigint::text
      AS result_access_expires_at,
    extract(epoch FROM deletion_deadline)::bigint::text AS deletion_deadline
  FROM guest_scans WHERE id = $1 FOR UPDATE`;

export function createPostgresGuestLeasePersistence(
  dependenciesValue: GuestLeaseDependencies,
): GuestLeasePersistence {
  const dependencies = snapshotDependencies(dependenciesValue);
  if (!dependencies) throw new Error("INVALID_GUEST_LEASE_CONFIGURATION");

  return Object.freeze({
    async acquire(value: unknown): Promise<AcquireGuestLeaseResult> {
      const guestScanId = acquireRequest(value);
      if (!guestScanId) return { ok: false, code: "INVALID_REQUEST" };
      const now = (() => {
        try {
          return nowValue(dependencies.now_unix_seconds());
        } catch {
          return null;
        }
      })();
      if (now === null)
        return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
      const result = await transaction(dependencies.pool, async (client) => {
        const scans = await client.query<ScanRow>(LOAD_SCAN_SQL, [guestScanId]);
        if (scans.rowCount !== 1 || !validScan(scans.rows[0])) {
          return { ok: false, code: "NOT_ACQUIRABLE" } as const;
        }
        const scan = scans.rows[0];
        if (!["QUEUED", "RUNNING"].includes(scan.job_state)) {
          return { ok: false, code: "NOT_ACQUIRABLE" } as const;
        }
        const accessExpiry = integer(scan.result_access_expires_at) as bigint;
        if (now >= accessExpiry)
          return terminateJob(client, scan, now, "EXPIRED");
        let attemptNo = 1;
        let fence = 1n;
        if (scan.job_state === "RUNNING") {
          const attempts = await client.query<AttemptRow>(LOAD_ATTEMPT_SQL, [
            scan.id,
            scan.current_attempt_id,
          ]);
          if (attempts.rowCount !== 1 || !validAttempt(attempts.rows[0])) {
            throw new Error("ATTEMPT_STATE");
          }
          const attempt = attempts.rows[0];
          if (
            !["LEASED", "RUNNING"].includes(attempt.attempt_state) ||
            attempt.lease_expires_at === null ||
            integer(attempt.monotonic_fence) !== integer(scan.current_fence)
          ) {
            throw new Error("ATTEMPT_STATE");
          }
          const leaseExpiry = integer(attempt.lease_expires_at) as bigint;
          const hardDeadline = integer(attempt.hard_deadline) as bigint;
          if (now < leaseExpiry && now < hardDeadline) {
            return {
              ok: false,
              code: "LEASE_HELD",
              retry_after_seconds: Number(
                (leaseExpiry < hardDeadline ? leaseExpiry : hardDeadline) - now,
              ),
            } as const;
          }
          const nextState =
            attempt.attempt_state === "RUNNING" && now >= hardDeadline
              ? "TIMED_OUT"
              : "SUPERSEDED";
          const retired = await client.query(
            `UPDATE guest_scan_attempts SET attempt_state = $3,
              finished_at = to_timestamp($4::double precision),
              updated_at = to_timestamp($4::double precision)
             WHERE guest_scan_id = $1 AND id = $2
               AND attempt_state IN ('LEASED', 'RUNNING')`,
            [scan.id, attempt.id, nextState, now.toString()],
          );
          if (retired.rowCount !== 1) throw new Error("ATTEMPT_CAS");
          if (attempt.attempt_no >= GUEST_MAX_ATTEMPTS) {
            return terminateJob(client, scan, now, "FAILED");
          }
          attemptNo = attempt.attempt_no + 1;
          fence = (integer(attempt.monotonic_fence) as bigint) + 1n;
        }
        let attemptId: string;
        try {
          attemptId = dependencies.create_attempt_id();
        } catch {
          throw new Error("ATTEMPT_ID");
        }
        if (!validId(attemptId)) throw new Error("ATTEMPT_ID");
        const lease = await createAttempt(
          client,
          scan,
          attemptId,
          attemptNo,
          fence,
          now,
        );
        return { ok: true, action: "LEASE_ACQUIRED", lease } as const;
      });
      return result ?? { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
    },

    async start(value: unknown): Promise<StartGuestAttemptResult> {
      const command = leaseCommand(value);
      if (!command) return { ok: false, code: "INVALID_REQUEST" };
      const now = (() => {
        try {
          return nowValue(dependencies.now_unix_seconds());
        } catch {
          return null;
        }
      })();
      if (now === null)
        return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
      const result = await transaction(dependencies.pool, async (client) => {
        const attempts = await client.query<
          AttemptRow & {
            job_state: string;
            current_attempt_id: string | null;
            current_fence: string;
          }
        >(
          `SELECT a.id, a.attempt_no, a.monotonic_fence::text,
            a.lease_version::text,
            extract(epoch FROM a.lease_expires_at)::bigint::text AS lease_expires_at,
            extract(epoch FROM a.hard_deadline)::bigint::text AS hard_deadline,
            a.attempt_state, s.job_state, s.current_attempt_id, s.current_fence::text
           FROM guest_scan_attempts a JOIN guest_scans s ON s.id = a.guest_scan_id
           WHERE a.guest_scan_id = $1 AND a.id = $2 FOR UPDATE OF s, a`,
          [command.guest_scan_id, command.attempt_id],
        );
        const attempt = attempts.rows[0];
        if (attempts.rowCount !== 1 || !validAttempt(attempt))
          return { ok: false, code: "STALE_LEASE" } as const;
        if (
          attempt.job_state !== "RUNNING" ||
          attempt.current_attempt_id !== command.attempt_id ||
          integer(attempt.current_fence) !== BigInt(command.monotonic_fence) ||
          integer(attempt.monotonic_fence) !==
            BigInt(command.monotonic_fence) ||
          integer(attempt.lease_version) !== BigInt(command.lease_version)
        )
          return { ok: false, code: "STALE_LEASE" } as const;
        if (attempt.lease_expires_at === null)
          return { ok: false, code: "STALE_LEASE" } as const;
        const leaseExpiry = integer(attempt.lease_expires_at) as bigint;
        const deadline = integer(attempt.hard_deadline) as bigint;
        if (now >= deadline)
          return { ok: false, code: "ATTEMPT_DEADLINE_EXCEEDED" } as const;
        if (now >= leaseExpiry)
          return { ok: false, code: "LEASE_EXPIRED" } as const;
        if (attempt.attempt_state === "RUNNING")
          return { ok: true, action: "ALREADY_RUNNING" } as const;
        if (attempt.attempt_state !== "LEASED")
          return { ok: false, code: "STALE_LEASE" } as const;
        const started = await client.query(
          `UPDATE guest_scan_attempts SET attempt_state = 'RUNNING',
            started_at = to_timestamp($5::double precision),
            updated_at = to_timestamp($5::double precision)
           WHERE guest_scan_id = $1 AND id = $2 AND monotonic_fence = $3::bigint
             AND lease_version = $4::bigint AND attempt_state = 'LEASED'`,
          [
            command.guest_scan_id,
            command.attempt_id,
            command.monotonic_fence,
            command.lease_version,
            now.toString(),
          ],
        );
        if (started.rowCount !== 1) throw new Error("START_CAS");
        return { ok: true, action: "STARTED" } as const;
      });
      return result ?? { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
    },

    async renew(value: unknown): Promise<RenewGuestLeaseResult> {
      const command = leaseCommand(value);
      if (!command) return { ok: false, code: "INVALID_REQUEST" };
      const now = (() => {
        try {
          return nowValue(dependencies.now_unix_seconds());
        } catch {
          return null;
        }
      })();
      if (now === null)
        return { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
      const result = await transaction(dependencies.pool, async (client) => {
        const rows = await client.query<
          AttemptRow & {
            job_state: string;
            current_attempt_id: string | null;
            current_fence: string;
          }
        >(
          `SELECT a.id, a.attempt_no, a.monotonic_fence::text,
            a.lease_version::text,
            extract(epoch FROM a.lease_expires_at)::bigint::text AS lease_expires_at,
            extract(epoch FROM a.hard_deadline)::bigint::text AS hard_deadline,
            a.attempt_state, s.job_state, s.current_attempt_id, s.current_fence::text
           FROM guest_scan_attempts a JOIN guest_scans s ON s.id = a.guest_scan_id
           WHERE a.guest_scan_id = $1 AND a.id = $2 FOR UPDATE OF s, a`,
          [command.guest_scan_id, command.attempt_id],
        );
        const attempt = rows.rows[0];
        if (
          rows.rowCount !== 1 ||
          !validAttempt(attempt) ||
          attempt.attempt_state !== "RUNNING" ||
          attempt.job_state !== "RUNNING"
        )
          return { ok: false, code: "STALE_LEASE" } as const;
        if (
          attempt.current_attempt_id !== command.attempt_id ||
          integer(attempt.current_fence) !== BigInt(command.monotonic_fence) ||
          integer(attempt.monotonic_fence) !==
            BigInt(command.monotonic_fence) ||
          integer(attempt.lease_version) !== BigInt(command.lease_version)
        )
          return { ok: false, code: "STALE_LEASE" } as const;
        if (attempt.lease_expires_at === null)
          return { ok: false, code: "STALE_LEASE" } as const;
        const leaseExpiry = integer(attempt.lease_expires_at) as bigint;
        const deadline = integer(attempt.hard_deadline) as bigint;
        if (now >= deadline)
          return { ok: false, code: "ATTEMPT_DEADLINE_EXCEEDED" } as const;
        if (now >= leaseExpiry)
          return { ok: false, code: "LEASE_EXPIRED" } as const;
        const candidate = now + GUEST_ATTEMPT_LEASE_SECONDS;
        const nextExpiry = candidate < deadline ? candidate : deadline;
        if (nextExpiry <= leaseExpiry)
          return { ok: false, code: "LEASE_NOT_EXTENDED" } as const;
        const nextVersion = BigInt(command.lease_version) + 1n;
        const renewed = await client.query(
          `UPDATE guest_scan_attempts SET lease_version = $5::bigint,
            lease_expires_at = to_timestamp($6::double precision),
            updated_at = to_timestamp($7::double precision)
           WHERE guest_scan_id = $1 AND id = $2 AND monotonic_fence = $3::bigint
             AND lease_version = $4::bigint AND attempt_state = 'RUNNING'`,
          [
            command.guest_scan_id,
            command.attempt_id,
            command.monotonic_fence,
            command.lease_version,
            nextVersion.toString(),
            nextExpiry.toString(),
            now.toString(),
          ],
        );
        if (renewed.rowCount !== 1) throw new Error("RENEW_CAS");
        return {
          ok: true,
          action: "LEASE_RENEWED",
          lease_version: Number(nextVersion),
          lease_expires_at_unix_seconds: Number(nextExpiry),
        } as const;
      });
      return result ?? { ok: false, code: "GUEST_PERSISTENCE_UNAVAILABLE" };
    },
  });
}
