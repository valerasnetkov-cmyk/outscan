import assert from "node:assert/strict";
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";

// Review additions explicitly: tsc follows imports beyond its entry point.
const expected = [
  "guest-crypto/binary.js",
  "guest-scanner-cli.js",
  "guest-scanner/config.js",
  "guest-scanner/headers.js",
  "guest-scanner/index.js",
  "guest-scanner/run.js",
  "guest-scanner/security-txt.js",
  "scanner-ipc/frame.js",
  "scanner-ipc/index.js",
  "scanner-ipc/model.js",
  "scanner-ipc/read.js",
  "scanner-policy/index.js",
  "scanner-policy/model.js",
  "scanner-policy/policy.js",
  "scanner-policy/validate.js",
  "target/hostname.js",
  "target/index.js",
  "target/ip-policy.js",
  "target/pinned-request.js",
  "target/pinned-transport.js",
  "target/resolver.js",
  "target/runtime-dns.js",
  "target/safe-http-flow.js",
];
async function inventory(directory, prefix = "") {
  const files = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    assert.ok(!item.isSymbolicLink(), "Scanner artifact contains a symlink");
    const name = `${prefix}${item.name}`;
    if (item.isDirectory()) {
      files.push(...(await inventory(join(directory, item.name), `${name}/`)));
    } else {
      assert.ok(item.isFile(), "Scanner artifact contains a special file");
      files.push(name);
    }
  }
  return files.sort();
}
assert.deepEqual(
  await inventory("/app"),
  [
    ...expected.map((file) => `apps/api/dist/${file}`),
    "package.json",
    "scanner-artifact.mjs",
    "scanner-smoke.mjs",
    "scanner-resources.mjs",
  ].sort(),
);
for (const forbidden of ["/build", "/runtime", "/var/run/docker.sock"]) {
  await assert.rejects(lstat(forbidden), { code: "ENOENT" });
}
console.log("SCANNER_ARTIFACT_PASS");
