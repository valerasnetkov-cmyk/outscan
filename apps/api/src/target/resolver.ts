import { isIP } from "node:net";

import { canonicalizeHostname } from "./hostname.js";
import {
  classifyResolvedAddressSet,
  type ResolvedAddressSetResult,
  type ValidatedIpAddress,
} from "./ip-policy.js";

const MAX_RECORDS_PER_FAMILY = 64;
const MAX_DNS_TTL_SECONDS = 0xffff_ffff;
const NO_DATA_CODE = "ENODATA";
const NOT_FOUND_CODE = "ENOTFOUND";

export interface DnsAddressResolver {
  resolve4(hostname: string, options: { ttl: true }): Promise<unknown>;
  resolve6(hostname: string, options: { ttl: true }): Promise<unknown>;
}

export interface ResolvedTarget {
  canonical_host: string;
  policy_version: string;
  minimum_ttl_seconds: number;
  resolved_at_unix_ms: number;
  expires_at_unix_ms: number;
  addresses: readonly ValidatedIpAddress[];
}

type RejectedAddressSet = Extract<ResolvedAddressSetResult, { ok: false }>;

export type ResolveTargetResult =
  | { ok: true; target: ResolvedTarget }
  | {
      ok: false;
      code:
        | "INVALID_CANONICAL_HOST"
        | "DNS_LOOKUP_FAILED"
        | "HOST_NOT_FOUND"
        | "INCONSISTENT_DNS_RESPONSE"
        | "INVALID_DNS_RESPONSE"
        | "NO_ADDRESS_RECORDS"
        | "DESTINATION_POLICY_REJECTED"
        | "INVALID_RESOLUTION_TIME";
      policy_decision?: RejectedAddressSet;
    };

interface DnsAddressRecord {
  address: string;
  ttl: number;
}

type FamilyQuery = PromiseSettledResult<unknown>;

function errorCode(error: unknown): string | null {
  try {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
    ) {
      return error.code;
    }
  } catch {
    return null;
  }
  return null;
}

function hasExactRecordShape(
  value: unknown,
): value is { address: unknown; ttl: unknown } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === 2 && keys.includes("address") && keys.includes("ttl")
    );
  } catch {
    return false;
  }
}

function parseRecords(
  input: unknown,
  expectedFamily: 4 | 6,
): readonly DnsAddressRecord[] | null {
  if (!Array.isArray(input) || input.length > MAX_RECORDS_PER_FAMILY) {
    return null;
  }

  const records: DnsAddressRecord[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const value: unknown = input[index];
    if (!hasExactRecordShape(value)) return null;
    const { address, ttl } = value;
    if (
      typeof address !== "string" ||
      address.length === 0 ||
      address.length > 64 ||
      isIP(address) !== expectedFamily ||
      !Number.isSafeInteger(ttl) ||
      (ttl as number) < 0 ||
      (ttl as number) > MAX_DNS_TTL_SECONDS
    ) {
      return null;
    }
    records.push({ address, ttl: ttl as number });
  }
  return records;
}

function queryState(
  result: FamilyQuery,
): "DATA" | "NO_DATA" | "NOT_FOUND" | "FAILED" {
  if (result.status === "fulfilled") return "DATA";
  const code = errorCode(result.reason);
  if (code === NO_DATA_CODE) return "NO_DATA";
  if (code === NOT_FOUND_CODE) return "NOT_FOUND";
  return "FAILED";
}

function immutableTarget(
  canonicalHost: string,
  decision: Extract<ResolvedAddressSetResult, { ok: true }>,
  minimumTtl: number,
  resolvedAtUnixMs: number,
  expiresAtUnixMs: number,
): ResolvedTarget {
  const addresses = decision.addresses.map((address) =>
    Object.freeze({ ...address }),
  );
  return Object.freeze({
    canonical_host: canonicalHost,
    policy_version: decision.policy_version,
    minimum_ttl_seconds: minimumTtl,
    resolved_at_unix_ms: resolvedAtUnixMs,
    expires_at_unix_ms: expiresAtUnixMs,
    addresses: Object.freeze(addresses),
  });
}

export async function resolveAndClassifyHostname(
  canonicalHost: string,
  resolver: DnsAddressResolver,
  configuredInternalCidrs: unknown = [],
  nowUnixMs: unknown = Date.now(),
): Promise<ResolveTargetResult> {
  const canonical = canonicalizeHostname(canonicalHost);
  if (!canonical.ok || canonical.canonical_host !== canonicalHost) {
    return { ok: false, code: "INVALID_CANONICAL_HOST" };
  }
  if (!Number.isSafeInteger(nowUnixMs) || (nowUnixMs as number) < 0) {
    return { ok: false, code: "INVALID_RESOLUTION_TIME" };
  }

  const [ipv4Result, ipv6Result] = await Promise.allSettled([
    Promise.resolve().then(() =>
      resolver.resolve4(canonicalHost, { ttl: true }),
    ),
    Promise.resolve().then(() =>
      resolver.resolve6(canonicalHost, { ttl: true }),
    ),
  ]);
  const states = [queryState(ipv4Result), queryState(ipv6Result)] as const;

  if (states.includes("FAILED")) {
    return { ok: false, code: "DNS_LOOKUP_FAILED" };
  }

  const ipv4Records =
    ipv4Result.status === "fulfilled" ? parseRecords(ipv4Result.value, 4) : [];
  const ipv6Records =
    ipv6Result.status === "fulfilled" ? parseRecords(ipv6Result.value, 6) : [];
  if (!ipv4Records || !ipv6Records) {
    return { ok: false, code: "INVALID_DNS_RESPONSE" };
  }

  const records = [...ipv4Records, ...ipv6Records];
  if (states.includes("NOT_FOUND")) {
    return {
      ok: false,
      code: records.length > 0 ? "INCONSISTENT_DNS_RESPONSE" : "HOST_NOT_FOUND",
    };
  }
  if (records.length === 0) {
    return { ok: false, code: "NO_ADDRESS_RECORDS" };
  }

  const decision = classifyResolvedAddressSet(
    records.map((record) => record.address),
    configuredInternalCidrs,
  );
  if (!decision.ok) {
    return {
      ok: false,
      code: "DESTINATION_POLICY_REJECTED",
      policy_decision: decision,
    };
  }

  const minimumTtl = Math.min(...records.map((record) => record.ttl));
  const expiresAtUnixMs = (nowUnixMs as number) + minimumTtl * 1_000;
  if (!Number.isSafeInteger(expiresAtUnixMs)) {
    return { ok: false, code: "INVALID_RESOLUTION_TIME" };
  }
  return {
    ok: true,
    target: immutableTarget(
      canonicalHost,
      decision,
      minimumTtl,
      nowUnixMs as number,
      expiresAtUnixMs,
    ),
  };
}
