import { describe, expect, it } from "vitest";

import { databasePoolConfig } from "../src/db/index.js";

describe("database pool configuration", () => {
  it("builds a bounded explicit TLS-required pool", () => {
    expect(
      databasePoolConfig({
        OUTSCAN_DATABASE_URL: "postgresql://user:secret@db.example/outscan",
        OUTSCAN_DATABASE_SSL: "require",
      }),
    ).toEqual({
      application_name: "outscan-api",
      connectionString: "postgresql://user:secret@db.example/outscan",
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      max: 10,
      ssl: { rejectUnauthorized: true },
    });
  });

  it("allows explicit TLS disablement for a local test database", () => {
    expect(
      databasePoolConfig({
        OUTSCAN_DATABASE_URL: "postgresql://postgres@127.0.0.1/outscan_test",
        OUTSCAN_DATABASE_SSL: "disable",
      }),
    ).toMatchObject({ ssl: false });
  });

  it.each([
    {},
    { OUTSCAN_DATABASE_URL: "" },
    { OUTSCAN_DATABASE_URL: "https://db.example/outscan" },
    { OUTSCAN_DATABASE_URL: "postgresql:///outscan" },
    {
      OUTSCAN_DATABASE_URL: "postgresql://db.example/outscan?sslmode=no-verify",
      OUTSCAN_DATABASE_SSL: "require",
    },
    {
      OUTSCAN_DATABASE_URL:
        "postgresql://db.example/outscan?sslrootcert=/tmp/untrusted.pem",
      OUTSCAN_DATABASE_SSL: "require",
    },
    {
      OUTSCAN_DATABASE_URL: "postgresql://db.example/outscan",
      OUTSCAN_DATABASE_SSL: "prefer",
    },
  ])("rejects ambiguous or unsafe database configuration %#", (input) => {
    expect(() => databasePoolConfig(input)).toThrow(
      "INVALID_DATABASE_CONFIGURATION",
    );
  });
});
