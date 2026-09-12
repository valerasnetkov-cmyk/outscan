import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { release } from "node:os";
import { promisify } from "node:util";
import {
  assessUbuntuHost,
  parseExpectedVersions,
} from "./ubuntu-host-policy.mjs";

const execute = promisify(execFile);
async function docker(args) {
  const result = await execute(
    "/usr/bin/docker",
    ["--host", "unix:///var/run/docker.sock", ...args],
    {
      env: { PATH: "/usr/local/bin:/usr/bin:/bin" },
      shell: false,
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 65536,
    },
  );
  return result.stdout.trim();
}

try {
  const expected = parseExpectedVersions(process.argv.slice(2));
  if (process.platform !== "linux") throw new Error("HOST_NOT_LINUX");
  const [osRelease, info, compose] = await Promise.all([
    readFile("/etc/os-release", "utf8"),
    docker(["info", "--format", "{{json .}}"]),
    docker(["compose", "version", "--short"]),
  ]);
  const decision = assessUbuntuHost(
    {
      platform: process.platform,
      kernel: release(),
      osRelease,
      info: JSON.parse(info),
      compose: compose.replace(/^v/u, ""),
    },
    expected,
  );
  if (!decision.ok) throw new Error(decision.code);
  console.log(
    JSON.stringify({
      status: "UBUNTU_HOST_PREFLIGHT_PASS",
      ...decision,
      scope:
        "configuration-only; isolation, live-egress and gate evidence still required",
    }),
  );
} catch (error) {
  const allowed = new Set([
    "HOST_EXPECTED_VERSIONS_REQUIRED",
    "HOST_NOT_LINUX",
    "HOST_UBUNTU_MISMATCH",
    "HOST_DAEMON_MISMATCH",
    "HOST_VERSION_MISMATCH",
    "HOST_CGROUP_V2_REQUIRED",
    "HOST_RESOURCE_CONTROL_UNAVAILABLE",
    "HOST_SECCOMP_REQUIRED",
    "HOST_DAEMON_WARNINGS",
    "HOST_EVIDENCE_INVALID",
  ]);
  console.error(
    allowed.has(error?.message) ? error.message : "HOST_PREFLIGHT_UNAVAILABLE",
  );
  process.exitCode = 1;
}
