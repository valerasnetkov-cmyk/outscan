import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns a bounded no-store health response", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      service: "outscan-api",
      status: "ok",
      version: "0.1.0",
    });
  });
});
