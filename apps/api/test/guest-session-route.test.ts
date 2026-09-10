import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  createGuestSessionRoutePlugin,
  type GuestSessionBootstrapper,
} from "../src/guest-http/index.js";
import { issueGuestSessionCookieHeader } from "../src/guest-crypto/index.js";

const ORIGIN = "https://outscan.example";
const COOKIE = issueGuestSessionCookieHeader(
  7,
  Buffer.alloc(32, 0x11),
  Buffer.alloc(32, 0x22),
);
if (!COOKIE.ok) throw new Error("Expected test cookie.");

const apps: ReturnType<typeof Fastify>[] = [];

async function detachedApp(bootstrapSession: GuestSessionBootstrapper) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(
    createGuestSessionRoutePlugin({
      allowed_origin: ORIGIN,
      bootstrap_session: bootstrapSession,
    }),
  );
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("detached Guest session bootstrap HTTP boundary", () => {
  it("issues only the canonical host-only cookie", async () => {
    const bootstrap = vi.fn<GuestSessionBootstrapper>(async () => ({
      ok: true,
      action: "ISSUED",
      set_cookie: COOKIE.set_cookie,
    }));
    const response = await (
      await detachedApp(bootstrap)
    ).inject({
      method: "POST",
      url: "/v1/public/guest-session",
      headers: { origin: ORIGIN },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
    expect(response.headers).toMatchObject({
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "set-cookie": COOKIE.set_cookie,
    });
    expect(bootstrap).toHaveBeenCalledWith({ cookie_header: undefined });
  });

  it("reuses an authenticated cookie without refreshing its lifetime", async () => {
    const bootstrap = vi.fn<GuestSessionBootstrapper>(async () => ({
      ok: true,
      action: "REUSED",
    }));
    const response = await (
      await detachedApp(bootstrap)
    ).inject({
      method: "POST",
      url: "/v1/public/guest-session",
      headers: {
        origin: ORIGIN,
        cookie: "theme=dark; __Host-outscan_guest_session=opaque",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(bootstrap).toHaveBeenCalledWith({
      cookie_header: "theme=dark; __Host-outscan_guest_session=opaque",
    });
  });

  it.each([
    [{}, "/v1/public/guest-session?next=https://evil.example"],
    [{ origin: "https://evil.example" }, "/v1/public/guest-session"],
  ])(
    "rejects missing/cross-origin or query input before bootstrap",
    async (headers, url) => {
      const bootstrap = vi.fn<GuestSessionBootstrapper>();
      const response = await (
        await detachedApp(bootstrap)
      ).inject({
        method: "POST",
        url,
        headers,
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: "INVALID_GUEST_SESSION_REQUEST" },
      });
      expect(bootstrap).not.toHaveBeenCalled();
    },
  );

  it("rejects request bodies before bootstrap", async () => {
    const bootstrap = vi.fn<GuestSessionBootstrapper>();
    const response = await (
      await detachedApp(bootstrap)
    ).inject({
      method: "POST",
      url: "/v1/public/guest-session",
      headers: { origin: ORIGIN },
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it.each([
    async () => {
      throw new Error("secret provider detail");
    },
    async () => ({
      ok: true as const,
      action: "ISSUED" as const,
      set_cookie: `${COOKIE.set_cookie}\r\nX-Injected: yes`,
    }),
    async () => ({ ok: true as const, action: "REUSED" as const, extra: true }),
  ])("contains provider failure and hostile decisions", async (bootstrap) => {
    const response = await (
      await detachedApp(bootstrap as GuestSessionBootstrapper)
    ).inject({
      method: "POST",
      url: "/v1/public/guest-session",
      headers: { origin: ORIGIN },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: "GUEST_SESSION_UNAVAILABLE" },
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).not.toMatch(/secret|provider|injected/iu);
  });

  it("remains absent from the production app", async () => {
    const production = buildApp();
    apps.push(production);
    const response = await production.inject({
      method: "POST",
      url: "/v1/public/guest-session",
      headers: { origin: ORIGIN },
    });
    expect(response.statusCode).toBe(404);
  });

  it.each(["http://outscan.example", `${ORIGIN}/path`, `${ORIGIN}/`])(
    "rejects unsafe or non-canonical configured origin %s",
    (allowedOrigin) => {
      expect(() =>
        createGuestSessionRoutePlugin({
          allowed_origin: allowedOrigin,
          bootstrap_session: async () => ({ ok: true, action: "REUSED" }),
        }),
      ).toThrowError("INVALID_GUEST_SESSION_ROUTE_CONFIGURATION");
    },
  );
});
