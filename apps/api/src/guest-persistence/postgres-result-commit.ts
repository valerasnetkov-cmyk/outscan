import type { PoolClient } from "pg";

import {
  produceCanonicalGuestScannerResult,
  type SanitizedGuestProjection,
} from "../scanner-output/index.js";
import {
  RESULT_ENVELOPE_MAX_PAYLOAD_BYTES,
  verifyAuthenticatedResultEnvelope,
} from "../result-envelope/index.js";
import {
  decideResultCommit,
  type AttemptState,
  type JobState,
  type ResultCommitSnapshot,
  type ResultSubmissionIdentity,
} from "../scan-protocol/index.js";
import type {
  CommitGuestResultResult,
  GuestResultCommitDependencies,
  GuestResultCommitter,
} from "./model.js";
import { releaseGuestAbuseReservation } from "./postgres-abuse.js";

const MAX_TRANSACTION_ATTEMPTS = 3;
const PRINCIPAL = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

const LOCK_CURRENT_RESULT_STATE_SQL = `
  SELECT s.job_state, s.current_attempt_id,
    s.current_fence::text AS current_fence,
    s.accepted_attempt_id, s.accepted_fence::text AS accepted_fence,
    encode(s.accepted_payload_digest, 'hex') AS accepted_payload_digest_hex,
    s.canonical_target, a.attempt_state,
    floor(extract(epoch FROM a.lease_expires_at))::bigint::text
      AS lease_expires_at_unix_seconds,
    floor(extract(epoch FROM a.hard_deadline))::bigint::text
      AS hard_deadline_unix_seconds,
    floor(extract(epoch FROM transaction_timestamp()))::bigint::text
      AS transaction_now_unix_seconds
  FROM guest_scans s
  INNER JOIN guest_scan_attempts a
    ON a.guest_scan_id = s.id
    AND a.id = s.current_attempt_id
    AND a.monotonic_fence = s.current_fence
  WHERE s.id = $1
  FOR UPDATE OF s, a`;

const SUCCEED_ATTEMPT_SQL = `
  UPDATE guest_scan_attempts
  SET attempt_state = 'SUCCEEDED',
    finished_at = to_timestamp($4::double precision),
    updated_at = to_timestamp($4::double precision)
  WHERE guest_scan_id = $1 AND id = $2 AND monotonic_fence = $3::bigint
    AND attempt_state = 'RUNNING'
    AND lease_expires_at > to_timestamp($4::double precision)
    AND hard_deadline > to_timestamp($4::double precision)`;

const SUCCEED_SCAN_SQL = `
  UPDATE guest_scans
  SET job_state = 'SUCCEEDED', accepted_attempt_id = $2,
    accepted_fence = $3::bigint, accepted_payload_digest = $4,
    updated_at = to_timestamp($5::double precision)
  WHERE id = $1 AND job_state = 'RUNNING'
    AND current_attempt_id = $2 AND current_fence = $3::bigint
    AND accepted_attempt_id IS NULL AND accepted_fence IS NULL
    AND accepted_payload_digest IS NULL`;

const INSERT_RESULT_SQL = `
  INSERT INTO guest_results (
    guest_scan_id, accepted_attempt_id, accepted_fence, payload_digest,
    completed_at, projection
  ) VALUES (
    $1, $2, $3::bigint, $4, to_timestamp($5::double precision), $6::jsonb
  )`;

interface LockedResultState {
  snapshot: ResultCommitSnapshot;
  canonical_target: string;
  now: number;
}

function failure(
  code: Extract<CommitGuestResultResult, { ok: false }>["code"],
  emitSecurityAudit: boolean,
): CommitGuestResultResult {
  return { ok: false, code, emit_security_audit: emitSecurityAudit };
}

function safePositiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function nullableDigest(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value))
    return undefined;
  return `sha256:${value}`;
}

function mapLockedState(
  row: Record<string, unknown>,
): LockedResultState | null {
  const currentFence = safePositiveInteger(row.current_fence);
  const leaseExpiresAt = safePositiveInteger(row.lease_expires_at_unix_seconds);
  const deadline = safePositiveInteger(row.hard_deadline_unix_seconds);
  const now = safePositiveInteger(row.transaction_now_unix_seconds);
  const acceptedFence =
    row.accepted_fence === null
      ? null
      : safePositiveInteger(row.accepted_fence);
  const acceptedDigest = nullableDigest(row.accepted_payload_digest_hex);
  const acceptedAttempt = row.accepted_attempt_id;
  if (
    typeof row.job_state !== "string" ||
    typeof row.attempt_state !== "string" ||
    typeof row.current_attempt_id !== "string" ||
    typeof row.canonical_target !== "string" ||
    currentFence === null ||
    leaseExpiresAt === null ||
    deadline === null ||
    now === null ||
    acceptedDigest === undefined ||
    !(
      (acceptedAttempt === null &&
        acceptedFence === null &&
        acceptedDigest === null) ||
      (typeof acceptedAttempt === "string" &&
        acceptedFence !== null &&
        acceptedDigest !== null)
    )
  ) {
    return null;
  }
  return {
    snapshot: {
      job_state: row.job_state as JobState,
      current_attempt_id: row.current_attempt_id,
      current_fence: currentFence,
      attempt_state: row.attempt_state as AttemptState,
      lease_expires_at_unix_seconds: leaseExpiresAt,
      hard_deadline_unix_seconds: deadline,
      accepted_result:
        acceptedAttempt === null
          ? null
          : {
              attempt_id: acceptedAttempt,
              fence: acceptedFence as number,
              payload_digest: acceptedDigest as string,
            },
    },
    canonical_target: row.canonical_target,
    now,
  };
}

function validDependencies(
  value: GuestResultCommitDependencies,
): Readonly<GuestResultCommitDependencies> | null {
  try {
    if (
      !value ||
      typeof value.pool?.connect !== "function" ||
      typeof value.result_keyring?.get !== "function" ||
      typeof value.expected_workload_identity !== "string" ||
      !PRINCIPAL.test(value.expected_workload_identity) ||
      typeof value.expected_audience !== "string" ||
      !PRINCIPAL.test(value.expected_audience) ||
      !Number.isSafeInteger(value.max_payload_bytes) ||
      value.max_payload_bytes <= 0 ||
      value.max_payload_bytes > RESULT_ENVELOPE_MAX_PAYLOAD_BYTES ||
      typeof value.now_unix_seconds !== "function"
    ) {
      return null;
    }
    return Object.freeze({ ...value });
  } catch {
    return null;
  }
}

function retryable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = Reflect.get(error, "code");
  const constraint = Reflect.get(error, "constraint");
  return (
    code === "40001" ||
    code === "40P01" ||
    (code === "23505" && constraint === "guest_results_pkey")
  );
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the stable failure from the original operation.
  }
}

async function persistResult(
  dependencies: Readonly<GuestResultCommitDependencies>,
  jobId: string,
  submission: ResultSubmissionIdentity,
  projection: Readonly<SanitizedGuestProjection>,
): Promise<CommitGuestResultResult> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    let client: PoolClient;
    try {
      client = await dependencies.pool.connect();
    } catch {
      return failure("GUEST_PERSISTENCE_UNAVAILABLE", false);
    }
    try {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const locked = await client.query<Record<string, unknown>>(
        LOCK_CURRENT_RESULT_STATE_SQL,
        [jobId],
      );
      const state =
        locked.rowCount === 1 ? mapLockedState(locked.rows[0] ?? {}) : null;
      if (!state) {
        await client.query("COMMIT");
        return failure("INVALID_STATE", true);
      }
      const decision = decideResultCommit(
        state.snapshot,
        submission,
        state.now,
      );
      if (!decision.allowed) {
        await client.query("COMMIT");
        return failure(decision.code, decision.emit_security_audit);
      }
      if (decision.action === "ALREADY_COMMITTED") {
        await client.query("COMMIT");
        return {
          ok: true,
          action: "ALREADY_COMMITTED",
          stored_new_result: false,
        };
      }
      if (projection.canonical_host !== state.canonical_target) {
        await client.query("ROLLBACK");
        return failure("RESULT_SUBMISSION_REJECTED", true);
      }
      const digest = Buffer.from(
        submission.payload_digest.slice("sha256:".length),
        "hex",
      );
      const attemptUpdate = await client.query(SUCCEED_ATTEMPT_SQL, [
        jobId,
        submission.attempt_id,
        submission.fence,
        state.now,
      ]);
      if (attemptUpdate.rowCount !== 1) throw new Error("RESULT_COMMIT_CAS");
      const scanUpdate = await client.query(SUCCEED_SCAN_SQL, [
        jobId,
        submission.attempt_id,
        submission.fence,
        digest,
        state.now,
      ]);
      if (scanUpdate.rowCount !== 1) throw new Error("RESULT_COMMIT_CAS");
      await client.query(INSERT_RESULT_SQL, [
        jobId,
        submission.attempt_id,
        submission.fence,
        digest,
        state.now,
        JSON.stringify(projection),
      ]);
      const released = await releaseGuestAbuseReservation(
        client,
        jobId,
        BigInt(state.now),
        "TERMINAL_RESULT",
      );
      if (!released) throw new Error("GUEST_ABUSE_RELEASE_INCONSISTENT");
      await client.query("COMMIT");
      return {
        ok: true,
        action: "PRIMARY_COMMIT",
        stored_new_result: true,
      };
    } catch (error) {
      await rollback(client);
      if (attempt < MAX_TRANSACTION_ATTEMPTS && retryable(error)) continue;
      return failure("GUEST_PERSISTENCE_UNAVAILABLE", false);
    } finally {
      client.release();
    }
  }
  return failure("GUEST_PERSISTENCE_UNAVAILABLE", false);
}

export function createPostgresGuestResultCommitter(
  dependenciesValue: GuestResultCommitDependencies,
): GuestResultCommitter {
  const dependencies = validDependencies(dependenciesValue);
  if (!dependencies) throw new Error("INVALID_GUEST_PERSISTENCE_CONFIGURATION");
  return Object.freeze({
    async commit(value: unknown): Promise<CommitGuestResultResult> {
      let verificationNow: number;
      try {
        verificationNow = dependencies.now_unix_seconds();
      } catch {
        return failure("RESULT_SUBMISSION_REJECTED", true);
      }
      const verified = verifyAuthenticatedResultEnvelope(value, {
        now_unix_seconds: verificationNow,
        expected_workload_identity: dependencies.expected_workload_identity,
        expected_audience: dependencies.expected_audience,
        max_payload_bytes: dependencies.max_payload_bytes,
        keyring: dependencies.result_keyring,
      });
      if (!verified.ok) return failure("RESULT_SUBMISSION_REJECTED", true);
      const canonical = produceCanonicalGuestScannerResult(
        verified.verified.read_payload(),
        dependencies.max_payload_bytes,
      );
      if (
        !canonical.ok ||
        canonical.result.payload_digest !==
          verified.verified.header.payload_digest ||
        canonical.result.payload_size !== verified.verified.header.payload_size
      ) {
        return failure("RESULT_SUBMISSION_REJECTED", true);
      }
      return persistResult(
        dependencies,
        verified.verified.header.job_id,
        verified.verified.submission_identity,
        canonical.result.projection,
      );
    },
  });
}
