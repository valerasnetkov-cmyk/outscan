import { createHmac, timingSafeEqual } from "node:crypto";

import {
  ascii,
  decodeCanonicalBase64Url,
  encodeBase64Url,
  lengthPrefix,
  u64be,
} from "./binary.js";

const TOKEN_DOMAIN = ascii("OUTSCAN:GUEST_RESULT_TOKEN:v1\0");
const TOKEN_NONCE_BYTES = 32;
const TOKEN_BYTES = 32;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const METADATA_KEYS = [
  "guest_scan_id",
  "token_version",
  "token_nonce",
  "key_version",
  "result_access_expires_at_unix_seconds",
  "result_access_revoked_at_unix_seconds",
] as const;

export type GuestResultTokenKeyring = ReadonlyMap<number, Uint8Array>;

export interface GuestResultTokenMetadata {
  guest_scan_id: string;
  token_version: bigint;
  token_nonce: Uint8Array;
  key_version: number;
  result_access_expires_at_unix_seconds: bigint;
  result_access_revoked_at_unix_seconds: bigint | null;
}

function isValidKey(key: Uint8Array): boolean {
  return key.byteLength >= 32;
}

function isU32(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function isU64(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= UINT64_MAX;
}

function exactMetadata(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === METADATA_KEYS.length &&
      METADATA_KEYS.every((key) => keys.includes(key))
    );
  } catch {
    return false;
  }
}

export function snapshotGuestResultTokenMetadata(
  value: unknown,
): GuestResultTokenMetadata | null {
  if (!exactMetadata(value)) return null;
  try {
    const input = value as Record<string, unknown>;
    const guestScanId = input.guest_scan_id;
    const tokenVersion = input.token_version;
    const tokenNonce = input.token_nonce;
    const keyVersion = input.key_version;
    const expiresAt = input.result_access_expires_at_unix_seconds;
    const revokedAt = input.result_access_revoked_at_unix_seconds;
    if (
      typeof guestScanId !== "string" ||
      Buffer.byteLength(guestScanId, "utf8") < 1 ||
      Buffer.byteLength(guestScanId, "utf8") > 512 ||
      !isU64(tokenVersion) ||
      !(tokenNonce instanceof Uint8Array) ||
      tokenNonce.byteLength !== TOKEN_NONCE_BYTES ||
      typeof keyVersion !== "number" ||
      !isU32(keyVersion) ||
      !isU64(expiresAt) ||
      !(revokedAt === null || isU64(revokedAt))
    ) {
      return null;
    }
    return Object.freeze({
      guest_scan_id: guestScanId,
      token_version: tokenVersion,
      token_nonce: Buffer.from(tokenNonce),
      key_version: keyVersion,
      result_access_expires_at_unix_seconds: expiresAt,
      result_access_revoked_at_unix_seconds: revokedAt,
    });
  } catch {
    return null;
  }
}

export function encodeGuestResultTokenMessage(
  metadata: Omit<
    GuestResultTokenMetadata,
    "key_version" | "result_access_revoked_at_unix_seconds"
  >,
): Buffer {
  const scanId = Buffer.from(metadata.guest_scan_id, "utf8");
  if (
    scanId.byteLength === 0 ||
    scanId.byteLength > 512 ||
    metadata.token_nonce.byteLength !== TOKEN_NONCE_BYTES
  ) {
    throw new RangeError("Guest result token metadata is invalid.");
  }

  return Buffer.concat([
    TOKEN_DOMAIN,
    lengthPrefix(scanId),
    u64be(metadata.token_version),
    lengthPrefix(metadata.token_nonce),
    u64be(metadata.result_access_expires_at_unix_seconds),
  ]);
}

export function deriveGuestResultToken(
  metadata: GuestResultTokenMetadata,
  key: Uint8Array,
): string {
  if (!isValidKey(key))
    throw new RangeError("Guest result token key is too short.");
  const snapshot = snapshotGuestResultTokenMetadata(metadata);
  if (!snapshot)
    throw new RangeError("Guest result token metadata is invalid.");

  const message = encodeGuestResultTokenMessage(snapshot);
  return encodeBase64Url(createHmac("sha256", key).update(message).digest());
}

export function verifyGuestResultToken(
  suppliedToken: unknown,
  metadata: unknown,
  keyring: GuestResultTokenKeyring,
  nowUnixSeconds: bigint,
): boolean {
  const snapshot = snapshotGuestResultTokenMetadata(metadata);
  if (
    typeof suppliedToken !== "string" ||
    suppliedToken.length !== 43 ||
    !snapshot ||
    typeof nowUnixSeconds !== "bigint" ||
    nowUnixSeconds < 0n ||
    nowUnixSeconds > UINT64_MAX ||
    snapshot.result_access_revoked_at_unix_seconds !== null ||
    nowUnixSeconds >= snapshot.result_access_expires_at_unix_seconds
  ) {
    return false;
  }

  const supplied = decodeCanonicalBase64Url(suppliedToken);
  let key: Uint8Array | undefined;
  try {
    key = keyring.get(snapshot.key_version);
  } catch {
    return false;
  }
  if (
    !supplied ||
    supplied.byteLength !== TOKEN_BYTES ||
    !key ||
    !isValidKey(key)
  ) {
    return false;
  }

  let expected: Buffer;
  try {
    expected = Buffer.from(deriveGuestResultToken(snapshot, key), "base64url");
  } catch {
    return false;
  }
  return timingSafeEqual(supplied, expected);
}
