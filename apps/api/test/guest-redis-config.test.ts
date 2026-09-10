import { describe, expect, it } from "vitest";

import { guestRedisConnectionConfig } from "../src/guest-queue/index.js";

describe("Guest Redis connection configuration", () => {
  it("builds certificate-validating TLS configuration with authentication", () => {
    const result = guestRedisConnectionConfig({
      OUTSCAN_REDIS_URL: "rediss://worker:secret%20value@redis.example:6380/3",
      OUTSCAN_REDIS_TLS: "require",
    });
    expect(result).toEqual({
      host: "redis.example",
      port: 6380,
      db: 3,
      username: "worker",
      password: "secret value",
      connectTimeout: 5_000,
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        servername: "redis.example",
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.tls)).toBe(true);
  });

  it("permits explicit unauthenticated local plaintext configuration", () => {
    expect(
      guestRedisConnectionConfig({
        OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/0",
        OUTSCAN_REDIS_TLS: "disable",
      }),
    ).toMatchObject({ host: "127.0.0.1", port: 6379, db: 0 });
  });

  it.each([
    {},
    {
      OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/0",
      OUTSCAN_REDIS_TLS: "require",
    },
    {
      OUTSCAN_REDIS_URL: "rediss://redis.example:6380/0",
      OUTSCAN_REDIS_TLS: "require",
    },
    {
      OUTSCAN_REDIS_URL: "rediss://secret@redis.example:6380/0",
      OUTSCAN_REDIS_TLS: "require",
    },
    {
      OUTSCAN_REDIS_URL: "redis://user@127.0.0.1:6379/0",
      OUTSCAN_REDIS_TLS: "disable",
    },
    {
      OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/16",
      OUTSCAN_REDIS_TLS: "disable",
    },
    {
      OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/0?tls=false",
      OUTSCAN_REDIS_TLS: "disable",
    },
    {
      OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/0#fragment",
      OUTSCAN_REDIS_TLS: "disable",
    },
    {
      OUTSCAN_REDIS_URL: "redis://127.0.0.1:6379/",
      OUTSCAN_REDIS_TLS: "disable",
    },
  ])("rejects ambiguous or unsafe configuration", (environment) => {
    expect(() => guestRedisConnectionConfig(environment)).toThrow(
      "INVALID_GUEST_REDIS_CONFIGURATION",
    );
  });

  it("contains hostile environment access behind one stable error", () => {
    const environment = {};
    Object.defineProperty(environment, "OUTSCAN_REDIS_URL", {
      get: () => {
        throw new Error("secret provider detail");
      },
    });
    expect(() => guestRedisConnectionConfig(environment)).toThrow(
      "INVALID_GUEST_REDIS_CONFIGURATION",
    );
  });
});
