import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  approvedGuestArtifact,
  guestWorkerProcessConfiguration,
} from "../src/guest-worker/index.js";

const DIGEST = `sha256:${"a".repeat(64)}`;

function environment() {
  return {
    OUTSCAN_GUEST_APPROVAL_FILE: resolve("approval.json"),
    OUTSCAN_RESULT_SIGNING_KEY_FILE: resolve("signing.json"),
    OUTSCAN_RESULT_VERIFICATION_KEYRING_FILE: resolve("keyring.json"),
    OUTSCAN_SCANNER_EXECUTABLE: process.execPath,
    OUTSCAN_SCANNER_WORKING_DIRECTORY: process.cwd(),
    OUTSCAN_SCANNER_ARGUMENTS_JSON: '["--fixed","value"]',
  };
}

function approval(status = "APPROVED") {
  return {
    approval_id: "approval_01",
    status,
    artifact_identity: {
      template_workflow_digest: DIGEST,
      transitive_dependency_digests: [],
      engine_version: "scanner-1.0.0",
      scanner_image_digest: DIGEST,
      config_version: "config-1",
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile: "GUEST_SAFE",
    },
  };
}

describe("Guest worker process configuration", () => {
  it("snapshots exact absolute paths and fixed scanner arguments", () => {
    const raw = environment();
    const result = guestWorkerProcessConfiguration(raw);
    expect(result).toMatchObject({
      approval_file: raw.OUTSCAN_GUEST_APPROVAL_FILE,
      scanner_executable: process.execPath,
      scanner_arguments: ["--fixed", "value"],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.scanner_arguments)).toBe(true);
  });

  it.each([
    { OUTSCAN_GUEST_APPROVAL_FILE: undefined },
    { OUTSCAN_GUEST_APPROVAL_FILE: "relative.json" },
    { OUTSCAN_SCANNER_EXECUTABLE: "scanner" },
    { OUTSCAN_SCANNER_ARGUMENTS_JSON: "{}" },
    { OUTSCAN_SCANNER_ARGUMENTS_JSON: '["bad\\nargument"]' },
    {
      OUTSCAN_SCANNER_ARGUMENTS_JSON: JSON.stringify(
        Array.from({ length: 33 }, () => "value"),
      ),
    },
  ])("rejects missing or unsafe process environment", (override) => {
    expect(() =>
      guestWorkerProcessConfiguration({ ...environment(), ...override }),
    ).toThrow("INVALID_GUEST_WORKER_PROCESS_CONFIGURATION");
  });

  it("contains hostile environment getters", () => {
    const raw = environment();
    Object.defineProperty(raw, "OUTSCAN_SCANNER_EXECUTABLE", {
      get: () => {
        throw new Error("secret detail");
      },
    });
    expect(() => guestWorkerProcessConfiguration(raw)).toThrow(
      "INVALID_GUEST_WORKER_PROCESS_CONFIGURATION",
    );
  });

  it("accepts only the current approved Guest artifact", () => {
    expect(approvedGuestArtifact(approval())).toEqual(
      approval().artifact_identity,
    );
    expect(approvedGuestArtifact(approval("REVOKED"))).toBeNull();
    expect(
      approvedGuestArtifact({
        ...approval(),
        artifact_identity: {
          ...approval().artifact_identity,
          profile: "VERIFIED_BASELINE",
        },
      }),
    ).toBeNull();
    expect(approvedGuestArtifact({ ...approval(), extra: true })).toBeNull();
  });
});
