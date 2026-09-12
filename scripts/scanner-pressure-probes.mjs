// Fixed host-owned fixtures serialized into offline test containers, never target input.
export async function cpuPressure() {
  const { default: assert } = await import("node:assert/strict");
  const { readFile } = await import("node:fs/promises");
  await import("./scanner-resources.mjs");
  async function counters() {
    const text = await readFile("/sys/fs/cgroup/cpu.stat", "utf8");
    const values = Object.fromEntries(
      text
        .trim()
        .split("\n")
        .map((line) => line.split(/\s+/u)),
    );
    assert.match(values.nr_throttled, /^[0-9]+$/u);
    assert.match(values.throttled_usec, /^[0-9]+$/u);
    return [BigInt(values.nr_throttled), BigInt(values.throttled_usec)];
  }
  const before = await counters();
  const end = process.hrtime.bigint() + 2_000_000_000n;
  // Both monotonic wall-time and iteration bounds apply; no worker fan-out.
  for (let i = 0; i < 100_000_000 && process.hrtime.bigint() < end; i++) {
    Math.imul(i, i);
  }
  const after = await counters();
  assert.ok(after[0] > before[0]);
  assert.ok(after[1] > before[1]);
  console.log("SCANNER_CPU_ENFORCEMENT_PASS");
}

export async function pidPressure() {
  const { default: assert } = await import("node:assert/strict");
  const { spawn } = await import("node:child_process");
  const { readFile } = await import("node:fs/promises");
  await import("./scanner-resources.mjs");
  const current = async () =>
    Number((await readFile("/sys/fs/cgroup/pids.current", "utf8")).trim());
  const deniedCount = async () => {
    const text = await readFile("/sys/fs/cgroup/pids.events", "utf8");
    const value = /^max ([0-9]+)$/mu.exec(text)?.[1];
    assert.ok(value);
    return BigInt(value);
  };
  const baseline = await current();
  const before = await deniedCount();
  const children = [];
  const closed = [];
  let denied = false;
  try {
    // At most 80 direct attempts, no recursive spawning. Each sleeper self-expires.
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
      if (error) {
        assert.equal(error.code, "EAGAIN");
        denied = true;
        break;
      }
    }
    assert.ok(denied, "PID limit did not reject a spawn");
    assert.ok((await deniedCount()) > before);
    assert.ok((await current()) <= 64);
  } finally {
    for (const child of children) if (child.pid) child.kill("SIGKILL");
    await Promise.all(closed);
  }
  assert.ok((await current()) <= baseline);
  console.log("SCANNER_PID_ENFORCEMENT_PASS");
}
