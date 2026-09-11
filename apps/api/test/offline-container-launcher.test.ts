import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUDGET_CEILINGS } from "../src/scanner-policy/index.js";

const fake = vi.hoisted(() => ({ command: vi.fn(), attach: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  Object.defineProperty(fake.command, promisify.custom, {
    value: (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        fake.command(
          ...args,
          (error: Error | null, stdout: string, stderr: string) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
          },
        );
      }),
  });
  return { execFile: fake.command };
});
vi.mock("../src/supervisor/process-launcher.js", async (original) => ({
  ...(await original<typeof import("../src/supervisor/process-launcher.js")>()),
  createFixedScannerProcessLauncher: () => ({ launch: fake.attach }),
}));

import { createOfflineContainerLauncher } from "../src/supervisor/offline-container-launcher.js";

const id = "a".repeat(64);
const artifact = {
  template_workflow_digest: `sha256:${"b".repeat(64)}`,
  transitive_dependency_digests: [],
  engine_version: "offline-test",
  scanner_image_digest: `sha256:${"c".repeat(64)}`,
  config_version: "offline-1",
  policy_id: "outscan-v1",
  policy_version: "1.0.0",
  profile: "GUEST_SAFE",
};
const configuration = {
  docker_executable: process.execPath,
  working_directory: process.cwd(),
  artifact_identity: artifact,
};
const plan = {
  schema_version: 1 as const,
  artifact_identity: artifact,
  scanner_input: {
    schema_version: 1 as const,
    canonical_target: "example.com",
    policy: {
      schema_version: 1 as const,
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile: "GUEST_SAFE" as const,
      requested_capabilities: ["DNS_READ" as const],
      budgets: { ...BUDGET_CEILINGS.GUEST_SAFE },
    },
  },
};

function harness(mode = "OK") {
  let present = false;
  let name = "";
  let run = "";
  const calls: string[][] = [];
  fake.command.mockImplementation((_file, args, options, callback) => {
    calls.push(args);
    expect(options.env).toEqual({});
    expect(options.shell).toBe(false);
    const operation = args[2];
    let stdout = "";
    if (operation === "create") {
      name = args[args.indexOf("--name") + 1];
      run = args[args.indexOf("--label") + 1].split("=")[1];
      present = true;
      stdout = id;
    } else if (operation === "inspect") {
      stdout = JSON.stringify({
        Id: id,
        Name: `/${name}`,
        Image: artifact.scanner_image_digest,
        Config: {
          User: "1000:1000",
          Labels: {
            "outscan.offline-launch": mode === "FOREIGN" ? "wrong" : run,
          },
        },
        HostConfig: {
          NetworkMode: mode === "NETWORK" ? "host" : "none",
          ReadonlyRootfs: true,
        },
        Mounts: [],
      });
    } else if (operation === "ps") stdout = present ? id : "";
    else if (operation === "rm") {
      if (mode === "CLEANUP_ERROR")
        return callback(new Error("private-canary"), "", "");
      present = false;
    }
    callback(null, stdout, "");
  });
  fake.attach.mockResolvedValue({
    stdout: {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from("frame");
      },
    },
    wait: async () => ({ exit_code: 0, signal: null }),
    stop: vi.fn(),
  });
  return calls;
}

beforeEach(() => vi.resetAllMocks());

describe("offline container launcher", () => {
  it("fixes isolation options and removes the run-owned container on completion", async () => {
    const calls = harness();
    const handle = (await createOfflineContainerLauncher(configuration).launch(
      plan,
    )) as { wait(): Promise<unknown> };
    await expect(handle.wait()).resolves.toEqual({
      exit_code: 0,
      signal: null,
    });
    expect(calls[0]).toEqual(
      expect.arrayContaining([
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--pull",
        "never",
        artifact.scanner_image_digest,
      ]),
    );
    expect(calls.some((args) => args[2] === "rm" && args.at(-1) === id)).toBe(
      true,
    );
    expect(fake.attach.mock.calls[0]?.[0].scanner_input).toEqual(
      plan.scanner_input,
    );
  });
  it.each(["NETWORK", "FOREIGN"])(
    "rejects inspected %s drift before attach",
    async (mode) => {
      const calls = harness(mode);
      await expect(
        createOfflineContainerLauncher(configuration).launch(plan),
      ).rejects.toThrow(/OFFLINE_CONTAINER_/);
      expect(fake.attach).not.toHaveBeenCalled();
      if (mode === "FOREIGN")
        expect(calls.some((args) => args[2] === "rm")).toBe(false);
    },
  );
  it("cleans up attach failure without exposing errors", async () => {
    const calls = harness();
    fake.attach.mockRejectedValueOnce(new Error("private-canary"));
    await expect(
      createOfflineContainerLauncher(configuration).launch(plan),
    ).rejects.toThrow("OFFLINE_CONTAINER_LAUNCH_FAILED");
    expect(calls.some((args) => args[2] === "rm")).toBe(true);
  });
  it("does not acknowledge completion when cleanup fails", async () => {
    harness("CLEANUP_ERROR");
    const handle = (await createOfflineContainerLauncher(configuration).launch(
      plan,
    )) as { wait(): Promise<unknown> };
    await expect(handle.wait()).rejects.toThrow();
  });
  it("rejects crossed artifacts before Docker access", async () => {
    harness();
    await expect(
      createOfflineContainerLauncher(configuration).launch({
        ...plan,
        artifact_identity: {
          ...artifact,
          scanner_image_digest: `sha256:${"d".repeat(64)}`,
        },
      }),
    ).rejects.toThrow("OFFLINE_CONTAINER_LAUNCH_DENIED");
    expect(fake.command).not.toHaveBeenCalled();
  });
  it("targets container identity for KILL and rejects unknown stop signals", async () => {
    const calls = harness();
    let complete!: (value: unknown) => void;
    const exit = new Promise((resolve) => {
      complete = resolve;
    });
    fake.attach.mockResolvedValue({
      stdout: {},
      wait: () => exit,
      stop: vi.fn(),
    });
    const handle = (await createOfflineContainerLauncher(configuration).launch(
      plan,
    )) as { wait(): Promise<unknown>; stop(signal: string): Promise<void> };
    await expect(handle.stop("RESTART")).rejects.toThrow(
      "OFFLINE_CONTAINER_STOP_DENIED",
    );
    await handle.stop("KILL");
    expect(calls.some((args) => args[2] === "rm" && args.at(-1) === id)).toBe(
      true,
    );
    complete({ exit_code: 137, signal: null });
    await handle.wait();
    await handle.stop("KILL");
    expect(calls.filter((args) => args[2] === "rm")).toHaveLength(1);
  });
  it.each([
    { ...configuration, network: "bridge" },
    { ...configuration, docker_executable: "docker" },
    { ...configuration, artifact_identity: { ...artifact, profile: "ACTIVE" } },
  ])("rejects unsafe configuration", (value) => {
    expect(() => createOfflineContainerLauncher(value)).toThrow(
      "INVALID_OFFLINE_CONTAINER_CONFIGURATION",
    );
  });
});
