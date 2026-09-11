import {
  configuredMountedPath,
  decodeCanonical32ByteKey,
  exactRecord,
  readMountedJsonFile,
  type MountedFileConfiguration,
} from "../trusted-files/private-json.js";
import type { GuestSessionKeyProvider } from "./bootstrap.js";

const KEYRING_MAX_BYTES = 4 * 1_024;
const MAX_KEY_VERSION = 0xffff_ffff;

export type MountedGuestSessionKeyConfiguration = MountedFileConfiguration;

function validVersion(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_KEY_VERSION
  );
}

async function loadKeyring(path: string): Promise<Readonly<{
  active_key_version: number;
  keys: ReadonlyMap<number, Uint8Array>;
}> | null> {
  let value: unknown;
  try {
    value = await readMountedJsonFile(path, KEYRING_MAX_BYTES, "PRIVATE");
  } catch {
    return null;
  }
  try {
    if (
      !exactRecord(value, ["schema_version", "active_key_version", "keys"]) ||
      Reflect.get(value as object, "schema_version") !== 1
    ) {
      return null;
    }
    const activeVersion = Reflect.get(value as object, "active_key_version");
    const suppliedKeys = Reflect.get(value as object, "keys");
    if (
      !validVersion(activeVersion) ||
      !Array.isArray(suppliedKeys) ||
      suppliedKeys.length < 1 ||
      suppliedKeys.length > 3
    ) {
      return null;
    }
    const keys = new Map<number, Uint8Array>();
    for (const item of suppliedKeys) {
      if (!exactRecord(item, ["key_version", "key_base64url"])) return null;
      const version = Reflect.get(item as object, "key_version");
      const key = decodeCanonical32ByteKey(
        Reflect.get(item as object, "key_base64url"),
      );
      if (!validVersion(version) || keys.has(version) || !key) return null;
      keys.set(version, Buffer.from(key));
    }
    return keys.has(activeVersion)
      ? Object.freeze({ active_key_version: activeVersion, keys })
      : null;
  } catch {
    return null;
  }
}

export function createMountedGuestSessionKeyProvider(
  configuration: MountedGuestSessionKeyConfiguration,
): GuestSessionKeyProvider {
  const path = configuredMountedPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_GUEST_SESSION_KEY_CONFIGURATION");
  return Object.freeze({
    get_current_keys: () => loadKeyring(path),
  });
}
