import { describe, expect, it, vi } from "vitest";

import {
  createRuntimeDnsResolver,
  RUNTIME_DNS_POLICY_VERSION,
  type RuntimeResolverFactory,
} from "../src/target/index.js";

function validConfig(): Record<string, unknown> {
  return {
    servers: ["1.1.1.1", "[2001:4860:4860::8888]:53"],
    timeout_ms: 1_000,
    tries: 2,
    max_timeout_ms: 2_000,
  };
}

function fakeFactory() {
  const setServers = vi.fn();
  const resolver = {
    setServers,
    resolve4: vi.fn(async () => []),
    resolve6: vi.fn(async () => []),
  };
  const factory = vi.fn(() => resolver) as RuntimeResolverFactory;
  return { factory, resolver, setServers };
}

describe("runtime DNS client configuration", () => {
  it("constructs an isolated resolver with bounded explicit options and servers", () => {
    const fake = fakeFactory();
    const result = createRuntimeDnsResolver(validConfig(), fake.factory);

    expect(result).toMatchObject({
      ok: true,
      policy_version: RUNTIME_DNS_POLICY_VERSION,
      config: validConfig(),
    });
    expect(fake.factory).toHaveBeenCalledWith({
      timeout: 1_000,
      tries: 2,
      maxTimeout: 2_000,
    });
    expect(fake.setServers).toHaveBeenCalledWith([
      "1.1.1.1",
      "[2001:4860:4860::8888]:53",
    ]);
    if (!result.ok) throw new Error("Expected configured resolver.");
    expect(Object.isFrozen(result.config)).toBe(true);
    expect(Object.isFrozen(result.config.servers)).toBe(true);
    expect(Object.isFrozen(result.resolver)).toBe(true);
    expect(result.resolver).not.toBe(fake.resolver);
    expect("setServers" in result.resolver).toBe(false);
  });

  it("exposes only a bound A/AAAA facade", async () => {
    const fake = fakeFactory();
    const result = createRuntimeDnsResolver(validConfig(), fake.factory);
    if (!result.ok) throw new Error("Expected configured resolver.");

    await result.resolver.resolve4("example.com", { ttl: true });
    await result.resolver.resolve6("example.com", { ttl: true });
    expect(fake.resolver.resolve4).toHaveBeenCalledWith("example.com", {
      ttl: true,
    });
    expect(fake.resolver.resolve6).toHaveBeenCalledWith("example.com", {
      ttl: true,
    });
  });

  it.each([
    null,
    [],
    {},
    { ...validConfig(), extra: true },
    { servers: [], timeout_ms: 1_000, tries: 2, max_timeout_ms: 2_000 },
    {
      ...validConfig(),
      servers: Array(5).fill("1.1.1.1"),
    },
    { ...validConfig(), servers: new Array(1) },
  ])("rejects malformed or non-exact config", (config) => {
    const fake = fakeFactory();
    expect(createRuntimeDnsResolver(config, fake.factory)).toEqual({
      ok: false,
      policy_version: RUNTIME_DNS_POLICY_VERSION,
      code: "INVALID_DNS_CONFIG",
    });
    expect(fake.factory).not.toHaveBeenCalled();
  });

  it.each([
    "dns.example",
    "https://1.1.1.1",
    "1.1.1.1:0",
    "1.1.1.1:65536",
    "1.1.1.1:053",
    "[2001:4860:4860::8888]",
    "[2001:4860:4860::8888]:0",
    "fe80::1%eth0",
    " 1.1.1.1",
    "",
  ])("rejects unsafe DNS server endpoint %s", (server) => {
    const fake = fakeFactory();
    expect(
      createRuntimeDnsResolver(
        { ...validConfig(), servers: [server] },
        fake.factory,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_DNS_CONFIG" });
  });

  it("accepts explicit IPv4/IPv6 endpoints and canonical port text", () => {
    const fake = fakeFactory();
    const config = {
      ...validConfig(),
      servers: ["8.8.8.8:53", "2001:4860:4860::8844"],
    };
    expect(createRuntimeDnsResolver(config, fake.factory)).toMatchObject({
      ok: true,
      config,
    });
  });

  it("rejects duplicate server endpoints", () => {
    const fake = fakeFactory();
    expect(
      createRuntimeDnsResolver(
        { ...validConfig(), servers: ["1.1.1.1", "1.1.1.1"] },
        fake.factory,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_DNS_CONFIG" });
  });

  it.each([
    ["timeout_ms", 99],
    ["timeout_ms", 5_001],
    ["tries", 0],
    ["tries", 4],
    ["max_timeout_ms", 99],
    ["max_timeout_ms", 10_001],
    ["tries", 1.5],
  ])("rejects out-of-policy numeric field %s=%s", (field, value) => {
    const fake = fakeFactory();
    expect(
      createRuntimeDnsResolver(
        { ...validConfig(), [field]: value },
        fake.factory,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_DNS_CONFIG" });
  });

  it("requires max retry timeout to be at least the query timeout", () => {
    const fake = fakeFactory();
    expect(
      createRuntimeDnsResolver(
        { ...validConfig(), timeout_ms: 2_001, max_timeout_ms: 2_000 },
        fake.factory,
      ),
    ).toMatchObject({ ok: false, code: "INVALID_DNS_CONFIG" });
  });

  it("redacts factory and setServers initialization failures", () => {
    const factoryFailure = vi.fn(() => {
      throw new Error("secret factory detail");
    }) as RuntimeResolverFactory;
    expect(createRuntimeDnsResolver(validConfig(), factoryFailure)).toEqual({
      ok: false,
      policy_version: RUNTIME_DNS_POLICY_VERSION,
      code: "RESOLVER_INIT_FAILED",
    });

    const setServersFailure = fakeFactory();
    setServersFailure.setServers.mockImplementation(() => {
      throw new Error("secret server detail");
    });
    const result = createRuntimeDnsResolver(
      validConfig(),
      setServersFailure.factory,
    );
    expect(result).toEqual({
      ok: false,
      policy_version: RUNTIME_DNS_POLICY_VERSION,
      code: "RESOLVER_INIT_FAILED",
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("fails closed for hostile config access and malformed factories", () => {
    const hostile = new Proxy(validConfig(), {
      get() {
        throw new Error("hostile getter");
      },
    });
    expect(
      createRuntimeDnsResolver(hostile, fakeFactory().factory),
    ).toMatchObject({ ok: false, code: "INVALID_DNS_CONFIG" });

    const malformedFactory = vi.fn(() => ({
      setServers: vi.fn(),
    })) as unknown as RuntimeResolverFactory;
    expect(
      createRuntimeDnsResolver(validConfig(), malformedFactory),
    ).toMatchObject({ ok: false, code: "RESOLVER_INIT_FAILED" });
  });
});
