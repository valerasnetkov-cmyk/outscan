import { lstat, open } from "node:fs/promises";
import { isAbsolute } from "node:path";

const MAX_PATH_LENGTH = 1_024;
const MAX_JSON_DEPTH = 16;
const KEY_BASE64URL = /^[A-Za-z0-9_-]{43}$/u;

export type MountedFilePermissionPolicy = "INTEGRITY" | "PRIVATE";

export interface MountedFileConfiguration {
  file_path: string;
}

export function exactRecord(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

export function configuredMountedPath(value: unknown): string | null {
  if (!exactRecord(value, ["file_path"])) return null;
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

function permissionsAllowed(
  mode: number,
  policy: MountedFilePermissionPolicy,
): boolean {
  if (process.platform === "win32") return true;
  return policy === "PRIVATE" ? (mode & 0o077) === 0 : (mode & 0o022) === 0;
}

export async function readMountedJsonFile(
  path: string,
  maximumBytes: number,
  permissionPolicy: MountedFilePermissionPolicy,
): Promise<unknown> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) return null;
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
    // One sentinel byte detects growth without an unbounded readFile allocation.
    const bytes = Buffer.alloc(after.size + 1);
    let length = 0;
    while (length < bytes.byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.byteLength - length,
        length,
      );
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const completed = await handle.stat();
    if (
      length !== after.size ||
      completed.size !== after.size ||
      completed.mtimeMs !== after.mtimeMs ||
      completed.ctimeMs !== after.ctimeMs ||
      !permissionsAllowed(completed.mode, permissionPolicy)
    ) {
      return null;
    }
    return parseJsonBytes(bytes.subarray(0, length));
  } finally {
    await handle.close();
  }
}

export function decodeCanonical32ByteKey(value: unknown): Uint8Array | null {
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
