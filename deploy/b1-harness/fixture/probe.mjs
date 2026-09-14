import net from "node:net";
import dgram from "node:dgram";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { setTimeout, clearTimeout } from "node:timers";
import { pressure } from "./resources.mjs";

const mode = process.argv[2];
const report = (value) => console.log(JSON.stringify(value));
async function boundary() {
  assert.equal(process.getuid(), 1000);
  const status = await readFile("/proc/self/status", "utf8");
  assert.match(status, /^CapEff:\s+0+$/m);
  assert.match(status, /^NoNewPrivs:\s+1$/m);
  assert.match(status, /^Seccomp:\s+2$/m);
  const appArmor = (await readFile("/proc/self/attr/current", "utf8")).trim();
  assert.match(appArmor, /^docker-default(?:\s+\(enforce\))?$/);
  for (const path of [
    "/var/run/docker.sock",
    "/run/containerd/containerd.sock",
    "/run/secrets",
    "/root/.ssh",
    "/platform",
    "/proc/1/root/run/secrets",
  ]) {
    try {
      await access(path, constants.R_OK);
      throw new Error("BOUNDARY_PATH_VISIBLE");
    } catch (error) {
      if (!["ENOENT", "EACCES"].includes(error.code)) throw error;
    }
  }
  assert.ok(
    !Object.keys(process.env).some((k) =>
      /POSTGRES|REDIS|SECRET|TOKEN|PASSWORD/i.test(k),
    ),
  );
  report({ marker: "BOUNDARY_PASS", appArmor });
}

function attempt(address, port, protocol) {
  if (
    !net.isIP(address) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error("INVALID_PROBE_ENDPOINT");
  }
  const dns = port === 53;
  const payload = dns
    ? Buffer.from("12340100000100000000000002623104746573740000010001", "hex")
    : Buffer.from("B1_SYNTHETIC");
  return new Promise((resolve) => {
    let done = false;
    let socket;
    const finish = (outcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (protocol === "tcp") socket.destroy();
      else socket.close();
      resolve({ marker: "ATTEMPT", address, port, protocol, outcome });
    };
    const timer = setTimeout(() => finish("TIMEOUT"), 2000);
    if (protocol === "tcp") {
      socket = net.createConnection({ host: address, port });
      socket.on("connect", () => {
        if (dns) {
          const length = Buffer.alloc(2);
          length.writeUInt16BE(payload.length);
          socket.write(Buffer.concat([length, payload]));
        } else socket.write(payload);
      });
      let received = Buffer.alloc(0);
      socket.on("data", (data) => {
        received = Buffer.concat([received, data]);
        if (received.length > 2048) return finish("INVALID_RESPONSE");
        if (
          dns &&
          (received.length < 2 ||
            received.length < 2 + received.readUInt16BE(0))
        )
          return;
        finish(
          valid(dns ? received.subarray(2) : received)
            ? "RECEIVED"
            : "INVALID_RESPONSE",
        );
      });
    } else if (protocol === "udp") {
      socket = dgram.createSocket(net.isIP(address) === 6 ? "udp6" : "udp4");
      socket.on("message", (data) =>
        finish(valid(data) ? "RECEIVED" : "INVALID_RESPONSE"),
      );
      socket.send(payload, port, address);
    } else throw new Error("PROTOCOL");
    socket.on("error", () => finish("SOCKET_ERROR"));
    function valid(data) {
      return dns
        ? data.length > payload.length &&
            data.readUInt16BE(0) === 0x1234 &&
            data.readUInt16BE(6) === 1
        : data.equals(payload);
    }
  });
}

try {
  if (["memory", "cpu", "pids"].includes(mode)) await pressure(mode);
  else if (mode === "boundary") await boundary();
  else if (mode === "attempt")
    report(
      await attempt(process.argv[3], Number(process.argv[4]), process.argv[5]),
    );
  else if (["hold", "term", "ignore-term"].includes(mode)) {
    if (mode === "term")
      process.on("SIGTERM", () => {
        report({ marker: "TERM_ACK" });
        process.exit(0);
      });
    if (mode === "ignore-term")
      process.on("SIGTERM", () => report({ marker: "TERM_IGNORED" }));
    report({ marker: "READY" });
    setTimeout(() => process.exit(25), 540_000);
  } else throw new Error("UNKNOWN_MODE");
} catch {
  report({ marker: "PROBE_FAILED" });
  process.exitCode = 1;
}
