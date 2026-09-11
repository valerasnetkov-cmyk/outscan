import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { createOfflineContainerLauncher } from "../apps/api/dist/supervisor/offline-container-launcher.js";
import {
  ALLOWED_CAPABILITIES,
  BUDGET_CEILINGS,
} from "../apps/api/dist/scanner-policy/index.js";
import { readScannerIpcFrame } from "../apps/api/dist/scanner-ipc/index.js";
import { projectGuestScannerOutput } from "../apps/api/dist/scanner-output/index.js";

const execute = promisify(execFile);
const executable =
  process.platform === "win32"
    ? "C:/Program Files/Docker/Docker/resources/bin/docker.exe"
    : "/usr/bin/docker";
const host =
  process.platform === "win32"
    ? "npipe:////./pipe/dockerDesktopLinuxEngine"
    : "unix:///var/run/docker.sock";
async function docker(args) {
  return (
    await execute(executable, ["--host", host, ...args], {
      timeout: 10_000,
      maxBuffer: 16_384,
      shell: false,
      windowsHide: true,
    })
  ).stdout.trim();
}

let phase = "CONFIGURATION";
try {
  const before = await docker([
    "ps",
    "-a",
    "--filter",
    "label=outscan.offline-launch",
    "--format",
    "{{.ID}}",
  ]);
  const image = await docker([
    "image",
    "inspect",
    "outscan-lifecycle-check-scanner-offline-check",
    "--format",
    "{{.Id}}",
  ]);
  const artifact = {
    template_workflow_digest: `sha256:${"b".repeat(64)}`,
    transitive_dependency_digests: [],
    engine_version: "offline-test",
    scanner_image_digest: image,
    config_version: "offline-1",
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile: "GUEST_SAFE",
  };
  const launcher = createOfflineContainerLauncher({
    docker_executable: executable,
    working_directory: process.cwd(),
    artifact_identity: artifact,
  });
  phase = "LAUNCH";
  const handle = await launcher.launch({
    schema_version: 1,
    artifact_identity: artifact,
    scanner_input: {
      schema_version: 1,
      canonical_target: "example.com",
      policy: {
        schema_version: 1,
        policy_id: "outscan-v1",
        policy_version: "1.0.0",
        profile: "GUEST_SAFE",
        requested_capabilities: [...ALLOWED_CAPABILITIES.GUEST_SAFE],
        budgets: { ...BUDGET_CEILINGS.GUEST_SAFE },
      },
    },
  });
  phase = "RESULT";
  try {
    const [frame, exit] = await Promise.all([
      readScannerIpcFrame(handle.stdout, {
        max_payload_bytes: BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes,
        timeout_ms: 8000,
        signal: new globalThis.AbortController().signal,
      }),
      handle.wait(),
    ]);
    phase = `EXIT_${exit.exit_code ?? "NULL"}`;
    assert.deepEqual(exit, { exit_code: 0, signal: null });
    phase = frame.ok ? "PROJECTION" : frame.code;
    assert.equal(frame.ok, true);
    const projected = projectGuestScannerOutput(
      frame.result.read_payload(),
      BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes,
    );
    assert.equal(projected.ok, true);
    assert.equal(projected.projection.canonical_host, "example.com");
    assert.ok(
      projected.projection.coverage.every(
        (item) => item.execution_status === "FAILED",
      ),
    );
  } finally {
    await handle.stop("KILL");
  }
  assert.equal(
    await docker([
      "ps",
      "-a",
      "--filter",
      "label=outscan.offline-launch",
      "--format",
      "{{.ID}}",
    ]),
    before,
  );
  console.log("OFFLINE_CONTAINER_LAUNCHER_PASS");
} catch (error) {
  const code =
    error instanceof Error && /^OFFLINE_CONTAINER_[A-Z_]+$/u.test(error.message)
      ? error.message
      : "CHECK_FAILED";
  console.error(`OFFLINE_CONTAINER_LAUNCHER_FAILED:${phase}:${code}`);
  process.exitCode = 1;
}
