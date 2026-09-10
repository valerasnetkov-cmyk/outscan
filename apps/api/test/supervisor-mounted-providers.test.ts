import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createMountedGuestArtifactApprovalProvider,
  createMountedResultSigningKeyProvider,
  loadMountedResultVerificationKeyring,
} from "../src/supervisor/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;
let directory = "";

function approval(status: "APPROVED" | "REVOKED" = "APPROVED") {
  return {
    schema_version: 1,
    approval: {
      approval_id: "approval_01",
      status,
      artifact_identity: {
        template_workflow_digest: DIGEST_A,
        transitive_dependency_digests: [DIGEST_B],
        engine_version: "scanner-1.0.0",
        scanner_image_digest: DIGEST_B,
        config_version: "config-1",
        policy_id: "outscan-v1",
        policy_version: "1.0.0",
        profile: "GUEST_SAFE",
      },
    },
  };
}

async function writeJson(name: string, value: unknown, mode = 0o600) {
  const path = join(directory, name);
  await writeFile(path, JSON.stringify(value), { mode });
  await chmod(path, mode);
  return path;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "outscan-mounted-provider-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("mounted supervisor providers", () => {
  it("loads a versioned approval and observes revocation", async () => {
    const path = await writeJson("approval.json", approval(), 0o644);
    const provider = createMountedGuestArtifactApprovalProvider({
      file_path: path,
    });
    await expect(provider.get_active_approval()).resolves.toMatchObject({
      status: "APPROVED",
    });

    await writeFile(path, JSON.stringify(approval("REVOKED")));
    await expect(provider.get_active_approval()).resolves.toMatchObject({
      status: "REVOKED",
    });
  });

  it("loads and freshly rotates a canonical private signing key", async () => {
    const first = Buffer.alloc(32, 0x41);
    const second = Buffer.alloc(32, 0x42);
    const path = await writeJson("key.json", {
      schema_version: 1,
      key_version: 7,
      key_base64url: first.toString("base64url"),
    });
    const provider = createMountedResultSigningKeyProvider({ file_path: path });
    await expect(provider.get_active_key()).resolves.toEqual({
      key_version: 7,
      key: first,
    });

    await writeFile(
      path,
      JSON.stringify({
        schema_version: 1,
        key_version: 8,
        key_base64url: second.toString("base64url"),
      }),
    );
    await expect(provider.get_active_key()).resolves.toEqual({
      key_version: 8,
      key: second,
    });
  });

  it("loads a bounded verification keyring and observes rotation", async () => {
    const first = Buffer.alloc(32, 0x41);
    const second = Buffer.alloc(32, 0x42);
    const path = await writeJson("keyring.json", {
      schema_version: 1,
      keys: [
        { key_version: 8, key_base64url: second.toString("base64url") },
        { key_version: 7, key_base64url: first.toString("base64url") },
      ],
    });
    const loaded = await loadMountedResultVerificationKeyring({
      file_path: path,
    });
    expect(loaded).toEqual(
      new Map([
        [8, second],
        [7, first],
      ]),
    );

    await writeFile(
      path,
      JSON.stringify({
        schema_version: 1,
        keys: [{ key_version: 9, key_base64url: first.toString("base64url") }],
      }),
    );
    await expect(
      loadMountedResultVerificationKeyring({ file_path: path }),
    ).resolves.toEqual(new Map([[9, first]]));
  });

  it.each([
    '{"schema_version":1,"schema_version":1,"approval":null}',
    "\ufeff{}",
    "{malformed",
    JSON.stringify({ schema_version: 2, approval: approval().approval }),
    JSON.stringify({ ...approval(), extra: true }),
  ])("rejects malformed approval files", async (contents) => {
    const path = join(directory, "invalid-approval.json");
    await writeFile(path, contents, { mode: 0o600 });
    const provider = createMountedGuestArtifactApprovalProvider({
      file_path: path,
    });
    await expect(provider.get_active_approval()).resolves.toBeNull();
  });

  it.each([
    { schema_version: 1, key_version: 1, key_base64url: "not-a-key" },
    {
      schema_version: 1,
      key_version: 1,
      key_base64url: Buffer.alloc(31).toString("base64url"),
    },
    {
      schema_version: 1,
      key_version: -1,
      key_base64url: Buffer.alloc(32).toString("base64url"),
    },
    {
      schema_version: 1,
      key_version: 1,
      key_base64url: Buffer.alloc(32).toString("base64url"),
      extra: true,
    },
  ])("rejects malformed signing-key files", async (value) => {
    const path = await writeJson("invalid-key.json", value);
    const provider = createMountedResultSigningKeyProvider({ file_path: path });
    await expect(provider.get_active_key()).resolves.toBeNull();
  });

  it.each([
    { schema_version: 1, keys: [] },
    {
      schema_version: 1,
      keys: Array.from({ length: 4 }, (_, key_version) => ({
        key_version,
        key_base64url: Buffer.alloc(32).toString("base64url"),
      })),
    },
    {
      schema_version: 1,
      keys: [
        {
          key_version: 1,
          key_base64url: Buffer.alloc(32).toString("base64url"),
        },
        {
          key_version: 1,
          key_base64url: Buffer.alloc(32).toString("base64url"),
        },
      ],
    },
    {
      schema_version: 1,
      keys: [{ key_version: 1, key_base64url: "invalid" }],
    },
    {
      schema_version: 1,
      keys: [
        {
          key_version: 1,
          key_base64url: Buffer.alloc(32).toString("base64url"),
          extra: true,
        },
      ],
    },
  ])("rejects malformed verification keyrings", async (value) => {
    const path = await writeJson("invalid-keyring.json", value);
    await expect(
      loadMountedResultVerificationKeyring({ file_path: path }),
    ).resolves.toBeNull();
  });

  it("rejects oversized and missing files without exposing file errors", async () => {
    const oversized = join(directory, "oversized.json");
    await writeFile(oversized, "x".repeat(17 * 1_024), { mode: 0o600 });
    await expect(
      createMountedGuestArtifactApprovalProvider({
        file_path: oversized,
      }).get_active_approval(),
    ).resolves.toBeNull();
    await expect(
      createMountedResultSigningKeyProvider({
        file_path: join(directory, "missing.json"),
      }).get_active_key(),
    ).resolves.toBeNull();
    await expect(
      loadMountedResultVerificationKeyring({ file_path: oversized }),
    ).resolves.toBeNull();
  });

  it.runIf(process.platform !== "win32")(
    "rejects symlinks and unsafe Unix permissions",
    async () => {
      const approvalPath = await writeJson("real-approval.json", approval());
      const linked = join(directory, "linked-approval.json");
      await symlink(approvalPath, linked);
      await expect(
        createMountedGuestArtifactApprovalProvider({
          file_path: linked,
        }).get_active_approval(),
      ).resolves.toBeNull();

      const keyPath = await writeJson("public-key.json", {
        schema_version: 1,
        key_version: 1,
        key_base64url: Buffer.alloc(32).toString("base64url"),
      });
      await chmod(keyPath, 0o644);
      await expect(
        createMountedResultSigningKeyProvider({
          file_path: keyPath,
        }).get_active_key(),
      ).resolves.toBeNull();
      await expect(
        loadMountedResultVerificationKeyring({ file_path: linked }),
      ).resolves.toBeNull();
    },
  );

  it("rejects relative paths and unknown configuration", async () => {
    expect(() =>
      createMountedGuestArtifactApprovalProvider({
        file_path: "approval.json",
      }),
    ).toThrow("INVALID_MOUNTED_APPROVAL_CONFIGURATION");
    expect(() =>
      createMountedResultSigningKeyProvider({
        file_path: join(directory, "key.json"),
        extra: true,
      } as never),
    ).toThrow("INVALID_MOUNTED_SIGNING_KEY_CONFIGURATION");
    await expect(
      loadMountedResultVerificationKeyring({ file_path: "keyring.json" }),
    ).rejects.toThrow("INVALID_MOUNTED_KEYRING_CONFIGURATION");
  });
});
