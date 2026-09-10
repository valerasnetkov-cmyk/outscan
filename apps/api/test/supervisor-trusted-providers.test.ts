import { describe, expect, it, vi } from "vitest";

import {
  bindResultSigningKeyProviderToVerificationKeyring,
  createValidatedGuestArtifactApprovalProvider,
  createValidatedResultSigningKeyProvider,
} from "../src/supervisor/index.js";

const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function approval(overrides: Record<string, unknown> = {}) {
  return {
    approval_id: "approval_01",
    status: "APPROVED",
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
    ...overrides,
  };
}

describe("trusted supervisor providers", () => {
  it("returns a deeply snapshotted current Guest approval", async () => {
    const raw = approval();
    const provider = createValidatedGuestArtifactApprovalProvider({
      read: () => raw,
    });
    const result = await provider.get_active_approval();

    expect(result).toEqual(raw);
    expect(Object.isFrozen(result)).toBe(true);
    if (!result || typeof result !== "object") throw new Error("approval");
    const artifact = Reflect.get(result, "artifact_identity");
    expect(Object.isFrozen(artifact)).toBe(true);
    expect(
      Object.isFrozen(Reflect.get(artifact, "transitive_dependency_digests")),
    ).toBe(true);

    raw.artifact_identity.transitive_dependency_digests[0] = DIGEST_A;
    expect(Reflect.get(artifact, "transitive_dependency_digests")).toEqual([
      DIGEST_B,
    ]);
  });

  it("freshly loads revocation instead of caching approval", async () => {
    let current = approval();
    const read = vi.fn(() => current);
    const provider = createValidatedGuestArtifactApprovalProvider({ read });

    await expect(provider.get_active_approval()).resolves.toMatchObject({
      status: "APPROVED",
    });
    current = approval({ status: "REVOKED" });
    await expect(provider.get_active_approval()).resolves.toMatchObject({
      status: "REVOKED",
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it.each([
    null,
    approval({ extra: true }),
    approval({ status: "UNKNOWN" }),
    approval({
      artifact_identity: {
        ...approval().artifact_identity,
        extra: true,
      },
    }),
    approval({
      artifact_identity: {
        ...approval().artifact_identity,
        policy_version: "2.0.0",
      },
    }),
    approval({
      artifact_identity: {
        ...approval().artifact_identity,
        profile: "VERIFIED_BASELINE",
      },
    }),
  ])("rejects malformed or non-Guest approval data", async (value) => {
    const provider = createValidatedGuestArtifactApprovalProvider({
      read: () => value,
    });
    await expect(provider.get_active_approval()).resolves.toBeNull();
  });

  it("contains approval source failures and hostile values", async () => {
    const throwingSource = createValidatedGuestArtifactApprovalProvider({
      read: () => {
        throw new Error("provider credential detail");
      },
    });
    await expect(throwingSource.get_active_approval()).resolves.toBeNull();

    const hostile = approval();
    Object.defineProperty(hostile, "status", {
      enumerable: true,
      get: () => {
        throw new Error("hostile provider value");
      },
    });
    await expect(
      createValidatedGuestArtifactApprovalProvider({
        read: () => hostile,
      }).get_active_approval(),
    ).resolves.toBeNull();
  });

  it("copies an exact 256-bit signing key on every read", async () => {
    const key = Buffer.alloc(32, 0x51);
    const provider = createValidatedResultSigningKeyProvider({
      read: () => ({ key_version: 7, key }),
    });
    const first = await provider.get_active_key();
    expect(first).toEqual({ key_version: 7, key });
    if (!first || typeof first !== "object") throw new Error("key");
    const firstBytes = Reflect.get(first, "key") as Uint8Array;
    firstBytes[0] = 0xff;
    expect(key[0]).toBe(0x51);

    const second = await provider.get_active_key();
    expect((Reflect.get(second as object, "key") as Uint8Array)[0]).toBe(0x51);
  });

  it.each([
    null,
    { key_version: 1, key: Buffer.alloc(31) },
    { key_version: 1, key: Buffer.alloc(33) },
    { key_version: -1, key: Buffer.alloc(32) },
    { key_version: 1, key: Buffer.alloc(32), extra: true },
  ])("rejects malformed signing-key material", async (value) => {
    const provider = createValidatedResultSigningKeyProvider({
      read: () => value,
    });
    await expect(provider.get_active_key()).resolves.toBeNull();
  });

  it("binds fresh signing material to the startup verification keyring", async () => {
    let current = { key_version: 7, key: Buffer.alloc(32, 0x51) };
    const provider = bindResultSigningKeyProviderToVerificationKeyring(
      createValidatedResultSigningKeyProvider({ read: () => current }),
      new Map([
        [7, Buffer.alloc(32, 0x51)],
        [6, Buffer.alloc(32, 0x41)],
      ]),
    );
    await expect(provider.get_active_key()).resolves.toEqual(current);
    current = { key_version: 8, key: Buffer.alloc(32, 0x61) };
    await expect(provider.get_active_key()).resolves.toBeNull();
    current = { key_version: 7, key: Buffer.alloc(32, 0x61) };
    await expect(provider.get_active_key()).resolves.toBeNull();
  });

  it("rejects an invalid verification binding", () => {
    const provider = createValidatedResultSigningKeyProvider({
      read: () => ({ key_version: 1, key: Buffer.alloc(32) }),
    });
    expect(() =>
      bindResultSigningKeyProviderToVerificationKeyring(provider, new Map()),
    ).toThrow("INVALID_RESULT_SIGNING_KEY_BINDING");
  });

  it("rejects invalid sources at composition time", () => {
    expect(() =>
      createValidatedGuestArtifactApprovalProvider({} as never),
    ).toThrow("INVALID_GUEST_APPROVAL_SOURCE");
    expect(() =>
      createValidatedResultSigningKeyProvider(null as never),
    ).toThrow("INVALID_RESULT_SIGNING_KEY_SOURCE");
  });
});
