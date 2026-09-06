import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("notification foundation exposure", () => {
  const absentRoutes = [
    ["POST", "/v1/notifications"],
    ["POST", "/v1/notification-endpoints/telegram/bindings"],
    ["POST", "/webhooks/v1/telegram/customer"],
    ["POST", "/webhooks/v1/telegram/ops"],
  ] as const;

  it.each(absentRoutes)("does not expose %s %s", async (method, url) => {
    const app = buildApp();
    apps.push(app);
    const response = await app.inject({ method, url, payload: {} });
    expect(response.statusCode).toBe(404);
  });
});
