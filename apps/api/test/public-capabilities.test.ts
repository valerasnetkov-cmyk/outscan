import type { PublicCapability } from "@outscan/capabilities";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const oneCapability = Object.freeze([
  Object.freeze({
    slug: "domain-security",
    name: "Domain Security",
    description: "Состояние DNS и настроек домена.",
    access: "PUBLIC_SAFE",
    maturity: "BETA",
    status: "ACTIVE",
    sortOrder: 10,
  }),
]) satisfies readonly PublicCapability[];

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /v1/public/capabilities", () => {
  it("returns an anonymous, bounded and deterministic public projection", async () => {
    const app = buildApp({
      getPublicCapabilities: () => oneCapability,
      now: () => new Date("2026-09-06T00:00:00.000Z"),
    });
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/public/capabilities",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=60, stale-while-revalidate=300",
    );
    expect(response.json()).toEqual({
      data: oneCapability,
      meta: {
        schemaVersion: 1,
        generatedAt: "2026-09-06T00:00:00.000Z",
      },
    });
  });

  it("returns no capabilities while production evidence is unapproved", async () => {
    const app = buildApp({ now: () => new Date("2026-09-06T00:00:00.000Z") });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/capabilities",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([]);
  });

  it("rejects query parameters without exposing internal details", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/capabilities?include=internal",
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({ error: { code: "INVALID_QUERY" } });
  });

  it("fails closed when registry projection is unavailable", async () => {
    const app = buildApp({
      getPublicCapabilities: () => {
        throw new Error("internal scanner_command=secret");
      },
    });
    apps.push(app);
    const response = await app.inject({
      method: "GET",
      url: "/v1/public/capabilities",
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).not.toContain("scanner_command");
    expect(response.json()).toEqual({
      error: { code: "CAPABILITY_REGISTRY_UNAVAILABLE" },
    });
  });

  it("does not expose a mutation route", async () => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({
      method: "POST",
      url: "/v1/public/capabilities",
      payload: { publicVisible: true },
    });
    expect(response.statusCode).toBe(404);
  });
});
