import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

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

try {
  assert.equal(process.argv.length, 2);
  await scenario("EXIT_FAILURE");
  await scenario("IGNORES_TERM");
  console.log("SCANNER_CONTAINER_LIFECYCLE_PASS");
} catch {
  console.error("SCANNER_CONTAINER_LIFECYCLE_FAILED");
  process.exitCode = 1;
}
