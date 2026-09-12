import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const read = async (name) =>
  (await readFile(`/sys/fs/cgroup/${name}`, "utf8")).trim();
export async function limits() {
  const memory = await read("memory.max");
  const swap = await read("memory.swap.max");
  const pids = await read("pids.max");
  const cpu = (await read("cpu.max")).split(" ").map(Number);
  assert.equal(memory, "268435456");
  assert.equal(swap, "0");
  assert.equal(pids, "64");
  assert.equal(cpu[0] / cpu[1], 0.5);
  const membership = await readFile("/proc/self/cgroup", "utf8");
  assert.equal(membership.trim(), "0::/");
  console.log(
    JSON.stringify({ marker: "CGROUP_PASS", memory, swap, pids, cpu }),
  );
}
const counters = async (name) =>
  Object.fromEntries(
    (await read(name)).split("\n").map((line) => {
      const [key, value] = line.split(" ");
      return [key, Number(value)];
    }),
  );

export async function pressure(mode) {
  await limits();
  if (mode === "memory") {
    const retained = [];
    for (let i = 0; i < 32; i++)
      retained.push(Buffer.alloc(16 * 1024 * 1024, 90));
    throw new Error(`OOM_NOT_ENFORCED:${retained.length}`);
  }
  if (mode === "cpu") {
    const before = await counters("cpu.stat");
    const deadline = process.hrtime.bigint() + 2_000_000_000n;
    let checksum = 1;
    for (
      let i = 0;
      i < 100_000_000 && process.hrtime.bigint() < deadline;
      i++
    ) {
      checksum = Math.imul(checksum ^ i, 1664525) + 1013904223;
    }
    const after = await counters("cpu.stat");
    assert.ok(after.nr_throttled > before.nr_throttled);
    assert.ok(after.throttled_usec > before.throttled_usec);
    console.log(
      JSON.stringify({ marker: "CPU_PASS", before, after, checksum }),
    );
    return;
  }
  if (mode !== "pids") throw new Error("UNKNOWN_RESOURCE_PROBE");
  const before = await counters("pids.events");
  const baseline = Number(await read("pids.current"));
  const children = [];
  const closed = [];
  let rejected = false;
  let peak = baseline;
  try {
    for (let i = 0; i < 80; i++) {
      const child = spawn("/bin/sleep", ["10"], {
        env: {},
        shell: false,
        stdio: "ignore",
      });
      children.push(child);
      closed.push(new Promise((resolve) => child.once("close", resolve)));
      const error = await new Promise((resolve) => {
        child.once("spawn", () => resolve(null));
        child.once("error", resolve);
      });
      peak = Math.max(peak, Number(await read("pids.current")));
      if (error) {
        assert.equal(error.code, "EAGAIN");
        rejected = true;
        break;
      }
    }
    assert.ok(rejected);
    assert.ok(peak <= 64);
    assert.ok((await counters("pids.events")).max > before.max);
  } finally {
    for (const child of children) if (child.pid) child.kill("SIGKILL");
    await Promise.all(closed);
  }
  const remaining = Number(await read("pids.current"));
  assert.ok(remaining <= baseline);
  console.log(
    JSON.stringify({
      marker: "PIDS_PASS",
      baseline,
      peak,
      remaining,
      before,
      after: await counters("pids.events"),
      rejected,
    }),
  );
}
