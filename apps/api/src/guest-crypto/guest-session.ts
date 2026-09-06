import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import {
  ascii,
  decodeCanonicalBase64Url,
  encodeBase64Url,
  u32be,
} from "./binary.js";

const COOKIE_DOMAIN = ascii("OUTSCAN:GUEST_SESSION_COOKIE:v1\0");
const SCOPE_DOMAIN = ascii("OUTSCAN:GUEST_SESSION_SCOPE:v1\0");
const SESSION_BYTES = 32;
const MAC_BYTES = 32;

export const GUEST_SESSION_COOKIE_NAME = "__Host-outscan_guest_session";
export const GUEST_SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

export interface GuestSessionPrincipal {
  key_version: number;
  guest_session_id: Buffer;
  guest_session_scope: string;
}

export type GuestSessionKeyring = ReadonlyMap<number, Uint8Array>;

function isValidKey(key: Uint8Array): boolean {
  return key.byteLength >= 32;
}

export function encodeGuestSessionMessage(
  keyVersion: number,
  guestSessionId: Uint8Array,
): Buffer {
  if (guestSessionId.byteLength !== SESSION_BYTES) {
    throw new RangeError("Guest session ID must contain exactly 32 bytes.");
  }
  return Buffer.concat([
    COOKIE_DOMAIN,
    u32be(keyVersion),
    Buffer.from(guestSessionId),
  ]);
}

export function deriveGuestSessionScope(guestSessionId: Uint8Array): string {
  if (guestSessionId.byteLength !== SESSION_BYTES) {
    throw new RangeError("Guest session ID must contain exactly 32 bytes.");
  }

  const digest = createHash("sha256")
    .update(SCOPE_DOMAIN)
    .update(guestSessionId)
    .digest("hex");
  return `sha256:${digest}`;
}

export function createGuestSessionCookie(
  keyVersion: number,
  key: Uint8Array,
  guestSessionId: Uint8Array = randomBytes(SESSION_BYTES),
): string {
  if (!isValidKey(key)) throw new RangeError("Guest session key is too short.");

  const message = encodeGuestSessionMessage(keyVersion, guestSessionId);
  const mac = createHmac("sha256", key).update(message).digest();
  return [
    "v1",
    String(keyVersion),
    encodeBase64Url(guestSessionId),
    encodeBase64Url(mac),
  ].join(".");
}

export function verifyGuestSessionCookie(
  value: string,
  keyring: GuestSessionKeyring,
): GuestSessionPrincipal | null {
  if (typeof value !== "string") return null;
  if (value.length > 256) return null;

  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;

  const keyVersionText = parts[1];
  if (!keyVersionText || !/^(0|[1-9][0-9]*)$/u.test(keyVersionText))
    return null;

  const keyVersion = Number(keyVersionText);
  if (
    !Number.isSafeInteger(keyVersion) ||
    keyVersion < 0 ||
    keyVersion > 0xffff_ffff
  ) {
    return null;
  }

  const sessionId = decodeCanonicalBase64Url(parts[2] ?? "");
  const suppliedMac = decodeCanonicalBase64Url(parts[3] ?? "");
  let key: Uint8Array | undefined;
  try {
    key = keyring.get(keyVersion);
  } catch {
    return null;
  }
  if (
    !sessionId ||
    sessionId.byteLength !== SESSION_BYTES ||
    !suppliedMac ||
    suppliedMac.byteLength !== MAC_BYTES ||
    !key ||
    !isValidKey(key)
  ) {
    return null;
  }

  const expectedMac = createHmac("sha256", key)
    .update(encodeGuestSessionMessage(keyVersion, sessionId))
    .digest();
  if (!timingSafeEqual(suppliedMac, expectedMac)) return null;

  return {
    key_version: keyVersion,
    guest_session_id: sessionId,
    guest_session_scope: deriveGuestSessionScope(sessionId),
  };
}
