import { describe, expect, it, vi } from "vitest";

import {
  authenticateGuestSessionCookieHeader,
  createGuestSessionCookie,
  deriveGuestSessionScope,
  GUEST_SESSION_COOKIE_NAME,
  isGuestSessionSetCookieHeader,
} from "../src/guest-crypto/index.js";
import {
  createGuestSessionBootstrapService,
  type GuestSessionBootstrapDependencies,
} from "../src/guest-session/index.js";

const OLD_KEY = Buffer.alloc(32, 0x11);
const ACTIVE_KEY = Buffer.alloc(32, 0x22);
const SESSION_ID = Buffer.alloc(32, 0x33);
const SCOPE = deriveGuestSessionScope(SESSION_ID);

function cookieHeader(version = 7, key = OLD_KEY) {
  return `${GUEST_SESSION_COOKIE_NAME}=${createGuestSessionCookie(
    version,
    key,
    SESSION_ID,
  )}`;
}

function dependencies(
  keyState: unknown = {
    active_key_version: 8,
    keys: new Map([
      [7, OLD_KEY],
      [8, ACTIVE_KEY],
    ]),
  },
  revoked: unknown = false,
): GuestSessionBootstrapDependencies {
  return {
    key_provider: { get_current_keys: vi.fn(async () => keyState) },
    revocation_provider: { is_revoked: vi.fn(async () => revoked) },
  };
}

describe("Guest session bootstrap service", () => {
  it("issues a fresh active-key session when no cookie exists", async () => {
    const deps = dependencies();
    const decision = await createGuestSessionBootstrapService(deps)({
      cookie_header: undefined,
    });

    expect(decision).toMatchObject({ ok: true, action: "ISSUED" });
    if (!decision.ok || decision.action !== "ISSUED") throw new Error();
    expect(isGuestSessionSetCookieHeader(decision.set_cookie)).toBe(true);
    expect(
      authenticateGuestSessionCookieHeader(
        decision.set_cookie.split(";", 1)[0],
        new Map([[8, ACTIVE_KEY]]),
      ),
    ).toMatchObject({ ok: true, session: { key_version: 8 } });
    expect(deps.revocation_provider.is_revoked).not.toHaveBeenCalled();
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it("reuses a valid retained-key session without refreshing it", async () => {
    const deps = dependencies();
    const decision = await createGuestSessionBootstrapService(deps)({
      cookie_header: cookieHeader(),
    });

    expect(decision).toEqual({ ok: true, action: "REUSED" });
    expect(deps.revocation_provider.is_revoked).toHaveBeenCalledWith(SCOPE);
  });

  it("replaces a revoked session with a fresh active-key session", async () => {
    const deps = dependencies(undefined, true);
    const decision = await createGuestSessionBootstrapService(deps)({
      cookie_header: cookieHeader(),
    });

    expect(decision).toMatchObject({ ok: true, action: "ISSUED" });
    if (!decision.ok || decision.action !== "ISSUED") throw new Error();
    expect(decision.set_cookie).not.toContain(
      createGuestSessionCookie(7, OLD_KEY, SESSION_ID),
    );
    expect(
      authenticateGuestSessionCookieHeader(
        decision.set_cookie.split(";", 1)[0],
        new Map([[8, ACTIVE_KEY]]),
      ),
    ).toMatchObject({ ok: true, session: { key_version: 8 } });
  });

  it.each(["bad-cookie", `${GUEST_SESSION_COOKIE_NAME}=forged`])(
    "repairs malformed or unauthenticated cookie input %s",
    async (cookie) => {
      const deps = dependencies();
      const decision = await createGuestSessionBootstrapService(deps)({
        cookie_header: cookie,
      });
      expect(decision).toMatchObject({ ok: true, action: "ISSUED" });
      expect(deps.revocation_provider.is_revoked).not.toHaveBeenCalled();
    },
  );

  it("reads current keys on every request and honors emergency removal", async () => {
    const states = [
      {
        active_key_version: 8,
        keys: new Map([
          [7, OLD_KEY],
          [8, ACTIVE_KEY],
        ]),
      },
      { active_key_version: 8, keys: new Map([[8, ACTIVE_KEY]]) },
    ];
    const deps = dependencies();
    deps.key_provider.get_current_keys = vi.fn(async () => states.shift());
    const bootstrap = createGuestSessionBootstrapService(deps);

    await expect(bootstrap({ cookie_header: cookieHeader() })).resolves.toEqual(
      { ok: true, action: "REUSED" },
    );
    await expect(
      bootstrap({ cookie_header: cookieHeader() }),
    ).resolves.toMatchObject({ ok: true, action: "ISSUED" });
  });

  it.each([
    null,
    { active_key_version: 8, keys: new Map([[7, OLD_KEY]]) },
    { active_key_version: 8, keys: new Map([[8, Buffer.alloc(31)]]) },
    {
      active_key_version: 8,
      keys: new Map([
        [5, ACTIVE_KEY],
        [6, ACTIVE_KEY],
        [7, ACTIVE_KEY],
        [8, ACTIVE_KEY],
      ]),
    },
    { active_key_version: 8, keys: new Map([[8, ACTIVE_KEY]]), extra: true },
  ])("fails closed on invalid key state", async (state) => {
    const decision = await createGuestSessionBootstrapService(
      dependencies(state),
    )({
      cookie_header: undefined,
    });
    expect(decision).toEqual({ ok: false, code: "GUEST_SESSION_UNAVAILABLE" });
  });

  it("contains key and revocation provider failures", async () => {
    const keyFailure = dependencies();
    keyFailure.key_provider.get_current_keys = vi.fn(async () => {
      throw new Error("key secret");
    });
    await expect(
      createGuestSessionBootstrapService(keyFailure)({
        cookie_header: undefined,
      }),
    ).resolves.toEqual({ ok: false, code: "GUEST_SESSION_UNAVAILABLE" });

    const revocationFailure = dependencies();
    revocationFailure.revocation_provider.is_revoked = vi.fn(async () => {
      throw new Error("database detail");
    });
    await expect(
      createGuestSessionBootstrapService(revocationFailure)({
        cookie_header: cookieHeader(),
      }),
    ).resolves.toEqual({ ok: false, code: "GUEST_SESSION_UNAVAILABLE" });
  });

  it.each([undefined, null, "false", 0])(
    "rejects ambiguous revocation result %s",
    async (revoked) => {
      const deps = dependencies();
      deps.revocation_provider.is_revoked = vi.fn(async () => revoked);
      await expect(
        createGuestSessionBootstrapService(deps)({
          cookie_header: cookieHeader(),
        }),
      ).resolves.toEqual({ ok: false, code: "GUEST_SESSION_UNAVAILABLE" });
    },
  );

  it("rejects malformed requests before reading secrets", async () => {
    const deps = dependencies();
    const bootstrap = createGuestSessionBootstrapService(deps);
    await expect(
      bootstrap({ cookie_header: undefined, extra: true } as never),
    ).resolves.toEqual({ ok: false, code: "GUEST_SESSION_UNAVAILABLE" });
    expect(deps.key_provider.get_current_keys).not.toHaveBeenCalled();
  });

  it("rejects malformed dependencies at composition", () => {
    expect(() =>
      createGuestSessionBootstrapService({
        key_provider: null,
        revocation_provider: null,
      } as unknown as GuestSessionBootstrapDependencies),
    ).toThrowError("INVALID_GUEST_SESSION_BOOTSTRAP_CONFIGURATION");
  });
});
