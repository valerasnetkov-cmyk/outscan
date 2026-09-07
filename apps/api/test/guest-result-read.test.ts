import { describe, expect, it, vi } from "vitest";

import {
  deriveGuestResultToken,
  type GuestResultTokenMetadata,
} from "../src/guest-crypto/index.js";
import {
  GUEST_RESULT_ACCESS_SECONDS,
  GUEST_RETENTION_SECONDS,
  readAuthorizedGuestResult,
} from "../src/guest-scan/index.js";

const NOW = 1_800_000_000n;
const KEY = Buffer.alloc(32, 0x44);
const DIGEST = `sha256:${"d".repeat(64)}`;

function tokenMetadata(): GuestResultTokenMetadata {
  return {
    guest_scan_id: "guest_scan_01",
    token_version: 1n,
    token_nonce: Buffer.alloc(32, 0x33),
    key_version: 7,
    result_access_expires_at_unix_seconds: NOW + GUEST_RESULT_ACCESS_SECONDS,
    result_access_revoked_at_unix_seconds: null,
  };
}

function stored() {
  return {
    scan: {
      schema_version: 1,
      guest_scan_id: "guest_scan_01",
      canonical_target: "example.com",
      principal_scope: `GUEST_SESSION:sha256:${"a".repeat(64)}`,
      endpoint_operation: "POST:/v1/public/scans",
      idempotency_key: "request-key-01",
      request_hash: `sha256:${"b".repeat(64)}`,
      created_at_unix_seconds: NOW,
      updated_at_unix_seconds: NOW + 100n,
      idempotency_expires_at_unix_seconds: NOW + GUEST_RESULT_ACCESS_SECONDS,
      deletion_deadline_unix_seconds: NOW + GUEST_RETENTION_SECONDS,
      job_state: "SUCCEEDED",
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile: "GUEST_SAFE",
      result_token_metadata: tokenMetadata(),
      current_attempt_id: "guest_attempt_01",
      current_fence: 5,
      accepted_result: {
        attempt_id: "guest_attempt_01",
        fence: 5,
        payload_digest: DIGEST,
      },
    },
    result: {
      schema_version: 1,
      guest_scan_id: "guest_scan_01",
      accepted_attempt_id: "guest_attempt_01",
      accepted_fence: 5,
      payload_digest: DIGEST,
      completed_at_unix_seconds: NOW + 90n,
      projection: {
        schema_version: 1,
        canonical_host: "example.com",
        posture: [{ check_id: "TLS_CERTIFICATE", outcome: "PASS" }],
        potential_risk_count: 0,
        coverage: [
          {
            detector_group: "TARGET_RESOLUTION",
            execution_status: "SUCCESS",
            completeness: "COMPLETE",
          },
        ],
        warning_count: 0,
        execution: {
          policy_version: "1.0.0",
          duration_ms: 100,
          request_count: 2,
        },
      },
    },
  };
}

function request(overrides: Record<string, unknown> = {}) {
  const token = deriveGuestResultToken(tokenMetadata(), KEY);
  return {
    authorization_header: `Bearer ${token}`,
    route_guest_scan_id: "guest_scan_01",
    query: {},
    now_unix_seconds: NOW + 100n,
    ...overrides,
  };
}

function dependencies(value: unknown = stored()) {
  return {
    store: { loadByGuestScanId: vi.fn().mockResolvedValue(value) },
    token_keyring: new Map([[7, KEY]]),
  };
}

describe("authorized Guest result read service", () => {
  it("loads only the route-bound scan and emits the sanitized view", async () => {
    const deps = dependencies();
    const result = await readAuthorizedGuestResult(request(), deps);
    expect(deps.store.loadByGuestScanId).toHaveBeenCalledOnce();
    expect(deps.store.loadByGuestScanId).toHaveBeenCalledWith("guest_scan_01");
    expect(result).toMatchObject({
      ok: true,
      response_headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
      body: {
        guest_scan_id: "guest_scan_01",
        canonical_host: "example.com",
        coverage: { state: "PARTIAL", total_group_count: 8 },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /principal_scope|token_nonce|payload_digest|duration_ms|evidence/u,
    );
  });

  it.each([
    { query: { token: "secret" } },
    { route_guest_scan_id: "" },
    { now_unix_seconds: -1n },
    { extra: true },
  ])("rejects malformed input before persistence lookup %#", async (change) => {
    const deps = dependencies();
    await expect(
      readAuthorizedGuestResult(request(change), deps),
    ).resolves.toEqual({ ok: false, code: "INVALID_RESULT_REQUEST" });
    expect(deps.store.loadByGuestScanId).not.toHaveBeenCalled();
  });

  it("collapses malformed bearer input without reading storage", async () => {
    const deps = dependencies();
    await expect(
      readAuthorizedGuestResult(
        request({ authorization_header: "Bearer invalid" }),
        deps,
      ),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
    expect(deps.store.loadByGuestScanId).not.toHaveBeenCalled();
  });

  it("collapses missing and failed storage reads to one denial", async () => {
    await expect(
      readAuthorizedGuestResult(request(), dependencies(null)),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
    const deps = dependencies();
    deps.store.loadByGuestScanId.mockRejectedValueOnce(
      new Error("database detail"),
    );
    await expect(readAuthorizedGuestResult(request(), deps)).resolves.toEqual({
      ok: false,
      code: "RESULT_ACCESS_DENIED",
    });
  });

  it.each([
    [
      "job state",
      (value: ReturnType<typeof stored>) => (value.scan.job_state = "RUNNING"),
    ],
    [
      "scan id",
      (value: ReturnType<typeof stored>) =>
        (value.result.guest_scan_id = "guest_scan_02"),
    ],
    [
      "attempt",
      (value: ReturnType<typeof stored>) =>
        (value.result.accepted_attempt_id = "guest_attempt_02"),
    ],
    [
      "fence",
      (value: ReturnType<typeof stored>) => (value.result.accepted_fence = 6),
    ],
    [
      "digest",
      (value: ReturnType<typeof stored>) =>
        (value.result.payload_digest = `sha256:${"e".repeat(64)}`),
    ],
    [
      "target",
      (value: ReturnType<typeof stored>) =>
        (value.result.projection.canonical_host = "other.example"),
    ],
    [
      "projection",
      (value: ReturnType<typeof stored>) =>
        Object.assign(value.result.projection, { raw_evidence: [] }),
    ],
  ])("denies inconsistent persisted %s", async (_name, mutate) => {
    const value = stored();
    mutate(value);
    await expect(
      readAuthorizedGuestResult(request(), dependencies(value)),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
  });

  it("denies expired, revoked, deleted and unavailable-key access", async () => {
    const expiredRequest = request({ now_unix_seconds: NOW + 1_800n });
    await expect(
      readAuthorizedGuestResult(expiredRequest, dependencies()),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });

    const revoked = stored();
    revoked.scan.result_token_metadata.result_access_revoked_at_unix_seconds =
      NOW + 50n;
    await expect(
      readAuthorizedGuestResult(request(), dependencies(revoked)),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });

    const deleted = stored();
    await expect(
      readAuthorizedGuestResult(
        request({
          now_unix_seconds: deleted.scan.deletion_deadline_unix_seconds,
        }),
        dependencies(deleted),
      ),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });

    const noKey = dependencies();
    noKey.token_keyring.clear();
    await expect(readAuthorizedGuestResult(request(), noKey)).resolves.toEqual({
      ok: false,
      code: "RESULT_ACCESS_DENIED",
    });
  });

  it("contains hostile store records and dependency getters", async () => {
    const value = stored();
    Object.defineProperty(value.scan, "job_state", {
      enumerable: true,
      get: () => {
        throw new Error("row detail");
      },
    });
    await expect(
      readAuthorizedGuestResult(request(), dependencies(value)),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });

    const hostile = dependencies();
    Object.defineProperty(hostile, "token_keyring", {
      enumerable: true,
      get: () => {
        throw new Error("key detail");
      },
    });
    await expect(
      readAuthorizedGuestResult(request(), hostile),
    ).resolves.toEqual({ ok: false, code: "RESULT_ACCESS_DENIED" });
  });
});
