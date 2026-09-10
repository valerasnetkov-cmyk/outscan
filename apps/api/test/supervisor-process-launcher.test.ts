import { describe, expect, it } from "vitest";

import { BUDGET_CEILINGS } from "../src/scanner-policy/index.js";
import {
  createFixedScannerProcessLauncher,
  type ScannerArtifactIdentity,
  type ScannerLaunchPlan,
  type ScannerProcessHandle,
} from "../src/supervisor/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function artifact(): ScannerArtifactIdentity {
  return {
    template_workflow_digest: DIGEST_A,
    transitive_dependency_digests: [DIGEST_B],
    engine_version: "scanner-1.0.0",
    scanner_image_digest: DIGEST_B,
    config_version: "config-1",
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile: "GUEST_SAFE",
  };
}

function plan(): ScannerLaunchPlan {
  return {
    schema_version: 1,
    artifact_identity: artifact(),
    scanner_input: {
      schema_version: 1,
      canonical_target: "example.com",
      policy: {
        schema_version: 1,
        policy_id: "outscan-v1",
        policy_version: "1.0.0",
        profile: "GUEST_SAFE",
        requested_capabilities: ["DNS_READ", "TLS_HANDSHAKE"],
        budgets: { ...BUDGET_CEILINGS.GUEST_SAFE },
      },
    },
  };
}

function launcher(argumentsValue: readonly string[]) {
  return createFixedScannerProcessLauncher({
    executable_path: process.execPath,
    arguments: argumentsValue,
    working_directory: process.cwd(),
    artifact_identity: artifact(),
  });
}

async function readAll(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

describe("fixed scanner process launcher", () => {
  it("starts without a shell or inherited environment and sends only scanner input", async () => {
    const processLauncher = launcher([
      "-e",
      "process.stdin.pipe(process.stdout)",
    ]);
    const handle = (await processLauncher.launch(
      plan(),
    )) as ScannerProcessHandle;
    const output = await readAll(handle.stdout);
    await expect(handle.wait()).resolves.toEqual({
      exit_code: 0,
      signal: null,
    });
    expect(JSON.parse(output)).toEqual(plan().scanner_input);
    expect(output).not.toContain("artifact_identity");
    expect(output).not.toContain("authorization_ref");
  });

  it("reports a bounded process signal through the supervisor handle", async () => {
    const processLauncher = launcher([
      "-e",
      "process.stdin.resume(); setTimeout(() => process.exit(0), 250)",
    ]);
    const handle = (await processLauncher.launch(
      plan(),
    )) as ScannerProcessHandle;
    handle.stop("TERM");
    await expect(handle.wait()).resolves.toEqual({
      exit_code: null,
      signal: "SIGTERM",
    });
  });

  it("denies a plan that does not match the fixed artifact or canonical policy", async () => {
    const processLauncher = launcher(["-e", "process.exit(0)"]);
    const changedArtifact = plan();
    changedArtifact.artifact_identity = {
      ...artifact(),
      scanner_image_digest: DIGEST_A,
    };
    const changedTarget = plan();
    changedTarget.scanner_input = {
      ...changedTarget.scanner_input,
      canonical_target: "EXAMPLE.com",
    };
    await expect(processLauncher.launch(changedArtifact)).rejects.toThrow(
      "SCANNER_PROCESS_LAUNCH_DENIED",
    );
    await expect(processLauncher.launch(changedTarget)).rejects.toThrow(
      "SCANNER_PROCESS_LAUNCH_DENIED",
    );
  });

  it.each([
    { executable_path: "relative-scanner" },
    { working_directory: "relative-directory" },
    { arguments: ["bad\nargument"] },
    { arguments: Array.from({ length: 33 }, () => "value") },
    { unexpected: true },
  ])("rejects unsafe fixed process configuration", (override) => {
    expect(() =>
      createFixedScannerProcessLauncher({
        executable_path: process.execPath,
        arguments: [],
        working_directory: process.cwd(),
        artifact_identity: artifact(),
        ...override,
      }),
    ).toThrow("INVALID_SCANNER_PROCESS_CONFIGURATION");
  });

  it("contains executable startup failures", async () => {
    const processLauncher = createFixedScannerProcessLauncher({
      executable_path: `${process.execPath}.missing`,
      arguments: [],
      working_directory: process.cwd(),
      artifact_identity: artifact(),
    });
    await expect(processLauncher.launch(plan())).rejects.toThrow(
      "SCANNER_PROCESS_LAUNCH_FAILED",
    );
  });
});
