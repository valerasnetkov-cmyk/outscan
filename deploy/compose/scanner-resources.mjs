import assert from "node:assert/strict";
import { readFile, statfs } from "node:fs/promises";

// Evidence for the current process on cgroup v2, not Docker configuration intent.
assert.equal((await statfs("/sys/fs/cgroup")).type, 0x63677270);
assert.equal((await readFile("/proc/self/cgroup", "utf8")).trim(), "0::/");
const limits = await Promise.all(
  ["memory.max", "memory.swap.max", "pids.max", "cpu.max"].map(async (name) =>
    (await readFile(`/sys/fs/cgroup/${name}`, "utf8")).trim(),
  ),
);
assert.deepEqual(limits.slice(0, 3), ["268435456", "0", "64"]);
assert.match(limits[3], /^[1-9][0-9]* [1-9][0-9]*$/u);
const [quota, period] = limits[3].split(" ").map(BigInt);
assert.equal(quota * 2n, period);
console.log("SCANNER_CGROUP_LIMITS_PASS");
