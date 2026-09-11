import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  createGuestScanRoutePlugin,
  type GuestScanRouteCreator,
} from "../src/guest-http/index.js";

const ORIGIN = "https://outscan.example";
const COOKIE = "__Host-outscan_guest_session=opaque";
const TOKEN = "t".repeat(43);
const apps: ReturnType<typeof Fastify>[] = [];

function success(statusCode: 200 | 202 = 202) {
  return {
    ok: true as const,
    status_code: statusCode,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
    body: {
      scanId: "guest_scan_01",
      resultToken: TOKEN,
      status: "QUEUED" as const,
      resultAccessExpiresAt: "2027-01-15T08:30:00.000Z",
      resultTokenExpiresInSeconds: 1_800,
    },
  };
}

function failure(
  statusCode: 400 | 401 | 409 | 429 | 503,
  code:
    | "INVALID_SCAN_REQUEST"
    | "GUEST_SESSION_REQUIRED"
    | "GUEST_SESSION_INVALID"
    | "IDEMPOTENCY_KEY_REUSED"
    | "GUEST_SCAN_LIMIT_EXCEEDED"
    | "GUEST_SCANNING_UNAVAILABLE"
    | "GUEST_SCAN_UNAVAILABLE",
  retryAfter?: string,
) {
  return {
    ok: false as const,
    status_code: statusCode,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      ...(retryAfter === undefined ? {} : { "retry-after": retryAfter }),
    },
    body: { error: { code } },
  };
}

async function detachedApp(createScan: GuestScanRouteCreator) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(
    createGuestScanRoutePlugin({
      allowed_origin: ORIGIN,
      create_scan: createScan,
    }),
  );
  return app;
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    method: "POST" as const,
    url: "/v1/public/scans",
    headers: {
      origin: ORIGIN,
      cookie: COOKIE,
      "idempotency-key": "request-01",
      "content-type": "application/json",
      "x-forwarded-for": "198.51.100.9",
    },
    payload: { domain: "example.com" },
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("detached Guest scan creation HTTP boundary", () => {
  it.each([202, 200] as const)(
    "returns the closed success projection with status %i",
    async (statusCode) => {
      const creator = vi.fn<GuestScanRouteCreator>(async () =>
        success(statusCode),
      );
      const response = await (await detachedApp(creator)).inject(request());

      expect(response.statusCode).toBe(statusCode);
      expect(response.headers).toMatchObject({
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
      });
      expect(response.json()).toEqual(success(statusCode).body);
      expect(creator).toHaveBeenCalledWith({
        body: { domain: "example.com" },
        cookie_header: COOKIE,
        idempotency_key_header: "request-01",
        socket_remote_address: "127.0.0.1",
        x_forwarded_for: "198.51.100.9",
      });
    },
  );

  it.each([
    [400, "INVALID_SCAN_REQUEST", undefined],
    [401, "GUEST_SESSION_REQUIRED", undefined],
    [401, "GUEST_SESSION_INVALID", undefined],
    [409, "IDEMPOTENCY_KEY_REUSED", undefined],
    [429, "GUEST_SCAN_LIMIT_EXCEEDED", undefined],
    [429, "GUEST_SCAN_LIMIT_EXCEEDED", "60"],
    [503, "GUEST_SCANNING_UNAVAILABLE", undefined],
    [503, "GUEST_SCAN_UNAVAILABLE", undefined],
  ] as const)(
    "maps service status %i and code %s without internal detail",
    async (statusCode, code, retryAfter) => {
      const creator = vi.fn<GuestScanRouteCreator>(async () =>
        failure(statusCode, code, retryAfter),
      );
      const response = await (await detachedApp(creator)).inject(request());

      expect(response.statusCode).toBe(statusCode);
      expect(response.json()).toEqual({ error: { code } });
      expect(response.headers["retry-after"]).toBe(retryAfter);
      expect(response.body).not.toMatch(
        /(?:SESSION|NETWORK)_(?:BURST|DAILY|CONCURRENCY)|database|queue/iu,
      );
    },
  );

  it.each([
    { url: "/v1/public/scans?token=secret" },
    { headers: { ...request().headers, origin: "https://evil.example" } },
    { headers: { ...request().headers, "content-type": "text/plain" } },
    {
      headers: {
        cookie: COOKIE,
        "idempotency-key": "request-01",
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.9",
      },
    },
  ])("rejects cross-origin or malformed HTTP input", async (overrides) => {
    const creator = vi.fn<GuestScanRouteCreator>();
    const response = await (
      await detachedApp(creator)
    ).inject(request(overrides));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "INVALID_SCAN_REQUEST" },
    });
    expect(creator).not.toHaveBeenCalled();
  });

  it("contains parser limits and malformed JSON behind the public error", async () => {
    const creator = vi.fn<GuestScanRouteCreator>();
    const app = await detachedApp(creator);
    const malformed = await app.inject(
      request({ payload: '{"domain":', headers: request().headers }),
    );
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({
      error: { code: "INVALID_SCAN_REQUEST" },
    });

    const oversized = await app.inject(
      request({ payload: { domain: "a".repeat(1_100) } }),
    );
    expect(oversized.statusCode).toBe(400);
    expect(oversized.body).not.toMatch(/body|limit|parser/iu);
    expect(creator).not.toHaveBeenCalled();
  });

  it.each([
    async () => {
      throw new Error("database secret detail");
    },
    async () => ({ ...success(), extra: true }),
    async () => ({
      ...success(),
      headers: { ...success().headers, "x-injected": "yes" },
    }),
    async () => failure(202 as never, "GUEST_SCAN_UNAVAILABLE"),
    async () => failure(429, "GUEST_SCAN_LIMIT_EXCEEDED", "86401"),
    async () => ({ ...success(), body: { ...success().body, raw: "secret" } }),
  ])("contains thrown and hostile service decisions", async (creator) => {
    const response = await (
      await detachedApp(creator as GuestScanRouteCreator)
    ).inject(request());
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: "GUEST_SCAN_UNAVAILABLE" },
    });
    expect(response.body).not.toMatch(/secret|database|injected/iu);
    expect(response.headers["retry-after"]).toBeUndefined();
  });

  it("keeps duplicate sensitive headers and the production app closed", async () => {
    const creator = vi.fn<GuestScanRouteCreator>(async () => success());
    const detached = await detachedApp(creator);
    const duplicate = await detached.inject(
      request({
        headers: {
          ...request().headers,
          origin: [ORIGIN, ORIGIN],
        } as never,
      }),
    );
    expect(duplicate.statusCode).toBe(400);
    expect(creator).not.toHaveBeenCalled();

    const production = buildApp();
    apps.push(production);
    const absent = await production.inject(request());
    expect(absent.statusCode).toBe(404);
  });

  it.each(["http://outscan.example", `${ORIGIN}/path`, `${ORIGIN}/`])(
    "rejects unsafe configured origin %s",
    (allowedOrigin) => {
      expect(() =>
        createGuestScanRoutePlugin({
          allowed_origin: allowedOrigin,
          create_scan: async () => success(),
        }),
      ).toThrowError("INVALID_GUEST_SCAN_ROUTE_CONFIGURATION");
    },
  );
});
