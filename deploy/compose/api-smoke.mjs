import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";

try {
  assert.equal(process.getuid(), 1000);
  assert.ok(
    Object.values(networkInterfaces())
      .flat()
      .every((item) => item.internal),
  );
  const status = await readFile("/proc/self/status", "utf8");
  assert.match(status, /^CapEff:\s+0+$/m);
  assert.match(status, /^NoNewPrivs:\s+1$/m);
  const mounts = await readFile("/proc/mounts", "utf8");
  const rootMount = mounts
    .split("\n")
    .map((line) => line.split(" "))
    .find((fields) => fields[1] === "/");
  assert.ok(rootMount?.[3]?.split(",").includes("ro"));
  for (const path of [
    "/app/apps/api/src",
    "/app/public",
    "/app/.env",
    "/var/run/docker.sock",
  ]) {
    await assert.rejects(access(path), { code: "ENOENT" });
  }
  const base = "http://127.0.0.1:3002";
  const health = await globalThis.fetch(`${base}/health`, {
    signal: globalThis.AbortSignal.timeout(2000),
  });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "no-store");
  assert.deepEqual(await health.json(), {
    service: "outscan-api",
    status: "ok",
    version: "0.1.0",
  });
  const capabilities = await globalThis.fetch(
    `${base}/v1/public/capabilities`,
    {
      signal: globalThis.AbortSignal.timeout(2000),
    },
  );
  assert.equal(capabilities.status, 200);
  assert.deepEqual((await capabilities.json()).data, []);
  for (const [method, path] of [
    ["POST", "/v1/public/guest-session"],
    ["POST", "/v1/public/scans"],
    ["GET", "/v1/public/scans/guest_scan_01"],
  ]) {
    const response = await globalThis.fetch(`${base}${path}`, {
      method,
      signal: globalThis.AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 404);
  }
  console.log("API_BASELINE_SMOKE_PASS");
} catch {
  console.error("API_BASELINE_SMOKE_FAILED");
  process.exitCode = 1;
}
