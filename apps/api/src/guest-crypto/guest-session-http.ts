import {
  createGuestSessionCookie,
  GUEST_SESSION_COOKIE_NAME,
  GUEST_SESSION_MAX_AGE_SECONDS,
  type GuestSessionKeyring,
  verifyGuestSessionCookie,
} from "./guest-session.js";

const MAX_COOKIE_HEADER_BYTES = 8_192;
const MAX_COOKIE_PAIRS = 64;
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const COOKIE_VALUE = /^(?:[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e])*$/u;

export const GUEST_SESSION_SET_COOKIE_ATTRIBUTES = Object.freeze([
  `Max-Age=${GUEST_SESSION_MAX_AGE_SECONDS}`,
  "Path=/",
  "Secure",
  "HttpOnly",
  "SameSite=Lax",
] as const);

export type GuestSessionIssueResult =
  | { ok: true; set_cookie: string }
  | { ok: false; code: "GUEST_SESSION_ISSUE_FAILED" };

export interface AuthenticatedGuestSession {
  key_version: number;
  guest_session_scope: string;
}

export type GuestSessionAuthenticationResult =
  | { ok: true; session: AuthenticatedGuestSession }
  | {
      ok: false;
      code:
        | "MISSING_GUEST_SESSION"
        | "INVALID_COOKIE_HEADER"
        | "AMBIGUOUS_GUEST_SESSION"
        | "INVALID_GUEST_SESSION"
        | "REVOKED_GUEST_SESSION";
    };

export type GuestSessionRevocationCheck = (
  guestSessionScope: string,
) => boolean;

function parseGuestCookie(
  header: unknown,
):
  | { kind: "FOUND"; value: string }
  | { kind: "MISSING" }
  | { kind: "INVALID" }
  | { kind: "AMBIGUOUS" } {
  if (header === undefined) return { kind: "MISSING" };
  if (
    typeof header !== "string" ||
    header.length === 0 ||
    Buffer.byteLength(header) > MAX_COOKIE_HEADER_BYTES ||
    /[\0\r\n]/u.test(header)
  ) {
    return { kind: "INVALID" };
  }
  const pairs = header.split(";");
  if (pairs.length > MAX_COOKIE_PAIRS) return { kind: "INVALID" };

  let guestValue: string | null = null;
  for (const rawPair of pairs) {
    const pair = rawPair.replace(/^[\t ]+|[\t ]+$/gu, "");
    const separator = pair.indexOf("=");
    if (separator <= 0) return { kind: "INVALID" };
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!COOKIE_NAME.test(name) || !COOKIE_VALUE.test(value)) {
      return { kind: "INVALID" };
    }
    if (name !== GUEST_SESSION_COOKIE_NAME) continue;
    if (guestValue !== null) return { kind: "AMBIGUOUS" };
    guestValue = value;
  }
  return guestValue === null
    ? { kind: "MISSING" }
    : { kind: "FOUND", value: guestValue };
}

export function issueGuestSessionCookieHeader(
  activeKeyVersion: number,
  activeKey: Uint8Array,
  guestSessionId?: Uint8Array,
): GuestSessionIssueResult {
  try {
    const value = createGuestSessionCookie(
      activeKeyVersion,
      activeKey,
      guestSessionId,
    );
    return {
      ok: true,
      set_cookie: [
        `${GUEST_SESSION_COOKIE_NAME}=${value}`,
        ...GUEST_SESSION_SET_COOKIE_ATTRIBUTES,
      ].join("; "),
    };
  } catch {
    return { ok: false, code: "GUEST_SESSION_ISSUE_FAILED" };
  }
}

export function authenticateGuestSessionCookieHeader(
  cookieHeader: unknown,
  keyring: GuestSessionKeyring,
  isRevoked: GuestSessionRevocationCheck = () => false,
): GuestSessionAuthenticationResult {
  const parsed = parseGuestCookie(cookieHeader);
  if (parsed.kind === "MISSING") {
    return { ok: false, code: "MISSING_GUEST_SESSION" };
  }
  if (parsed.kind === "INVALID") {
    return { ok: false, code: "INVALID_COOKIE_HEADER" };
  }
  if (parsed.kind === "AMBIGUOUS") {
    return { ok: false, code: "AMBIGUOUS_GUEST_SESSION" };
  }

  let principal;
  try {
    principal = verifyGuestSessionCookie(parsed.value, keyring);
  } catch {
    return { ok: false, code: "INVALID_GUEST_SESSION" };
  }
  if (!principal) return { ok: false, code: "INVALID_GUEST_SESSION" };
  try {
    if (isRevoked(principal.guest_session_scope)) {
      return { ok: false, code: "REVOKED_GUEST_SESSION" };
    }
  } catch {
    return { ok: false, code: "INVALID_GUEST_SESSION" };
  }
  return {
    ok: true,
    session: Object.freeze({
      key_version: principal.key_version,
      guest_session_scope: principal.guest_session_scope,
    }),
  };
}
