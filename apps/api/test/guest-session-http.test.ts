import { describe, expect, it } from "vitest";

import {
  authenticateGuestSessionCookieHeader,
  createGuestSessionCookie,
  deriveGuestSessionScope,
  GUEST_SESSION_COOKIE_NAME,
  GUEST_SESSION_MAX_AGE_SECONDS,
  issueGuestSessionCookieHeader,
} from "../src/guest-crypto/index.js";

const KEY = Buffer.alloc(32, 0x11);
const NEXT_KEY = Buffer.alloc(32, 0x22);
const SESSION_ID = Buffer.from(Array.from({ length: 32 }, (_, index) => index));
const SCOPE = deriveGuestSessionScope(SESSION_ID);

function value(keyVersion = 7, key = KEY) {
  return createGuestSessionCookie(keyVersion, key, SESSION_ID);
}

function header(cookieValue = value()) {
  return `theme=dark; ${GUEST_SESSION_COOKIE_NAME}=${cookieValue}; locale=ru`;
}

describe("Guest session HTTP cookie boundary", () => {
  it("issues the exact host-only secure cookie contract", () => {
    expect(issueGuestSessionCookieHeader(7, KEY, SESSION_ID)).toEqual({
      ok: true,
      set_cookie:
        `${GUEST_SESSION_COOKIE_NAME}=${value()}; ` +
        `Max-Age=${GUEST_SESSION_MAX_AGE_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Lax`,
    });
    const issued = issueGuestSessionCookieHeader(7, KEY, SESSION_ID);
    if (!issued.ok) throw new Error("Expected issued cookie.");
    expect(issued.set_cookie).not.toMatch(/(?:^|;)\s*Domain=/iu);
  });

  it("authenticates the target cookie and returns no raw session ID", () => {
    const result = authenticateGuestSessionCookieHeader(
      header(),
      new Map([[7, KEY]]),
    );
    expect(result).toEqual({
      ok: true,
      session: {
        key_version: 7,
        guest_session_scope: SCOPE,
      },
    });
    expect(JSON.stringify(result)).not.toContain(
      SESSION_ID.toString("base64url"),
    );
    if (!result.ok) throw new Error("Expected authenticated session.");
    expect(Object.isFrozen(result.session)).toBe(true);
  });

  it.each([undefined, "unrelated=value"])(
    "distinguishes a missing Guest cookie in %s",
    (cookieHeader) => {
      expect(
        authenticateGuestSessionCookieHeader(cookieHeader, new Map([[7, KEY]])),
      ).toEqual({ ok: false, code: "MISSING_GUEST_SESSION" });
    },
  );

  it.each([
    "",
    "missing-separator",
    "=missing-name",
    "bad name=value",
    'name=quoted"value',
    "name=value,merged=header",
    "name=value;",
    `name=${"a".repeat(8_193)}`,
  ])("rejects malformed or ambiguous Cookie syntax", (cookieHeader) => {
    expect(
      authenticateGuestSessionCookieHeader(cookieHeader, new Map([[7, KEY]])),
    ).toEqual({ ok: false, code: "INVALID_COOKIE_HEADER" });
  });

  it("rejects non-string and excessive cookie-pair input", () => {
    expect(
      authenticateGuestSessionCookieHeader([header()], new Map([[7, KEY]])),
    ).toEqual({ ok: false, code: "INVALID_COOKIE_HEADER" });
    expect(
      authenticateGuestSessionCookieHeader(
        Array.from({ length: 65 }, (_, index) => `c${index}=x`).join(";"),
        new Map([[7, KEY]]),
      ),
    ).toEqual({ ok: false, code: "INVALID_COOKIE_HEADER" });
  });

  it("rejects duplicate Guest cookie names even when values match", () => {
    expect(
      authenticateGuestSessionCookieHeader(
        `${GUEST_SESSION_COOKIE_NAME}=${value()}; ${GUEST_SESSION_COOKIE_NAME}=${value()}`,
        new Map([[7, KEY]]),
      ),
    ).toEqual({ ok: false, code: "AMBIGUOUS_GUEST_SESSION" });
  });

  it("treats cookie names as case-sensitive", () => {
    expect(
      authenticateGuestSessionCookieHeader(
        `${GUEST_SESSION_COOKIE_NAME.toLowerCase()}=${value()}`,
        new Map([[7, KEY]]),
      ),
    ).toEqual({ ok: false, code: "MISSING_GUEST_SESSION" });
  });

  it("rejects forged values and unavailable key versions", () => {
    expect(
      authenticateGuestSessionCookieHeader(
        header(`${value().slice(0, -1)}A`),
        new Map([[7, KEY]]),
      ),
    ).toEqual({ ok: false, code: "INVALID_GUEST_SESSION" });
    expect(
      authenticateGuestSessionCookieHeader(header(), new Map([[8, NEXT_KEY]])),
    ).toEqual({ ok: false, code: "INVALID_GUEST_SESSION" });
  });

  it("supports retained rotation keys and emergency invalidation", () => {
    const rotated = new Map([
      [7, KEY],
      [8, NEXT_KEY],
    ]);
    expect(
      authenticateGuestSessionCookieHeader(header(), rotated),
    ).toMatchObject({
      ok: true,
    });
    rotated.delete(7);
    expect(authenticateGuestSessionCookieHeader(header(), rotated)).toEqual({
      ok: false,
      code: "INVALID_GUEST_SESSION",
    });
  });

  it("blocks an authenticated session by its non-secret scope digest", () => {
    let checkedScope: string | undefined;
    const result = authenticateGuestSessionCookieHeader(
      header(),
      new Map([[7, KEY]]),
      (scope) => {
        checkedScope = scope;
        return scope === SCOPE;
      },
    );
    expect(checkedScope).toBe(SCOPE);
    expect(result).toEqual({ ok: false, code: "REVOKED_GUEST_SESSION" });
  });

  it("contains hostile keyring and revocation-check failures", () => {
    const hostileKeyring = {
      get: () => {
        throw new Error("keyring secret");
      },
    } as unknown as ReadonlyMap<number, Uint8Array>;
    expect(
      authenticateGuestSessionCookieHeader(header(), hostileKeyring),
    ).toEqual({
      ok: false,
      code: "INVALID_GUEST_SESSION",
    });
    expect(
      authenticateGuestSessionCookieHeader(
        header(),
        new Map([[7, KEY]]),
        () => {
          throw new Error("store detail");
        },
      ),
    ).toEqual({ ok: false, code: "INVALID_GUEST_SESSION" });
  });

  it.each([
    [-1, KEY, SESSION_ID],
    [0x1_0000_0000, KEY, SESSION_ID],
    [7, Buffer.alloc(31), SESSION_ID],
    [7, KEY, Buffer.alloc(31)],
  ])("redacts cookie issuance configuration failures", (version, key, id) => {
    expect(issueGuestSessionCookieHeader(version, key, id)).toEqual({
      ok: false,
      code: "GUEST_SESSION_ISSUE_FAILED",
    });
  });
});
