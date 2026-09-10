import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import {
  createGuestResultRoutePlugin,
  type GuestResultRouteReader,
} from "../src/guest-http/index.js";

const NOW = 1_800_000_100n;
const TOKEN = "t".repeat(43);
const apps: ReturnType<typeof Fastify>[] = [];

function successReader() {
  return vi.fn<GuestResultRouteReader>(async () => ({
    ok: true,
    response_headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
    body: {
      schema_version: 1,
      guest_scan_id: "guest_scan_01",
      canonical_host: "example.com",
      status: "COMPLETED",
      completed_at: "2027-01-15T08:01:30.000Z",
      result_access_expires_at: "2027-01-15T08:30:00.000Z",
      posture_sections: [],
      potential_risk_count: 0,
      warning_count: 0,
      coverage: {
        state: "INSUFFICIENT",
        complete_group_count: 0,
        total_group_count: 8,
        groups: [],
      },
      limitations: [
        "GUEST_POSTURE_ONLY",
        "NO_SECURITY_SCORE",
        "NO_ABSOLUTE_ASSURANCE",
      ],
    },
  }));
}

async function detachedApp(reader: GuestResultRouteReader = successReader()) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(
    createGuestResultRoutePlugin({
      read_result: reader,
      now_unix_seconds: () => NOW,
    }),
  );
  return app;
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("detached Guest result HTTP boundary", () => {
  it("returns the sanitized view with mandatory privacy headers", async () => {
    const reader = successReader();
    const app = await detachedApp(reader);
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/scans/guest_scan_01",
      headers: { authorization: `Bearer ${TOKEN}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    expect(response.json()).toMatchObject({
      guest_scan_id: "guest_scan_01",
      canonical_host: "example.com",
      limitations: [
        "GUEST_POSTURE_ONLY",
        "NO_SECURITY_SCORE",
        "NO_ABSOLUTE_ASSURANCE",
      ],
    });
    expect(reader).toHaveBeenCalledWith({
      authorization_header: `Bearer ${TOKEN}`,
      route_guest_scan_id: "guest_scan_01",
      query: {},
      now_unix_seconds: NOW,
    });
    expect(response.body).not.toMatch(/token|evidence|payload_digest/iu);
  });

  it.each([
    ["INVALID_RESULT_REQUEST", 400],
    ["RESULT_ACCESS_DENIED", 404],
  ] as const)("maps %s to one bounded error", async (code, statusCode) => {
    const reader = vi.fn<GuestResultRouteReader>(async () => ({
      ok: false,
      code,
    }));
    const response = await (
      await detachedApp(reader)
    ).inject({
      method: "GET",
      url: "/v1/public/scans/guest_scan_01",
    });

    expect(response.statusCode).toBe(statusCode);
    expect(response.headers).toMatchObject({
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    });
    expect(response.json()).toEqual({ error: { code } });
  });

  it("contains reader and clock failures behind one unavailable error", async () => {
    const reader = vi.fn<GuestResultRouteReader>(async () => {
      throw new Error("database secret detail");
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    await app.register(
      createGuestResultRoutePlugin({
        read_result: reader,
        now_unix_seconds: () => {
          throw new Error("clock detail");
        },
      }),
    );
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/scans/guest_scan_01",
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: "RESULT_SERVICE_UNAVAILABLE" },
    });
    expect(response.body).not.toMatch(/secret|clock|database/iu);
    expect(reader).not.toHaveBeenCalled();
  });

  it("keeps query, HEAD and the production app closed", async () => {
    const reader = successReader();
    const detached = await detachedApp(reader);
    const query = await detached.inject({
      method: "GET",
      url: "/v1/public/scans/guest_scan_01?token=secret",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(query.statusCode).toBe(400);
    expect(reader).not.toHaveBeenCalled();
    const head = await detached.inject({
      method: "HEAD",
      url: "/v1/public/scans/guest_scan_01",
    });
    expect(head.statusCode).toBe(404);

    const production = buildApp();
    apps.push(production);
    const absent = await production.inject({
      method: "GET",
      url: "/v1/public/scans/guest_scan_01",
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(absent.statusCode).toBe(404);
  });

  it("rejects malformed plugin dependencies at composition", () => {
    expect(() =>
      createGuestResultRoutePlugin({
        read_result: null as unknown as GuestResultRouteReader,
        now_unix_seconds: () => NOW,
      }),
    ).toThrowError("INVALID_GUEST_RESULT_ROUTE_CONFIGURATION");
  });
});
