import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMountedGuestSessionKeyProvider } from "../src/guest-session/index.js";

let directory = "";
const first = Buffer.alloc(32, 0x41);
const second = Buffer.alloc(32, 0x42);

function keyring(active = 2) {
  return {
    schema_version: 1,
    active_key_version: active,
    keys: [
      { key_version: 2, key_base64url: second.toString("base64url") },
      { key_version: 1, key_base64url: first.toString("base64url") },
    ],
  };
}

async function writeJson(name: string, value: unknown, mode = 0o600) {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value), { mode });
  await chmod(path, mode);
  return path;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "outscan-guest-keyring-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("mounted Guest session key provider", () => {
  it("freshly loads an active key and retained verification keys", async () => {
    const path = await writeJson("keyring.json", keyring());
    const provider = createMountedGuestSessionKeyProvider({ file_path: path });
    await expect(provider.get_current_keys()).resolves.toEqual({
      active_key_version: 2,
      keys: new Map([
        [2, second],
        [1, first],
      ]),
    });

    await writeFile(
      path,
      JSON.stringify({
        schema_version: 1,
        active_key_version: 3,
        keys: [{ key_version: 3, key_base64url: first.toString("base64url") }],
      }),
    );
    await expect(provider.get_current_keys()).resolves.toEqual({
      active_key_version: 3,
      keys: new Map([[3, first]]),
    });
  });

  it.each([
    { ...keyring(), active_key_version: 3 },
    { ...keyring(), extra: true },
    { ...keyring(), keys: [] },
    {
      ...keyring(),
      keys: [...keyring().keys, keyring().keys[0], keyring().keys[1]],
    },
    {
      ...keyring(),
      keys: [keyring().keys[0], keyring().keys[0]],
    },
    {
      ...keyring(),
      keys: [{ key_version: 2, key_base64url: "not-a-key" }],
    },
  ])("rejects malformed or ambiguous keyrings", async (value) => {
    const path = await writeJson("invalid.json", value);
    await expect(
      createMountedGuestSessionKeyProvider({
        file_path: path,
      }).get_current_keys(),
    ).resolves.toBeNull();
  });

  it("contains missing, oversized and duplicate-key JSON failures", async () => {
    const missing = createMountedGuestSessionKeyProvider({
      file_path: join(directory, "missing.json"),
    });
    await expect(missing.get_current_keys()).resolves.toBeNull();

    const oversized = join(directory, "oversized.json");
    await writeFile(oversized, "x".repeat(4 * 1_024 + 1), { mode: 0o600 });
    await expect(
      createMountedGuestSessionKeyProvider({
        file_path: oversized,
      }).get_current_keys(),
    ).resolves.toBeNull();

    const duplicate = join(directory, "duplicate.json");
    await writeFile(
      duplicate,
      '{"schema_version":1,"schema_version":1,"active_key_version":1,"keys":[]}',
      { mode: 0o600 },
    );
    await expect(
      createMountedGuestSessionKeyProvider({
        file_path: duplicate,
      }).get_current_keys(),
    ).resolves.toBeNull();
  });

  it.runIf(process.platform !== "win32")(
    "rejects symlinks and unsafe Unix permissions",
    async () => {
      const real = await writeJson("real.json", keyring());
      const linked = join(directory, "linked.json");
      await symlink(real, linked);
      await expect(
        createMountedGuestSessionKeyProvider({
          file_path: linked,
        }).get_current_keys(),
      ).resolves.toBeNull();

      await chmod(real, 0o644);
      await expect(
        createMountedGuestSessionKeyProvider({
          file_path: real,
        }).get_current_keys(),
      ).resolves.toBeNull();
    },
  );

  it("rejects relative paths and unknown configuration", () => {
    expect(() =>
      createMountedGuestSessionKeyProvider({ file_path: "keyring.json" }),
    ).toThrow("INVALID_MOUNTED_GUEST_SESSION_KEY_CONFIGURATION");
    expect(() =>
      createMountedGuestSessionKeyProvider({
        file_path: join(directory, "keyring.json"),
        extra: true,
      } as never),
    ).toThrow("INVALID_MOUNTED_GUEST_SESSION_KEY_CONFIGURATION");
  });
});
