import {
  configuredMountedPath,
  decodeCanonical32ByteKey,
  exactRecord,
  readMountedJsonFile,
  type MountedFileConfiguration,
} from "../trusted-files/private-json.js";
import type { GuestArtifactApprovalProvider } from "./trusted-providers.js";
import {
  createValidatedGuestArtifactApprovalProvider,
  createValidatedResultSigningKeyProvider,
} from "./trusted-providers.js";
import type { ResultSigningKeyProvider } from "./runtime-model.js";

const APPROVAL_MAX_BYTES = 16 * 1_024;
const SIGNING_KEY_MAX_BYTES = 1_024;
const VERIFICATION_KEYRING_MAX_BYTES = 4 * 1_024;
export type MountedProviderConfiguration = MountedFileConfiguration;

export function createMountedGuestArtifactApprovalProvider(
  configuration: MountedProviderConfiguration,
): GuestArtifactApprovalProvider {
  const path = configuredMountedPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_APPROVAL_CONFIGURATION");
  return createValidatedGuestArtifactApprovalProvider({
    async read() {
      const value = await readMountedJsonFile(
        path,
        APPROVAL_MAX_BYTES,
        "INTEGRITY",
      );
      if (!exactRecord(value, ["schema_version", "approval"])) return null;
      return Reflect.get(value as object, "schema_version") === 1
        ? Reflect.get(value as object, "approval")
        : null;
    },
  });
}

export function createMountedResultSigningKeyProvider(
  configuration: MountedProviderConfiguration,
): ResultSigningKeyProvider {
  const path = configuredMountedPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_SIGNING_KEY_CONFIGURATION");
  return createValidatedResultSigningKeyProvider({
    async read() {
      const value = await readMountedJsonFile(
        path,
        SIGNING_KEY_MAX_BYTES,
        "PRIVATE",
      );
      if (
        !exactRecord(value, [
          "schema_version",
          "key_version",
          "key_base64url",
        ]) ||
        Reflect.get(value as object, "schema_version") !== 1
      ) {
        return null;
      }
      const key = decodeCanonical32ByteKey(
        Reflect.get(value as object, "key_base64url"),
      );
      return key
        ? {
            key_version: Reflect.get(value as object, "key_version"),
            key,
          }
        : null;
    },
  });
}

export async function loadMountedResultVerificationKeyring(
  configuration: MountedProviderConfiguration,
): Promise<ReadonlyMap<number, Uint8Array> | null> {
  const path = configuredMountedPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_KEYRING_CONFIGURATION");
  let value: unknown;
  try {
    value = await readMountedJsonFile(
      path,
      VERIFICATION_KEYRING_MAX_BYTES,
      "PRIVATE",
    );
  } catch {
    return null;
  }
  try {
    if (
      !exactRecord(value, ["schema_version", "keys"]) ||
      Reflect.get(value as object, "schema_version") !== 1
    ) {
      return null;
    }
    const keys = Reflect.get(value as object, "keys");
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > 3) return null;
    const result = new Map<number, Uint8Array>();
    for (const item of keys) {
      if (!exactRecord(item, ["key_version", "key_base64url"])) return null;
      const version = Reflect.get(item as object, "key_version");
      const key = decodeCanonical32ByteKey(
        Reflect.get(item as object, "key_base64url"),
      );
      if (
        !Number.isSafeInteger(version) ||
        (version as number) < 0 ||
        (version as number) > 0xffff_ffff ||
        result.has(version as number) ||
        !key
      ) {
        return null;
      }
      result.set(version as number, Buffer.from(key));
    }
    return result;
  } catch {
    return null;
  }
}
