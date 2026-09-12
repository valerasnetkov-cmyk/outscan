import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

import { cpuPressure, pidPressure } from "./scanner-pressure-probes.mjs";

const execute = promisify(execFile);
const project = "outscan-lifecycle-check";
const compose = [
  "compose",
  "-p",
  project,
  "-f",
  "deploy/compose/compose.yaml",
  "--profile",
  "scanner-check",
];

async function docker(args) {
  const result = await execute("docker", args, {
    shell: false,
    timeout: 20_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function inspect(name) {
  return JSON.parse(await docker(["inspect", name, "--format", "{{json .}}"]));
}

function assertOwnership(container, name, run) {
  assert.equal(container.Name, `/${name}`);
  assert.equal(container.Config.Labels["com.docker.compose.project"], project);
  assert.equal(container.Config.Labels["outscan.verification.run"], run);
  assert.match(container.Id, /^[a-f0-9]{64}$/);
}

async function cleanup(name, run) {
  // Query only this random run label; daemon uncertainty must not count as absence.
  const ids = await docker([
    "ps",
    "-a",
    "--filter",
    `label=outscan.verification.run=${run}`,
    "--format",
    "{{.ID}}",
  ]);
  if (ids === "") return;
  const container = await inspect(name);
  assertOwnership(container, name, run);
  await docker(["rm", "--force", container.Id]);
  assert.equal(
    await docker([
      "ps",
      "-a",
      "--filter",
      `label=outscan.verification.run=${run}`,
      "--format",
      "{{.ID}}",
    ]),
    "",
  );
}

async function ready(name) {
  const deadline = Date.now() + 10_000;
  do {
    if ((await docker(["logs", name])).includes("LIFECYCLE_READY")) return;
    await delay(100);
  } while (Date.now() < deadline);
  throw new Error("CONTAINER_NOT_READY");
}

async function scenario(kind) {
  const run = randomUUID();
  const name = `outscan-lifecycle-${run}`;
  const program =
    kind === "EXIT_FAILURE"
      ? "process.exit(23)"
      : "process.on('SIGTERM',()=>{});console.log('LIFECYCLE_READY');setInterval(()=>{},1000)";
  try {
    await docker([
      ...compose,
      "run",
      "--no-deps",
      "-d",
      "--name",
      name,
      "--label",
      `outscan.verification.run=${run}`,
      "scanner-offline-check",
      "node",
      "-e",
      program,
    ]);
    const created = await inspect(name);
    assertOwnership(created, name, run);
    assert.equal(created.HostConfig.NetworkMode, "none");
    assert.equal(created.HostConfig.ReadonlyRootfs, true);
    assert.equal(created.Config.User, "1000:1000");
    assert.deepEqual(created.Mounts, []);
    if (kind === "EXIT_FAILURE") {
      assert.equal(await docker(["wait", name]), "23");
    } else {
      await ready(name);
      const started = Date.now();
      await docker(["stop", "--time", "1", name]);
      const stopped = await inspect(name);
      assert.equal(stopped.State.Running, false);
      assert.equal(stopped.State.ExitCode, 137);
      assert.ok(Date.now() - started < 15_000);
    }
  } finally {
    await cleanup(name, run);
  }
}

async function resourceScenario(overrides) {
  const run = randomUUID();
  const name = `outscan-resources-${run}`;
  try {
    await docker([
      ...compose,
      "run",
      "--no-deps",
      "-d",
      "--name",
      name,
      "--label",
      `outscan.verification.run=${run}`,
      "scanner-offline-check",
      "node",
      "-e",
      "setInterval(()=>{},1000)",
    ]);
    const created = await inspect(name);
    assertOwnership(created, name, run);
    assert.equal(created.HostConfig.NetworkMode, "none");
    if (overrides.length) await docker(["update", ...overrides, created.Id]);
    assertOwnership(await inspect(name), name, run);
    const output = await docker([
      "exec",
      created.Id,
      "node",
      "--input-type=module",
      "-e",
      "try { await import('./scanner-resources.mjs'); console.log('RESOURCE_ACCEPTED'); } catch { console.log('RESOURCE_DENIED'); }",
    ]);
    assert.equal(
      output,
      overrides.length
        ? "RESOURCE_DENIED"
        : "SCANNER_CGROUP_LIMITS_PASS\nRESOURCE_ACCEPTED",
    );
  } finally {
    await cleanup(name, run);
  }
}

async function oomScenario() {
  const run = randomUUID();
  const name = `outscan-oom-${run}`;
  // Allocate only after in-container verification of the 256 MiB/no-swap limit.
  // Finite 512 MiB maximum if enforcement fails; no unbounded allocator/fork loop.
  const program = [
    "await import('./scanner-resources.mjs');",
    "const retained = [];",
    "for (let i = 0; i < 32; i++) retained.push(Buffer.alloc(16 * 1024 * 1024, 90));",
    "console.log('OOM_NOT_ENFORCED', retained.length); process.exit(24);",
  ].join("\n");
  try {
    await docker([
      ...compose,
      "run",
      "--no-deps",
      "-d",
      "--name",
      name,
      "--label",
      `outscan.verification.run=${run}`,
      "scanner-offline-check",
      "node",
      "--input-type=module",
      "-e",
      program,
    ]);
    const created = await inspect(name);
    assertOwnership(created, name, run);
    assert.equal(created.HostConfig.NetworkMode, "none");
    assert.equal(created.HostConfig.Memory, 268435456);
    assert.equal(created.HostConfig.MemorySwap, 268435456);
    assert.equal(await docker(["wait", created.Id]), "137");
    const stopped = await inspect(name);
    assertOwnership(stopped, name, run);
    assert.equal(stopped.Id, created.Id);
    assert.equal(stopped.State.Running, false);
    assert.equal(stopped.State.OOMKilled, true);
    assert.equal(stopped.State.ExitCode, 137);
    const logs = await docker(["logs", created.Id]);
    assert.ok(logs.includes("SCANNER_CGROUP_LIMITS_PASS"));
    assert.ok(!logs.includes("OOM_NOT_ENFORCED"));
  } finally {
    await cleanup(name, run);
  }
}

async function pressureScenario(probe, marker) {
  const run = randomUUID();
  const name = `outscan-pressure-${run}`;
  const program = `(${probe.toString()})().catch(() => { console.log('RESOURCE_PRESSURE_FAILED'); process.exitCode = 1; });`;
  try {
    await docker([
      ...compose,
      "run",
      "--no-deps",
      "-d",
      "--name",
      name,
      "--label",
      `outscan.verification.run=${run}`,
      "scanner-offline-check",
      "node",
      "--input-type=module",
      "-e",
      program,
    ]);
    const created = await inspect(name);
    assertOwnership(created, name, run);
    assert.equal(created.HostConfig.NetworkMode, "none");
    assert.equal(await docker(["wait", created.Id]), "0");
    const stopped = await inspect(name);
    assertOwnership(stopped, name, run);
    assert.equal(stopped.Id, created.Id);
    assert.equal(stopped.State.Running, false);
    assert.equal(stopped.State.OOMKilled, false);
    assert.equal(
      await docker(["logs", created.Id]),
      `SCANNER_CGROUP_LIMITS_PASS\n${marker}`,
    );
  } finally {
    await cleanup(name, run);
  }
}

try {
  assert.equal(process.argv.length, 2);
  await scenario("EXIT_FAILURE");
  await scenario("IGNORES_TERM");
  console.log("SCANNER_CONTAINER_LIFECYCLE_PASS");
  for (const overrides of [
    [],
    ["--memory", "512m", "--memory-swap", "512m"],
    ["--memory-swap", "512m"],
    ["--pids-limit", "128"],
    ["--cpus", "1"],
  ])
    await resourceScenario(overrides);
  console.log("SCANNER_CGROUP_NEGATIVE_PASS");
  await oomScenario();
  console.log("SCANNER_OOM_ENFORCEMENT_PASS");
  await pressureScenario(pidPressure, "SCANNER_PID_ENFORCEMENT_PASS");
  console.log("SCANNER_PID_ENFORCEMENT_PASS");
  await pressureScenario(cpuPressure, "SCANNER_CPU_ENFORCEMENT_PASS");
  console.log("SCANNER_CPU_ENFORCEMENT_PASS");
} catch {
  console.error("SCANNER_CONTAINER_LIFECYCLE_FAILED");
  process.exitCode = 1;
}
