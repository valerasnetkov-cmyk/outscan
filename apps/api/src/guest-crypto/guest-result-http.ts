import {
  snapshotGuestResultTokenMetadata,
  type GuestResultTokenKeyring,
  verifyGuestResultToken,
} from "./result-token.js";

const MAX_RESULT_WINDOW_SECONDS = 30n * 60n;
const REQUEST_KEYS = [
  "authorization_header",
  "route_guest_scan_id",
  "query",
  "now_unix_seconds",
] as const;
const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/iu;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export const GUEST_RESULT_SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
} as const);

export interface GuestResultAccessRequest {
  authorization_header: unknown;
  route_guest_scan_id: string;
  query: Readonly<Record<string, never>>;
  now_unix_seconds: bigint;
}

export type GuestResultAccessResult =
  | {
      ok: true;
      access: {
        guest_scan_id: string;
        result_access_expires_at_unix_seconds: bigint;
        result_token_expires_in_seconds: number;
        response_headers: typeof GUEST_RESULT_SECURITY_HEADERS;
      };
    }
  | {
      ok: false;
      code: "INVALID_RESULT_REQUEST" | "RESULT_ACCESS_DENIED";
    };

function exactObject(value: unknown, keys: readonly string[]): boolean {
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

function emptyQuery(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const prototype = Reflect.getPrototypeOf(value);
    return (
      (prototype === Object.prototype || prototype === null) &&
      Reflect.ownKeys(value).length === 0
    );
  } catch {
    return false;
  }
}

function parseRequest(value: unknown): GuestResultAccessRequest | null {
  if (!exactObject(value, REQUEST_KEYS)) return null;
  try {
    const input = value as Record<string, unknown>;
    const authorizationHeader = input.authorization_header;
    const routeGuestScanId = input.route_guest_scan_id;
    const query = input.query;
    const nowUnixSeconds = input.now_unix_seconds;
    if (
      typeof routeGuestScanId !== "string" ||
      Buffer.byteLength(routeGuestScanId, "utf8") < 1 ||
      Buffer.byteLength(routeGuestScanId, "utf8") > 512 ||
      !emptyQuery(query) ||
      typeof nowUnixSeconds !== "bigint" ||
      nowUnixSeconds < 0n ||
      nowUnixSeconds > UINT64_MAX
    ) {
      return null;
    }
    return Object.freeze({
      authorization_header: authorizationHeader,
      route_guest_scan_id: routeGuestScanId,
      query: Object.freeze({}),
      now_unix_seconds: nowUnixSeconds,
    });
  } catch {
    return null;
  }
}

export function authorizeGuestResultAccess(
  requestValue: unknown,
  metadataValue: unknown,
  keyring: GuestResultTokenKeyring,
): GuestResultAccessResult {
  const request = parseRequest(requestValue);
  if (!request) return { ok: false, code: "INVALID_RESULT_REQUEST" };
  if (
    typeof request.authorization_header !== "string" ||
    request.authorization_header.length > 128
  ) {
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  }
  const match = BEARER.exec(request.authorization_header);
  if (!match) return { ok: false, code: "RESULT_ACCESS_DENIED" };
  const token = match[1]!;
  const metadata = snapshotGuestResultTokenMetadata(metadataValue);
  if (
    !metadata ||
    metadata.guest_scan_id !== request.route_guest_scan_id ||
    metadata.result_access_expires_at_unix_seconds <=
      request.now_unix_seconds ||
    metadata.result_access_expires_at_unix_seconds - request.now_unix_seconds >
      MAX_RESULT_WINDOW_SECONDS
  ) {
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  }
  if (
    !verifyGuestResultToken(token, metadata, keyring, request.now_unix_seconds)
  ) {
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  }
  return {
    ok: true,
    access: Object.freeze({
      guest_scan_id: metadata.guest_scan_id,
      result_access_expires_at_unix_seconds:
        metadata.result_access_expires_at_unix_seconds,
      result_token_expires_in_seconds: Number(
        metadata.result_access_expires_at_unix_seconds -
          request.now_unix_seconds,
      ),
      response_headers: GUEST_RESULT_SECURITY_HEADERS,
    }),
  };
}
