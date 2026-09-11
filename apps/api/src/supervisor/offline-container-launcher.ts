import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { promisify } from "node:util";

import { parseArtifactIdentity } from "./artifact-approval.js";
import {
  createFixedScannerProcessLauncher,
  encodeApprovedScannerInput,
} from "./process-launcher.js";
import type { ScannerArtifactIdentity } from "./model.js";
import type {
  ScannerProcessHandle,
  ScannerProcessLauncher,
  ScannerLaunchPlan,
} from "./runtime-model.js";

const execute = promisify(execFile);
const LABEL = "outscan.offline-launch";
const MAX_LIFETIME_MS = 35_000;
const RUNTIME = JSON.stringify({
  schema_version: 1,
  dns: {
    servers: ["127.0.0.1:9"],
    timeout_ms: 100,
    tries: 1,
    max_timeout_ms: 100,
  },
  configured_internal_cidrs: [],
});

export interface OfflineContainerConfiguration {
  docker_executable: string;
  working_directory: string;
  artifact_identity: ScannerArtifactIdentity;
}

// Host-side, offline-only adapter. Never give its Docker authority to a scanner.
export function createOfflineContainerLauncher(
  raw: OfflineContainerConfiguration,
): ScannerProcessLauncher {
  let configuration: OfflineContainerConfiguration;
  try {
    if (
      Reflect.ownKeys(raw).sort().join(",") !==
      "artifact_identity,docker_executable,working_directory"
    )
      throw new Error();
    const artifact = parseArtifactIdentity(raw.artifact_identity);
    for (const path of [raw.docker_executable, raw.working_directory]) {
      if (
        typeof path !== "string" ||
        !isAbsolute(path) ||
        path.length > 2048 ||
        /[\u0000-\u001f\u007f]/u.test(path)
      )
        throw new Error();
    }
    if (!artifact || artifact.profile !== "GUEST_SAFE") throw new Error();
    configuration = {
      docker_executable: raw.docker_executable,
      working_directory: raw.working_directory,
      artifact_identity: structuredClone(artifact),
    };
  } catch {
    throw new Error("INVALID_OFFLINE_CONTAINER_CONFIGURATION");
  }
  const endpoint =
    process.platform === "win32"
      ? "npipe:////./pipe/dockerDesktopLinuxEngine"
      : "unix:///var/run/docker.sock";
  const base = ["--host", endpoint];
  async function docker(args: string[]): Promise<string> {
    try {
      const result = await execute(
        configuration.docker_executable,
        [...base, ...args],
        {
          cwd: configuration.working_directory,
          env: {},
          shell: false,
          windowsHide: true,
          timeout: 5_000,
          maxBuffer: 32 * 1024,
        },
      );
      return result.stdout.trim();
    } catch {
      throw new Error("OFFLINE_CONTAINER_COMMAND_FAILED");
    }
  }
  return Object.freeze({
    async launch(plan: Readonly<ScannerLaunchPlan>) {
      const bytes = encodeApprovedScannerInput(
        plan,
        configuration.artifact_identity,
      );
      if (!bytes) throw new Error("OFFLINE_CONTAINER_LAUNCH_DENIED");
      // Use the validated snapshot again during attach, never reread caller data.
      const snapshot = {
        schema_version: 1 as const,
        artifact_identity: configuration.artifact_identity,
        scanner_input: JSON.parse(Buffer.from(bytes).toString("utf8")),
      };
      const run = randomUUID();
      const name = `outscan-offline-${run}`;
      let id: string | undefined;
      let removal: Promise<void> | undefined;
      let timer: NodeJS.Timeout | undefined;
      let attached: ScannerProcessHandle | undefined;
      async function owned() {
        const record = JSON.parse(
          await docker(["inspect", name, "--format", "{{json .}}"]),
        );
        if (
          record.Name !== `/${name}` ||
          record.Config?.Labels?.[LABEL] !== run ||
          !/^[a-f0-9]{64}$/u.test(record.Id) ||
          (id && record.Id !== id)
        )
          throw new Error("OFFLINE_CONTAINER_IDENTITY_DENIED");
        return record;
      }
      function remove(): Promise<void> {
        removal ??= (async () => {
          const matches = await docker([
            "ps",
            "-a",
            "--filter",
            `label=${LABEL}=${run}`,
            "--format",
            "{{.ID}}",
          ]);
          if (matches === "") return;
          const record = await owned();
          await docker(["rm", "--force", record.Id]);
          if (
            (await docker([
              "ps",
              "-a",
              "--filter",
              `label=${LABEL}=${run}`,
              "--format",
              "{{.ID}}",
            ])) !== ""
          )
            throw new Error("OFFLINE_CONTAINER_CLEANUP_FAILED");
        })();
        return removal;
      }
      try {
        const created = await docker([
          "create",
          "--pull",
          "never",
          "--name",
          name,
          "--label",
          `${LABEL}=${run}`,
          "--interactive",
          "--init",
          "--network",
          "none",
          "--read-only",
          "--user",
          "1000:1000",
          "--cap-drop",
          "ALL",
          "--security-opt",
          "no-new-privileges:true",
          "--pids-limit",
          "64",
          "--memory",
          "256m",
          "--cpus",
          "0.5",
          "--restart",
          "no",
          "--log-driver",
          "none",
          "--workdir",
          "/app",
          "--entrypoint",
          "/usr/local/bin/node",
          configuration.artifact_identity.scanner_image_digest,
          "/app/apps/api/dist/guest-scanner-cli.js",
          RUNTIME,
        ]);
        if (!/^[a-f0-9]{64}$/u.test(created)) throw new Error();
        id = created;
        const record = await owned();
        if (
          record.Image !==
            configuration.artifact_identity.scanner_image_digest ||
          record.HostConfig.NetworkMode !== "none" ||
          record.HostConfig.ReadonlyRootfs !== true ||
          record.Config.User !== "1000:1000" ||
          record.Mounts.length !== 0
        )
          throw new Error();
        timer = setTimeout(() => {
          void remove().catch(() => {});
          void attached?.stop("KILL");
        }, MAX_LIFETIME_MS);
        timer.unref();
        attached = (await createFixedScannerProcessLauncher({
          executable_path: configuration.docker_executable,
          arguments: [...base, "start", "--attach", "--interactive", id],
          working_directory: configuration.working_directory,
          artifact_identity: configuration.artifact_identity,
        }).launch(snapshot)) as ScannerProcessHandle;
        const processHandle = attached;
        const completion = (async () => {
          try {
            const outcome = await processHandle.wait();
            await remove();
            return outcome;
          } finally {
            if (timer) clearTimeout(timer);
          }
        })();
        // The caller may start consuming stdout before awaiting completion.
        void completion.catch(() => {});
        return Object.freeze({
          stdout: processHandle.stdout,
          wait: () => completion,
          async stop(signal: "TERM" | "KILL") {
            if (signal !== "TERM" && signal !== "KILL")
              throw new Error("OFFLINE_CONTAINER_STOP_DENIED");
            if (removal) return removal;
            if (signal === "KILL") return remove();
            await owned();
            await docker(["kill", "--signal", "TERM", id!]);
          },
        });
      } catch {
        if (timer) clearTimeout(timer);
        await remove().catch(() => {
          throw new Error("OFFLINE_CONTAINER_CLEANUP_FAILED");
        });
        throw new Error("OFFLINE_CONTAINER_LAUNCH_FAILED");
      }
    },
  });
}
