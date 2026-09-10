import { timingSafeEqual } from "node:crypto";

import { SCANNER_POLICY_IDENTITY } from "../scanner-policy/index.js";
import { parseArtifactIdentity } from "./artifact-approval.js";
import type {
  ScannerTemplateApproval,
  ScannerArtifactIdentity,
} from "./model.js";
import type { ResultSigningKeyProvider } from "./runtime-model.js";

const APPROVAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const MAX_KEY_VERSION = 0xffff_ffff;

export interface TrustedValueSource {
  read(): Promise<unknown> | unknown;
}

export interface GuestArtifactApprovalProvider {
  get_active_approval(): Promise<unknown>;
}

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

function sourceReader(value: unknown): (() => Promise<unknown>) | null {
  if (!isRecord(value)) return null;
  try {
    const read = value.read;
    if (typeof read !== "function") return null;
    return () => Promise.resolve().then(() => read.call(value));
  } catch {
    return null;
  }
}

function snapshotArtifact(
  value: unknown,
): Readonly<ScannerArtifactIdentity> | null {
  try {
    const artifact = parseArtifactIdentity(value);
    if (
      !artifact ||
      artifact.policy_id !== SCANNER_POLICY_IDENTITY.policy_id ||
      artifact.policy_version !== SCANNER_POLICY_IDENTITY.policy_version ||
      artifact.profile !== "GUEST_SAFE"
    ) {
      return null;
    }
    return Object.freeze({
      ...artifact,
      transitive_dependency_digests: Object.freeze([
        ...artifact.transitive_dependency_digests,
      ]) as unknown as string[],
    });
  } catch {
    return null;
  }
}

function snapshotApproval(
  value: unknown,
): Readonly<ScannerTemplateApproval> | null {
  if (!exact(value, ["approval_id", "status", "artifact_identity"])) {
    return null;
  }
  try {
    const record = value as Record<string, unknown>;
    const approvalId = record.approval_id;
    const status = record.status;
    const artifact = snapshotArtifact(record.artifact_identity);
    if (
      typeof approvalId !== "string" ||
      !APPROVAL_ID.test(approvalId) ||
      (status !== "APPROVED" && status !== "REVOKED") ||
      !artifact
    ) {
      return null;
    }
    return Object.freeze({
      approval_id: approvalId,
      status,
      artifact_identity: artifact as ScannerArtifactIdentity,
    });
  } catch {
    return null;
  }
}

function snapshotSigningKey(
  value: unknown,
): Readonly<{ key_version: number; key: Uint8Array }> | null {
  if (!exact(value, ["key_version", "key"])) return null;
  try {
    const record = value as Record<string, unknown>;
    const version = record.key_version;
    const key = record.key;
    if (
      !Number.isSafeInteger(version) ||
      (version as number) < 0 ||
      (version as number) > MAX_KEY_VERSION ||
      !(key instanceof Uint8Array) ||
      key.byteLength !== 32
    ) {
      return null;
    }
    return Object.freeze({
      key_version: version as number,
      key: Buffer.from(key),
    });
  } catch {
    return null;
  }
}

export function createValidatedGuestArtifactApprovalProvider(
  source: TrustedValueSource,
): GuestArtifactApprovalProvider {
  const read = sourceReader(source);
  if (!read) throw new Error("INVALID_GUEST_APPROVAL_SOURCE");
  return Object.freeze({
    async get_active_approval() {
      try {
        return snapshotApproval(await read());
      } catch {
        return null;
      }
    },
  });
}

export function createValidatedResultSigningKeyProvider(
  source: TrustedValueSource,
): ResultSigningKeyProvider {
  const read = sourceReader(source);
  if (!read) throw new Error("INVALID_RESULT_SIGNING_KEY_SOURCE");
  return Object.freeze({
    async get_active_key() {
      try {
        return snapshotSigningKey(await read());
      } catch {
        return null;
      }
    },
  });
}

export function bindResultSigningKeyProviderToVerificationKeyring(
  provider: ResultSigningKeyProvider,
  keyring: ReadonlyMap<number, Uint8Array>,
): ResultSigningKeyProvider {
  if (
    typeof provider?.get_active_key !== "function" ||
    !(keyring instanceof Map) ||
    keyring.size < 1 ||
    keyring.size > 3
  ) {
    throw new Error("INVALID_RESULT_SIGNING_KEY_BINDING");
  }
  const trusted = new Map<number, Uint8Array>();
  for (const [version, key] of keyring) {
    if (
      !Number.isSafeInteger(version) ||
      version < 0 ||
      version > MAX_KEY_VERSION ||
      !(key instanceof Uint8Array) ||
      key.byteLength !== 32
    ) {
      throw new Error("INVALID_RESULT_SIGNING_KEY_BINDING");
    }
    trusted.set(version, Buffer.from(key));
  }
  const read = provider.get_active_key.bind(provider);
  return Object.freeze({
    async get_active_key() {
      try {
        const active = snapshotSigningKey(await read());
        const expected = active && trusted.get(active.key_version);
        return active && expected && timingSafeEqual(active.key, expected)
          ? active
          : null;
      } catch {
        return null;
      }
    },
  });
}
