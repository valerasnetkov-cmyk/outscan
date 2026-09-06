import type { ResolverOptions } from "node:dns";
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

import type { DnsAddressResolver } from "./resolver.js";

export const RUNTIME_DNS_POLICY_VERSION = "node-dns-runtime.v1";

const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 5_000;
const MAX_RETRY_TIMEOUT_MS = 10_000;
const MAX_TRIES = 3;
const MAX_SERVERS = 4;

export interface RuntimeDnsConfig {
  servers: readonly string[];
  timeout_ms: number;
  tries: number;
  max_timeout_ms: number;
}

interface ConfigurableResolver extends DnsAddressResolver {
  setServers(servers: string[]): void;
}

export type RuntimeResolverFactory = (
  options: ResolverOptions,
) => ConfigurableResolver;

export type RuntimeDnsResolverResult =
  | {
      ok: true;
      policy_version: string;
      config: RuntimeDnsConfig;
      resolver: DnsAddressResolver;
    }
  | {
      ok: false;
      policy_version: string;
      code: "INVALID_DNS_CONFIG" | "RESOLVER_INIT_FAILED";
    };

function hasExactConfigShape(
  value: unknown,
): value is Record<keyof RuntimeDnsConfig, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const expected = ["servers", "timeout_ms", "tries", "max_timeout_ms"];
    return (
      keys.length === expected.length &&
      expected.every((key) => keys.includes(key))
    );
  } catch {
    return false;
  }
}

function parsePort(value: string): number | null {
  if (!/^[1-9][0-9]{0,4}$/u.test(value)) return null;
  const port = Number(value);
  return port <= 65_535 ? port : null;
}

function normalizeDnsServer(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 80) {
    return null;
  }
  if (value.includes("%") || /\s/u.test(value)) return null;
  const family = isIP(value);
  if (family === 4) return value;
  if (family === 6) return value.toLowerCase();

  const bracketedIpv6 = /^\[([^\]]+)\]:([0-9]+)$/u.exec(value);
  if (bracketedIpv6) {
    const address = bracketedIpv6[1] ?? "";
    const port = parsePort(bracketedIpv6[2] ?? "");
    if (isIP(address) !== 6 || port === null) return null;
    return `[${address.toLowerCase()}]:${port}`;
  }

  const ipv4WithPort = /^([^:]+):([0-9]+)$/u.exec(value);
  if (ipv4WithPort) {
    const address = ipv4WithPort[1] ?? "";
    const port = parsePort(ipv4WithPort[2] ?? "");
    if (isIP(address) !== 4 || port === null) return null;
    return `${address}:${port}`;
  }
  return null;
}

function boundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function parseConfig(input: unknown): RuntimeDnsConfig | null {
  if (!hasExactConfigShape(input) || !Array.isArray(input.servers)) return null;
  if (input.servers.length === 0 || input.servers.length > MAX_SERVERS) {
    return null;
  }

  const servers: string[] = [];
  for (let index = 0; index < input.servers.length; index += 1) {
    const server = normalizeDnsServer(input.servers[index]);
    if (!server || servers.includes(server)) return null;
    servers.push(server);
  }

  if (
    !boundedInteger(input.timeout_ms, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS) ||
    !boundedInteger(input.tries, 1, MAX_TRIES) ||
    !boundedInteger(
      input.max_timeout_ms,
      MIN_TIMEOUT_MS,
      MAX_RETRY_TIMEOUT_MS,
    ) ||
    input.max_timeout_ms < input.timeout_ms
  ) {
    return null;
  }

  return Object.freeze({
    servers: Object.freeze(servers),
    timeout_ms: input.timeout_ms,
    tries: input.tries,
    max_timeout_ms: input.max_timeout_ms,
  });
}

function defaultFactory(options: ResolverOptions): ConfigurableResolver {
  return new Resolver(options);
}

export function createRuntimeDnsResolver(
  input: unknown,
  factory: RuntimeResolverFactory = defaultFactory,
): RuntimeDnsResolverResult {
  const base = { policy_version: RUNTIME_DNS_POLICY_VERSION } as const;
  let config: RuntimeDnsConfig | null;
  try {
    config = parseConfig(input);
  } catch {
    config = null;
  }
  if (!config) return { ...base, ok: false, code: "INVALID_DNS_CONFIG" };

  try {
    const resolver = factory({
      timeout: config.timeout_ms,
      tries: config.tries,
      maxTimeout: config.max_timeout_ms,
    });
    if (
      typeof resolver.setServers !== "function" ||
      typeof resolver.resolve4 !== "function" ||
      typeof resolver.resolve6 !== "function"
    ) {
      return { ...base, ok: false, code: "RESOLVER_INIT_FAILED" };
    }
    resolver.setServers([...config.servers]);
    const resolve4 = resolver.resolve4.bind(resolver);
    const resolve6 = resolver.resolve6.bind(resolver);
    const restrictedResolver: DnsAddressResolver = Object.freeze({
      resolve4,
      resolve6,
    });
    return { ...base, ok: true, config, resolver: restrictedResolver };
  } catch {
    return { ...base, ok: false, code: "RESOLVER_INIT_FAILED" };
  }
}
