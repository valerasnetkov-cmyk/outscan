import { describe, expect, it } from "vitest";

import { createGuestExecutionContextProvider } from "../src/guest-queue/index.js";
import type { GuestAttemptLease } from "../src/guest-persistence/index.js";

const NOW = 1_800_000_000;
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
const LEASE: Readonly<GuestAttemptLease> = Object.freeze({
  guest_scan_id: "scan_01",
  attempt_id: "attempt_01",
  attempt_no: 1,
  monotonic_fence: 7,
  lease_version: 1,
  canonical_target: "example.com",
  lease_expires_at_unix_seconds: NOW + 15,
  hard_deadline_unix_seconds: NOW + 45,
});

function approval(extra: Record<string, unknown> = {}) {
  return {
    approval_id: "approval_01",
    status: "APPROVED",
    artifact_identity: {
      template_workflow_digest: DIGEST_A,
      transitive_dependency_digests: [DIGEST_B],
      engine_version: "scanner-1.0.0",
      scanner_image_digest: DIGEST_B,
      config_version: "config-1",
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile: "GUEST_SAFE",
    },
    ...extra,
  };
}

function provider(value: unknown, now = NOW) {
  return createGuestExecutionContextProvider({
    approval_provider: { get_active_approval: () => value },
    now_unix_seconds: () => now,
  });
}

describe("Guest execution context", () => {
  it("derives the complete execution envelope from lease and approved policy", async () => {
    const context = await provider(approval()).load(LEASE);
    expect(context).toMatchObject({
      envelope: {
        job_id: "scan_01",
        attempt_id: "attempt_01",
        fence: 7,
        canonical_target: "example.com",
        authorization_ref: "guest-scan:scan_01",
        policy: {
          policy_id: "outscan-v1",
          policy_version: "1.0.0",
          profile: "GUEST_SAFE",
        },
      },
      trusted: {
        job_id: "scan_01",
        attempt_id: "attempt_01",
        fence: 7,
      },
    });
    const serialized = JSON.stringify(context);
    expect(serialized).not.toContain("HEADLESS_BROWSER");
    expect(serialized).not.toMatch(/result_token|redis|database|credential/iu);
  });

  it.each([
    null,
    approval({ extra: true }),
    approval({ status: "UNKNOWN" }),
    approval({ artifact_identity: { profile: "GUEST_SAFE" } }),
    approval({
      artifact_identity: {
        ...approval().artifact_identity,
        profile: "VERIFIED_BASELINE",
      },
    }),
  ])("rejects absent, unknown or malformed approval state", async (value) => {
    await expect(provider(value).load(LEASE)).resolves.toBeNull();
  });

  it("rejects an expired lease before constructing scanner input", async () => {
    await expect(
      provider(approval(), NOW + 15).load(LEASE),
    ).resolves.toBeNull();
  });
});
