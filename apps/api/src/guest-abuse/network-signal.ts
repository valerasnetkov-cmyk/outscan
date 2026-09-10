import { createHmac } from "node:crypto";

import { parseNetworkAddress } from "./network-address.js";

export const GUEST_NETWORK_SIGNAL_POLICY_ID = "outscan-guest-network-signal-v1";

const DOMAIN = Buffer.from("OUTSCAN:GUEST_ABUSE_NETWORK_SIGNAL:v1\0", "ascii");
const REQUEST_KEYS = ["trusted_ingress_address", "hmac_key"] as const;
const KEYRING_REQUEST_KEYS = [
  "trusted_ingress_address",
  "hmac_keyring",
  "active_key_version",
] as const;
const IPV4_PREFIX = 32;
const IPV6_PREFIX = 64;
const MAX_NETWORK_SIGNAL_KEYS = 3;

export type GuestNetworkSignalResult =
  | {
      ok: true;
      policy_id: typeof GUEST_NETWORK_SIGNAL_POLICY_ID;
      network_signal_digest: string;
    }
  | { ok: false; code: "INVALID_NETWORK_SIGNAL_CONTEXT" };

export type GuestNetworkSignalKeyringResult =
  | {
      ok: true;
      policy_id: typeof GUEST_NETWORK_SIGNAL_POLICY_ID;
      network_signal_digests: readonly string[];
    }
  | { ok: false; code: "INVALID_NETWORK_SIGNAL_CONTEXT" };

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[] = REQUEST_KEYS,
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === expectedKeys.length &&
      keys.every(
        (key) =>
          typeof key === "string" && expectedKeys.some((item) => item === key),
      )
    );
  } catch {
    return false;
  }
}

function bucketAddress(
  address: string,
): { family: 4 | 6; bytes: Buffer } | null {
  const parsed = parseNetworkAddress(address);
  if (!parsed) return null;
  if (parsed.family === 4) return { family: 4, bytes: parsed.bytes };
  const bucket = Buffer.alloc(16);
  parsed.bytes.copy(bucket, 0, 0, IPV6_PREFIX / 8);
  return { family: 6, bytes: bucket };
}

function deriveDigest(address: string, key: Uint8Array): string | null {
  const keyBytes = Buffer.from(key);
  const bucket = bucketAddress(address);
  if (keyBytes.length !== 32 || !bucket) return null;
  const prefix = bucket.family === 4 ? IPV4_PREFIX : IPV6_PREFIX;
  const message = Buffer.concat([
    DOMAIN,
    Buffer.from([bucket.family, prefix]),
    bucket.bytes,
  ]);
  return `hmac-sha256:${createHmac("sha256", keyBytes)
    .update(message)
    .digest("hex")}`;
}

export function deriveGuestNetworkSignal(
  value: unknown,
): GuestNetworkSignalResult {
  if (!exactRecord(value)) {
    return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
  }
  try {
    const address = value.trusted_ingress_address;
    const keyValue = value.hmac_key;
    if (
      typeof address !== "string" ||
      address.length === 0 ||
      address.length > 64 ||
      !(keyValue instanceof Uint8Array)
    ) {
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    }
    const digest = deriveDigest(address, keyValue);
    if (!digest) return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    return Object.freeze({
      ok: true,
      policy_id: GUEST_NETWORK_SIGNAL_POLICY_ID,
      network_signal_digest: digest,
    });
  } catch {
    return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
  }
}

export function deriveGuestNetworkSignalKeyring(
  value: unknown,
): GuestNetworkSignalKeyringResult {
  if (!exactRecord(value, KEYRING_REQUEST_KEYS))
    return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
  try {
    const address = value.trusted_ingress_address;
    const keyring = value.hmac_keyring;
    const activeVersion = value.active_key_version;
    if (
      typeof address !== "string" ||
      !(keyring instanceof Map) ||
      !Number.isInteger(activeVersion) ||
      (activeVersion as number) < 0 ||
      (activeVersion as number) > 0xffff_ffff ||
      keyring.size === 0 ||
      keyring.size > MAX_NETWORK_SIGNAL_KEYS
    )
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    const entries = [...keyring.entries()];
    if (
      entries.some(
        ([version, key]) =>
          !Number.isInteger(version) ||
          version < 0 ||
          version > 0xffff_ffff ||
          !(key instanceof Uint8Array) ||
          key.byteLength !== 32,
      ) ||
      !keyring.has(activeVersion)
    )
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    entries.sort(([left], [right]) =>
      left === activeVersion ? -1 : right === activeVersion ? 1 : right - left,
    );
    const digests = entries.map(([, key]) => deriveDigest(address, key));
    if (
      digests.some((digest) => digest === null) ||
      new Set(digests).size !== digests.length
    )
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    return Object.freeze({
      ok: true,
      policy_id: GUEST_NETWORK_SIGNAL_POLICY_ID,
      network_signal_digests: Object.freeze(digests as string[]),
    });
  } catch {
    return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
  }
}
