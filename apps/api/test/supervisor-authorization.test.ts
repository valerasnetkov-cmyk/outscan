import { describe, expect, it } from "vitest";

import { BUDGET_CEILINGS } from "../src/scanner-policy/index.js";
import {
  authorizeSupervisorExecution,
  type ScannerArtifactIdentity,
  type TrustedExecutionState,
} from "../src/supervisor/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const DIGEST_C = `sha256:${"c".repeat(64)}`;

function artifact(): ScannerArtifactIdentity {
  return {
    template_workflow_digest: DIGEST_A,
    transitive_dependency_digests: [DIGEST_B, DIGEST_C],
    engine_version: "nuclei-3.8.1",
    scanner_image_digest: DIGEST_C,
    config_version: "guest-safe-1",
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile: "GUEST_SAFE",
  };
}

function envelope() {
  return {
    schema_version: 1,
    job_id: "job_01",
    attempt_id: "attempt_01",
    fence: 7,
    canonical_target: "example.com",
    authorization_ref: "guest-scan:scan_01",
    lease_expires_at_unix_seconds: 1_800,
    hard_deadline_unix_seconds: 2_000,
    policy: {
      schema_version: 1,
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile: "GUEST_SAFE",
      requested_capabilities: ["DNS_READ", "TLS_HANDSHAKE"],
      budgets: { ...BUDGET_CEILINGS.GUEST_SAFE },
    },
    artifact_identity: artifact(),
  };
}

function trusted(): TrustedExecutionState {
  return {
    now_unix_seconds: 1_700,
    job_id: "job_01",
    attempt_id: "attempt_01",
    fence: 7,
    canonical_target: "example.com",
    authorization_ref: "guest-scan:scan_01",
    lease_expires_at_unix_seconds: 1_800,
    hard_deadline_unix_seconds: 2_000,
    approval: {
      approval_id: "approval_01",
      status: "APPROVED",
      artifact_identity: artifact(),
    },
  };
}

describe("trusted supervisor authorization", () => {
  it("allows an exact current envelope and approved artifact", () => {
    expect(authorizeSupervisorExecution(envelope(), trusted())).toMatchObject({
      allowed: true,
      envelope: {
        job_id: "job_01",
        attempt_id: "attempt_01",
        fence: 7,
      },
    });
  });

  it("returns an immutable policy and artifact snapshot", () => {
    const input = envelope();
    const result = authorizeSupervisorExecution(input, trusted());
    if (!result.allowed) throw new Error(result.code);

    input.policy.requested_capabilities[0] = "HEADLESS_BROWSER" as never;
    input.policy.budgets.max_requests = 999 as never;
    input.artifact_identity.transitive_dependency_digests[0] = DIGEST_A;

    expect(result.envelope.policy.requested_capabilities).toEqual([
      "DNS_READ",
      "TLS_HANDSHAKE",
    ]);
    expect(result.envelope.policy.budgets.max_requests).toBe(
      BUDGET_CEILINGS.GUEST_SAFE.max_requests,
    );
    expect(
      result.envelope.artifact_identity.transitive_dependency_digests,
    ).toEqual([DIGEST_B, DIGEST_C]);
    expect(Object.isFrozen(result.envelope)).toBe(true);
    expect(Object.isFrozen(result.envelope.policy)).toBe(true);
    expect(Object.isFrozen(result.envelope.policy.budgets)).toBe(true);
    expect(Object.isFrozen(result.envelope.policy.requested_capabilities)).toBe(
      true,
    );
  });

  it.each([
    ["job_id", "job_02"],
    ["attempt_id", "attempt_02"],
    ["fence", 8],
  ])("denies stale %s", (field, value) => {
    expect(
      authorizeSupervisorExecution(
        { ...envelope(), [field]: value },
        trusted(),
      ),
    ).toMatchObject({ allowed: false, code: "STALE_ATTEMPT" });
  });

  it.each([
    ["canonical_target", "other.example"],
    ["authorization_ref", "guest-scan:scan_02"],
  ])("denies changed %s", (field, value) => {
    expect(
      authorizeSupervisorExecution(
        { ...envelope(), [field]: value },
        trusted(),
      ),
    ).toMatchObject({ allowed: false, code: "AUTHORIZATION_MISMATCH" });
  });

  it("denies an expired or stale lease", () => {
    expect(
      authorizeSupervisorExecution(envelope(), {
        ...trusted(),
        now_unix_seconds: 1_800,
      }),
    ).toMatchObject({ allowed: false, code: "LEASE_EXPIRED" });

    expect(
      authorizeSupervisorExecution(
        { ...envelope(), lease_expires_at_unix_seconds: 1_900 },
        trusted(),
      ),
    ).toMatchObject({ allowed: false, code: "LEASE_EXPIRED" });
  });

  it("denies an exceeded or stale hard deadline", () => {
    const input = {
      ...envelope(),
      lease_expires_at_unix_seconds: 2_100,
    };
    expect(
      authorizeSupervisorExecution(input, {
        ...trusted(),
        now_unix_seconds: 2_000,
        lease_expires_at_unix_seconds: 2_100,
      }),
    ).toMatchObject({
      allowed: false,
      code: "ATTEMPT_DEADLINE_EXCEEDED",
    });

    expect(
      authorizeSupervisorExecution(
        { ...envelope(), hard_deadline_unix_seconds: 2_100 },
        trusted(),
      ),
    ).toMatchObject({
      allowed: false,
      code: "ATTEMPT_DEADLINE_EXCEEDED",
    });
  });

  it("preserves a fail-closed scanner-policy denial", () => {
    const input = envelope();
    input.policy.requested_capabilities = ["HEADLESS_BROWSER"] as never;

    expect(authorizeSupervisorExecution(input, trusted())).toMatchObject({
      allowed: false,
      code: "POLICY_DENIED",
      policy_decision: { allowed: false, code: "CAPABILITY_DENIED" },
    });
  });

  it("requires a current approval", () => {
    expect(
      authorizeSupervisorExecution(envelope(), {
        ...trusted(),
        approval: null,
      }),
    ).toMatchObject({ allowed: false, code: "APPROVAL_REQUIRED" });

    const state = trusted();
    state.approval!.status = "REVOKED";
    expect(authorizeSupervisorExecution(envelope(), state)).toMatchObject({
      allowed: false,
      code: "APPROVAL_REVOKED",
    });
  });

  it.each([
    ["template_workflow_digest", DIGEST_B],
    ["engine_version", "nuclei-3.8.2"],
    ["scanner_image_digest", DIGEST_A],
    ["config_version", "guest-safe-2"],
    ["policy_id", "outscan-v2"],
    ["policy_version", "1.0.1"],
    ["profile", "VERIFIED_BASELINE"],
  ])("invalidates approval after %s changes", (field, value) => {
    const input = envelope();
    input.artifact_identity = { ...artifact(), [field]: value };

    expect(authorizeSupervisorExecution(input, trusted())).toMatchObject({
      allowed: false,
      code: "ARTIFACT_NOT_APPROVED",
    });
  });

  it("invalidates approval after a dependency digest changes", () => {
    const input = envelope();
    input.artifact_identity.transitive_dependency_digests = [
      DIGEST_A,
      DIGEST_B,
    ];

    expect(authorizeSupervisorExecution(input, trusted())).toMatchObject({
      allowed: false,
      code: "ARTIFACT_NOT_APPROVED",
    });
  });

  it("treats dependency digest ordering as the same identity", () => {
    const input = envelope();
    input.artifact_identity.transitive_dependency_digests.reverse();

    expect(authorizeSupervisorExecution(input, trusted())).toMatchObject({
      allowed: true,
    });
  });

  it("denies malformed artifact identities and unknown envelope fields", () => {
    const malformed = envelope();
    malformed.artifact_identity.template_workflow_digest = "not-a-digest";
    expect(authorizeSupervisorExecution(malformed, trusted())).toMatchObject({
      allowed: false,
      code: "INVALID_ENVELOPE",
    });

    expect(
      authorizeSupervisorExecution(
        { ...envelope(), unrestricted_network: true },
        trusted(),
      ),
    ).toMatchObject({ allowed: false, code: "INVALID_ENVELOPE" });
  });
});
