import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";

import type { GuestArtifactApprovalProvider } from "./trusted-providers.js";
import {
  createValidatedGuestArtifactApprovalProvider,
  createValidatedResultSigningKeyProvider,
} from "./trusted-providers.js";
import type { ResultSigningKeyProvider } from "./runtime-model.js";

const APPROVAL_MAX_BYTES = 16 * 1_024;
const SIGNING_KEY_MAX_BYTES = 1_024;
const VERIFICATION_KEYRING_MAX_BYTES = 4 * 1_024;
const MAX_PATH_LENGTH = 1_024;
const MAX_JSON_DEPTH = 16;
const KEY_BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

export interface MountedProviderConfiguration {
  file_path: string;
}

type PermissionPolicy = "INTEGRITY" | "PRIVATE";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function configuredPath(value: unknown): string | null {
  if (!exact(value, ["file_path"])) return null;
  try {
    const path = Reflect.get(value as object, "file_path");
    return typeof path === "string" &&
      path.length > 0 &&
      path.length <= MAX_PATH_LENGTH &&
      !path.includes("\0") &&
      isAbsolute(path)
      ? path
      : null;
  } catch {
    return null;
  }
}

function hasUniqueJsonKeys(text: string): boolean {
  const stack: Array<
    { kind: "array" } | { kind: "object"; keys: Set<string> }
  > = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      stack.push({ kind: "object", keys: new Set() });
      if (stack.length > MAX_JSON_DEPTH) return false;
      continue;
    }
    if (character === "[") {
      stack.push({ kind: "array" });
      if (stack.length > MAX_JSON_DEPTH) return false;
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      continue;
    }
    if (character !== '"') continue;
    const start = index;
    let escaped = false;
    for (index += 1; index < text.length; index += 1) {
      const current = text[index];
      if (escaped) escaped = false;
      else if (current === "\\") escaped = true;
      else if (current === '"') break;
    }
    if (index >= text.length) return false;
    let next = index + 1;
    while (/\s/u.test(text[next] ?? "")) next += 1;
    const context = stack.at(-1);
    if (text[next] !== ":" || context?.kind !== "object") continue;
    let key: unknown;
    try {
      key = JSON.parse(text.slice(start, index + 1));
    } catch {
      return false;
    }
    if (typeof key !== "string" || context.keys.has(key)) return false;
    context.keys.add(key);
  }
  return stack.length === 0;
}

function parseJsonBytes(value: Uint8Array): unknown | null {
  if (
    value.byteLength >= 3 &&
    value[0] === 0xef &&
    value[1] === 0xbb &&
    value[2] === 0xbf
  ) {
    return null;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(value);
    if (!hasUniqueJsonKeys(text)) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function permissionsAllowed(mode: number, policy: PermissionPolicy): boolean {
  if (process.platform === "win32") return true;
  return policy === "PRIVATE" ? (mode & 0o077) === 0 : (mode & 0o022) === 0;
}

async function readJsonFile(
  path: string,
  maximumBytes: number,
  permissionPolicy: PermissionPolicy,
): Promise<unknown> {
  const before = await lstat(path);
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    !Number.isSafeInteger(before.size) ||
    before.size < 1 ||
    before.size > maximumBytes ||
    !permissionsAllowed(before.mode, permissionPolicy)
  ) {
    return null;
  }
  const handle = await open(path, "r");
  try {
    const after = await handle.stat();
    if (
      !after.isFile() ||
      after.dev !== before.dev ||
      after.ino !== before.ino ||
      after.size !== before.size ||
      !permissionsAllowed(after.mode, permissionPolicy)
    ) {
      return null;
    }
    const bytes = await handle.readFile();
    return bytes.byteLength === after.size ? parseJsonBytes(bytes) : null;
  } finally {
    await handle.close();
  }
}

function decodeSigningKey(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !KEY_BASE64URL.test(value)) return null;
  try {
    const key = Buffer.from(value, "base64url");
    return key.byteLength === 32 && key.toString("base64url") === value
      ? key
      : null;
  } catch {
    return null;
  }
}

export function createMountedGuestArtifactApprovalProvider(
  configuration: MountedProviderConfiguration,
): GuestArtifactApprovalProvider {
  const path = configuredPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_APPROVAL_CONFIGURATION");
  return createValidatedGuestArtifactApprovalProvider({
    async read() {
      const value = await readJsonFile(path, APPROVAL_MAX_BYTES, "INTEGRITY");
      if (!exact(value, ["schema_version", "approval"])) return null;
      return Reflect.get(value as object, "schema_version") === 1
        ? Reflect.get(value as object, "approval")
        : null;
    },
  });
}

export function createMountedResultSigningKeyProvider(
  configuration: MountedProviderConfiguration,
): ResultSigningKeyProvider {
  const path = configuredPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_SIGNING_KEY_CONFIGURATION");
  return createValidatedResultSigningKeyProvider({
    async read() {
      const value = await readJsonFile(path, SIGNING_KEY_MAX_BYTES, "PRIVATE");
      if (
        !exact(value, ["schema_version", "key_version", "key_base64url"]) ||
        Reflect.get(value as object, "schema_version") !== 1
      ) {
        return null;
      }
      const key = decodeSigningKey(
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
  const path = configuredPath(configuration);
  if (!path) throw new Error("INVALID_MOUNTED_KEYRING_CONFIGURATION");
  let value: unknown;
  try {
    value = await readJsonFile(path, VERIFICATION_KEYRING_MAX_BYTES, "PRIVATE");
  } catch {
    return null;
  }
  try {
    if (
      !exact(value, ["schema_version", "keys"]) ||
      Reflect.get(value as object, "schema_version") !== 1
    ) {
      return null;
    }
    const keys = Reflect.get(value as object, "keys");
    if (!Array.isArray(keys) || keys.length < 1 || keys.length > 3) return null;
    const result = new Map<number, Uint8Array>();
    for (const item of keys) {
      if (!exact(item, ["key_version", "key_base64url"])) return null;
      const version = Reflect.get(item as object, "key_version");
      const key = decodeSigningKey(
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
