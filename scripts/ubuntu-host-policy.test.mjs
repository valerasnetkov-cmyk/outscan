import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessUbuntuHost,
  parseExpectedVersions,
} from "./ubuntu-host-policy.mjs";
const expected = { ubuntu: "24.04", engine: "29.7.2", compose: "5.5.0" };
function fixture() {
  return {
    platform: "linux",
    osRelease: 'ID=ubuntu\nVERSION_ID="24.04"\n',
    kernel: "fixture-kernel",
    compose: "5.5.0",
    info: {
      OSType: "linux",
      OperatingSystem: "Ubuntu 24.04.3 LTS",
      KernelVersion: "fixture-kernel",
      ServerVersion: "29.7.2",
      CgroupVersion: "2",
      MemoryLimit: true,
      SwapLimit: true,
      CpuCfsPeriod: true,
      CpuCfsQuota: true,
      PidsLimit: true,
      SecurityOptions: ["name=seccomp,profile=builtin"],
      Warnings: null,
    },
  };
}
test("reports only closed configuration evidence, never daemon internals", () => {
  const input = fixture();
  input.info.Name = "private-canary";
  assert.deepEqual(assessUbuntuHost(input, expected), {
    ok: true,
    versions: expected,
    cgroup: "2",
    seccomp: "builtin",
  });
});
for (const [key, value, code] of [
  ["OSType", "windows", "HOST_DAEMON_MISMATCH"],
  ["OperatingSystem", "Docker Desktop", "HOST_DAEMON_MISMATCH"],
  ["KernelVersion", "other", "HOST_DAEMON_MISMATCH"],
  ["ServerVersion", "29.7.3", "HOST_VERSION_MISMATCH"],
  ["CgroupVersion", "1", "HOST_CGROUP_V2_REQUIRED"],
  ["SecurityOptions", [], "HOST_SECCOMP_REQUIRED"],
  ["Warnings", ["private-canary"], "HOST_DAEMON_WARNINGS"],
  ["Warnings", undefined, "HOST_DAEMON_WARNINGS"],
])
  test(`rejects ${key} drift without leaking values`, () => {
    const input = fixture();
    input.info[key] = value;
    assert.deepEqual(assessUbuntuHost(input, expected), { ok: false, code });
  });
for (const key of [
  "MemoryLimit",
  "SwapLimit",
  "CpuCfsPeriod",
  "CpuCfsQuota",
  "PidsLimit",
])
  for (const value of [false, undefined, "true"])
    test(`requires boolean ${key} (${String(value)})`, () => {
      const input = fixture();
      input.info[key] = value;
      assert.equal(
        assessUbuntuHost(input, expected).code,
        "HOST_RESOURCE_CONTROL_UNAVAILABLE",
      );
    });
for (const [key, value, code] of [
  ["platform", "win32", "HOST_NOT_LINUX"],
  ["osRelease", "ID=debian\nVERSION_ID=24.04", "HOST_UBUNTU_MISMATCH"],
  ["osRelease", "ID=ubuntu\nVERSION_ID=22.04", "HOST_UBUNTU_MISMATCH"],
  ["osRelease", "ID=ubuntu\nID=ubuntu", "HOST_EVIDENCE_INVALID"],
  ["osRelease", "ID=$(private-canary)", "HOST_UBUNTU_MISMATCH"],
  ["compose", "5.5.1", "HOST_VERSION_MISMATCH"],
  ["info", null, "HOST_DAEMON_MISMATCH"],
])
  test(`rejects invalid ${key}: ${code}`, () => {
    const input = fixture();
    input[key] = value;
    assert.deepEqual(assessUbuntuHost(input, expected), { ok: false, code });
  });
test("requires explicit version pins; no defaults or extra arguments", () => {
  assert.deepEqual(
    parseExpectedVersions(["24.04", "29.7.2", "5.5.0"]),
    expected,
  );
  for (const args of [
    [],
    ["24.04", "29.7.2\n", "5.5.0"],
    [24.04, "29.7.2", "5.5.0"],
    ["24.04", "latest", "5.5.0"],
    ["24.04", "29.7.2", "5.5.0", "--force"],
  ])
    assert.throws(
      () => parseExpectedVersions(args),
      /HOST_EXPECTED_VERSIONS_REQUIRED/u,
    );
});
