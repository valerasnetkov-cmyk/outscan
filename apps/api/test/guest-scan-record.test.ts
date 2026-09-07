import { describe, expect, it } from "vitest";

import {
  GUEST_RESULT_ACCESS_SECONDS,
  GUEST_RETENTION_SECONDS,
  snapshotGuestScan,
  snapshotGuestScanAttempt,
} from "../src/guest-scan/index.js";

const NOW = 1_800_000_000n;
const DIGEST = `sha256:${"a".repeat(64)}`;
const SCOPE = `GUEST_SESSION:sha256:${"b".repeat(64)}`;

function scan(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    guest_scan_id: "guest_scan_01",
    canonical_target: "example.com",
    principal_scope: SCOPE,
    endpoint_operation: "POST:/v1/public/scans",
    idempotency_key: "request-key-01",
    request_hash: `sha256:${"c".repeat(64)}`,
    created_at_unix_seconds: NOW,
    updated_at_unix_seconds: NOW + 100n,
    idempotency_expires_at_unix_seconds: NOW + GUEST_RESULT_ACCESS_SECONDS,
    deletion_deadline_unix_seconds: NOW + GUEST_RETENTION_SECONDS,
    job_state: "SUCCEEDED",
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile: "GUEST_SAFE",
    result_token_metadata: {
      guest_scan_id: "guest_scan_01",
      token_version: 1n,
      token_nonce: Buffer.alloc(32, 0x22),
      key_version: 7,
      result_access_expires_at_unix_seconds: NOW + GUEST_RESULT_ACCESS_SECONDS,
      result_access_revoked_at_unix_seconds: null,
    },
    current_attempt_id: "guest_attempt_01",
    current_fence: 3,
    accepted_result: {
      attempt_id: "guest_attempt_01",
      fence: 3,
      payload_digest: DIGEST,
    },
    ...overrides,
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    guest_scan_attempt_id: "guest_attempt_01",
    guest_scan_id: "guest_scan_01",
    attempt_no: 1,
    monotonic_fence: 3,
    lease_version: 2,
    lease_expires_at_unix_seconds: NOW + 120n,
    hard_deadline_unix_seconds: NOW + 300n,
    attempt_state: "RUNNING",
    created_at_unix_seconds: NOW,
    updated_at_unix_seconds: NOW + 10n,
    started_at_unix_seconds: NOW + 5n,
    finished_at_unix_seconds: null,
    ...overrides,
  };
}

describe("GuestScan persisted-row snapshot", () => {
  it("accepts and isolates the exact PUBLIC_GUEST aggregate shape", () => {
    const input = scan();
    const result = snapshotGuestScan(input);
    expect(result).toMatchObject({
      guest_scan_id: "guest_scan_01",
      canonical_target: "example.com",
      job_state: "SUCCEEDED",
    });
    expect(result).not.toHaveProperty("organization_id");
    expect(result).not.toBe(input);
    expect(result?.result_token_metadata.token_nonce).not.toBe(
      input.result_token_metadata.token_nonce,
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result?.accepted_result)).toBe(true);
  });

  it.each([
    { organization_id: "org_01" },
    { canonical_target: "https://example.com" },
    { principal_scope: `IP:${"1".repeat(64)}` },
    { idempotency_expires_at_unix_seconds: NOW + 1_799n },
    { deletion_deadline_unix_seconds: NOW + 86_399n },
    { current_attempt_id: null },
    { current_fence: 0 },
    { accepted_result: null },
    { job_state: "RUNNING" },
    {
      accepted_result: {
        attempt_id: "guest_attempt_02",
        fence: 3,
        payload_digest: DIGEST,
      },
    },
    {
      result_token_metadata: {
        ...scan().result_token_metadata,
        guest_scan_id: "guest_scan_02",
      },
    },
    {
      result_token_metadata: {
        ...scan().result_token_metadata,
        result_access_revoked_at_unix_seconds: NOW + 101n,
      },
    },
  ])("rejects cross-contour or inconsistent scan state %#", (change) => {
    expect(snapshotGuestScan(scan(change))).toBeNull();
  });

  it("contains hostile persisted getters", () => {
    const value = scan();
    Object.defineProperty(value, "guest_scan_id", {
      enumerable: true,
      get: () => {
        throw new Error("database detail");
      },
    });
    expect(snapshotGuestScan(value)).toBeNull();
  });
});

describe("GuestScanAttempt persisted-row snapshot", () => {
  it("accepts a current running attempt", () => {
    const result = snapshotGuestScanAttempt(attempt());
    expect(result).toMatchObject({
      guest_scan_id: "guest_scan_01",
      attempt_state: "RUNNING",
      monotonic_fence: 3,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("accepts CREATED and terminal state-specific shapes", () => {
    expect(
      snapshotGuestScanAttempt(
        attempt({
          attempt_state: "CREATED",
          lease_version: 0,
          lease_expires_at_unix_seconds: null,
          started_at_unix_seconds: null,
        }),
      ),
    ).not.toBeNull();
    expect(
      snapshotGuestScanAttempt(
        attempt({
          attempt_state: "SUCCEEDED",
          updated_at_unix_seconds: NOW + 20n,
          finished_at_unix_seconds: NOW + 20n,
        }),
      ),
    ).not.toBeNull();
    expect(
      snapshotGuestScanAttempt(
        attempt({
          attempt_state: "CANCELLED",
          lease_version: 0,
          lease_expires_at_unix_seconds: null,
          started_at_unix_seconds: null,
          finished_at_unix_seconds: NOW + 10n,
        }),
      ),
    ).not.toBeNull();
  });

  it.each([
    { organization_id: "org_01" },
    { attempt_no: 0 },
    { monotonic_fence: 0 },
    { lease_version: 0 },
    { lease_expires_at_unix_seconds: null },
    { lease_expires_at_unix_seconds: NOW + 301n },
    { hard_deadline_unix_seconds: NOW },
    { started_at_unix_seconds: null },
    { attempt_state: "LEASED" },
    { finished_at_unix_seconds: NOW + 10n },
    { attempt_state: "SUCCEEDED" },
    {
      attempt_state: "SUCCEEDED",
      updated_at_unix_seconds: NOW + 120n,
      finished_at_unix_seconds: NOW + 120n,
    },
  ])("rejects invalid attempt state or chronology %#", (change) => {
    expect(snapshotGuestScanAttempt(attempt(change))).toBeNull();
  });
});
