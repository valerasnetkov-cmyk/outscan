import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { setTimeout, clearTimeout } from "node:timers";

import {
  ALLOWED_CAPABILITIES,
  BUDGET_CEILINGS,
} from "./apps/api/dist/scanner-policy/index.js";
import { readScannerIpcFrame } from "./apps/api/dist/scanner-ipc/index.js";
import { projectGuestScannerOutput } from "./apps/api/dist/scanner-output/index.js";

const maximum = BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes;
const input = {
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
};

async function run(payload, server) {
  const configuration = {
    schema_version: 1,
    dns: { servers: [server], timeout_ms: 100, tries: 1, max_timeout_ms: 100 },
    configured_internal_cidrs: [],
  };
  const child = spawn(
    process.execPath,
    ["apps/api/dist/guest-scanner-cli.js", JSON.stringify(configuration)],
    {
      env: {},
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    if (stderr.length + chunk.length > 256) child.kill("SIGKILL");
    else stderr += chunk.toString("utf8");
  });
  const exit = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  child.stdin.on("error", () => {});
  const timer = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try {
    child.stdin.end(payload);
    const [frame, outcome] = await Promise.all([
      readScannerIpcFrame(child.stdout, {
        max_payload_bytes: maximum,
        timeout_ms: 8_000,
        signal: new globalThis.AbortController().signal,
      }),
      exit,
    ]);
    return { frame, outcome, stderr };
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGKILL");
  }
}

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
  for (const resolver of ["127.0.0.1:9", "[::1]:9"]) {
    const result = await run(JSON.stringify(input), resolver);
    assert.deepEqual(result.outcome, { code: 0, signal: null });
    assert.equal(result.stderr, "");
    assert.equal(result.frame.ok, true);
    const projected = projectGuestScannerOutput(
      result.frame.result.read_payload(),
      maximum,
    );
    assert.equal(projected.ok, true);
    assert.equal(projected.projection.canonical_host, input.canonical_target);
    assert.equal(projected.projection.potential_risk_count, 0);
    assert.ok(
      projected.projection.coverage.every(
        (item) =>
          item.execution_status === "FAILED" && item.completeness === "UNKNOWN",
      ),
    );
    assert.equal(projected.projection.execution.request_count, 2);
  }
  for (const payload of [
    "{",
    JSON.stringify({ ...input, canonical_target: "https://example.com" }),
    "x".repeat(16 * 1024 + 1),
  ]) {
    const result = await run(payload, "127.0.0.1:9");
    assert.deepEqual(result.outcome, { code: 1, signal: null });
    assert.equal(result.stderr, "Guest scanner failed.\n");
    assert.equal(result.frame.ok, false);
  }
  console.log("SCANNER_OFFLINE_SMOKE_PASS");
} catch {
  console.error("SCANNER_OFFLINE_SMOKE_FAILED");
  process.exitCode = 1;
}
