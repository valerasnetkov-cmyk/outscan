import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { createGuestResultView } from "../src/guest-result/index.js";
import {
  createGuestResultRoutePlugin,
  type GuestResultRouteReader,
} from "../src/guest-http/index.js";

const NOW = 1_800_000_100n;
const TOKEN = "t".repeat(43);
const apps: ReturnType<typeof Fastify>[] = [];

function successReader() {
  const decision = createGuestResultView({
    access: {
      guest_scan_id: "guest_scan_01",
      result_access_expires_at_unix_seconds: NOW + 1_000n,
      result_token_expires_in_seconds: 1_000,
      response_headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    },
    completed_at_unix_seconds: NOW - 1n,
    projection: {
      schema_version: 1,
      canonical_host: "example.com",
      posture: [{ check_id: "TLS_CERTIFICATE", outcome: "PASS" }],
      potential_risk_count: 0,
      warning_count: 0,
      coverage: [
        {
          detector_group: "TARGET_RESOLUTION",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
      ],
      execution: { policy_version: "1.0.0", duration_ms: 0, request_count: 0 },
    },
  });
  if (!decision.ok) throw new Error("Invalid fixture");
  return vi.fn<GuestResultRouteReader>(async () => decision);
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
  it.each([
    "internal",
    "nested",
    "scan",
    "expiry",
    "future",
    "count",
    "section",
    "coverage",
    "toJSON",
    "headers",
  ])("denies hostile service result %s", async (mutation) => {
    const valid = await successReader()({
      authorization_header: undefined,
      route_guest_scan_id: "guest_scan_01",
      query: {},
      now_unix_seconds: NOW,
    });
    if (!valid.ok) throw new Error("Invalid fixture");
    const value = structuredClone(valid);
    if (mutation === "internal")
      Object.assign(value.body, { raw_evidence: "private-canary" });
    if (mutation === "nested")
      Object.assign(value.body.posture_sections[3]!.checks[0]!, {
        secret: "private-canary",
      });
    if (mutation === "scan")
      Object.assign(value.body, { guest_scan_id: "another_scan" });
    if (mutation === "expiry")
      Object.assign(value.body, {
        result_access_expires_at: new Date(Number(NOW) * 1000).toISOString(),
      });
    if (mutation === "future")
      Object.assign(value.body, {
        completed_at: new Date(Number(NOW + 1n) * 1000).toISOString(),
      });
    if (mutation === "count")
      Object.assign(value.body.coverage, { complete_group_count: 8 });
    if (mutation === "section")
      Object.assign(value.body.posture_sections[0]!, {
        section_id: "INTERNAL",
      });
    if (mutation === "coverage")
      Object.assign(value.body.coverage.groups[0]!, { state: "INTERNAL" });
    if (mutation === "toJSON")
      Object.assign(value.body, {
        toJSON: () => ({ secret: "private-canary" }),
      });
    if (mutation === "headers")
      Object.assign(value.response_headers, { "set-cookie": "private-canary" });
    const response = await (
      await detachedApp(async () => value)
    ).inject({ method: "GET", url: "/v1/public/scans/guest_scan_01" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: "RESULT_SERVICE_UNAVAILABLE" },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("private-canary");
  });

  it.each([
    null,
    undefined,
    {},
    { ok: false, code: "INTERNAL" },
    { ok: false, code: "RESULT_ACCESS_DENIED", secret: true },
  ])("denies malformed decision %j", async (value) => {
    const response = await (
      await detachedApp(async () => value as never)
    ).inject({ method: "GET", url: "/v1/public/scans/guest_scan_01" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: { code: "RESULT_SERVICE_UNAVAILABLE" },
    });
  });

  it.each([0, NaN, undefined, "1800000100", -1n, 0x1_0000_0000_0000_0000n])(
    "denies invalid clock %s before reading",
    async (now) => {
      const reader = successReader();
      const app = Fastify({ logger: false });
      apps.push(app);
      await app.register(
        createGuestResultRoutePlugin({
          read_result: reader,
          now_unix_seconds: () => now as bigint,
        }),
      );
      const response = await app.inject({
        method: "GET",
        url: "/v1/public/scans/guest_scan_01",
      });
      expect(response.statusCode).toBe(503);
      expect(reader).not.toHaveBeenCalled();
    },
  );
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
