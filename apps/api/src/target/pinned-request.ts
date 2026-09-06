import type { RequestOptions as HttpsRequestOptions } from "node:https";
import type { LookupFunction } from "node:net";
import { checkServerIdentity, type DetailedPeerCertificate } from "node:tls";

import { canonicalizeHostname } from "./hostname.js";
import {
  classifyResolvedAddressSet,
  IP_DESTINATION_POLICY_VERSION,
  type ValidatedIpAddress,
} from "./ip-policy.js";
import type { ResolvedTarget } from "./resolver.js";

const TARGET_KEYS = [
  "canonical_host",
  "policy_version",
  "minimum_ttl_seconds",
  "resolved_at_unix_ms",
  "expires_at_unix_ms",
  "addresses",
] as const;
const REQUEST_KEYS = [
  "protocol",
  "method",
  "path",
  "pinned_address",
  "now_unix_ms",
] as const;

export interface PinnedRequestSpec {
  protocol: "http:" | "https:";
  method: "GET" | "HEAD";
  path: string;
  pinned_address: string;
  now_unix_ms: number;
}

export type PinnedRequestOptions = Readonly<HttpsRequestOptions>;

export type PinnedRequestResult =
  | { ok: true; options: PinnedRequestOptions }
  | {
      ok: false;
      code:
        | "INVALID_TARGET"
        | "STALE_RESOLUTION"
        | "INVALID_REQUEST"
        | "PIN_NOT_APPROVED"
        | "DESTINATION_POLICY_REJECTED";
    };

function hasExactKeys(value: unknown, expected: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === expected.length &&
      expected.every((key) => keys.includes(key))
    );
  } catch {
    return false;
  }
}

function isSafeTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isValidOriginFormPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 2_048 &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[#\\]/u.test(value) &&
    /^[\x21-\x7e]+$/u.test(value)
  );
}

function parseSpec(input: unknown): PinnedRequestSpec | null {
  if (!hasExactKeys(input, REQUEST_KEYS)) return null;
  const value = input as Record<string, unknown>;
  if (
    (value.protocol !== "http:" && value.protocol !== "https:") ||
    (value.method !== "GET" && value.method !== "HEAD") ||
    !isValidOriginFormPath(value.path) ||
    typeof value.pinned_address !== "string" ||
    !isSafeTime(value.now_unix_ms)
  ) {
    return null;
  }
  return value as unknown as PinnedRequestSpec;
}

function parseTarget(
  input: unknown,
  configuredInternalCidrs: unknown,
): ResolvedTarget | "POLICY_REJECTED" | null {
  if (!hasExactKeys(input, TARGET_KEYS)) return null;
  const value = input as Record<string, unknown>;
  const canonical = canonicalizeHostname(value.canonical_host);
  if (
    !canonical.ok ||
    canonical.canonical_host !== value.canonical_host ||
    value.policy_version !== IP_DESTINATION_POLICY_VERSION ||
    !Number.isSafeInteger(value.minimum_ttl_seconds) ||
    (value.minimum_ttl_seconds as number) < 0 ||
    (value.minimum_ttl_seconds as number) > 0xffff_ffff ||
    !isSafeTime(value.resolved_at_unix_ms) ||
    !isSafeTime(value.expires_at_unix_ms) ||
    !Array.isArray(value.addresses) ||
    value.addresses.length === 0 ||
    value.addresses.length > 64
  ) {
    return null;
  }
  const minimumTtlSeconds = value.minimum_ttl_seconds as number;
  const resolvedAtUnixMs = value.resolved_at_unix_ms as number;
  const expiresAtUnixMs = value.expires_at_unix_ms as number;
  const suppliedAddresses = value.addresses as unknown[];
  const expectedExpiry = resolvedAtUnixMs + minimumTtlSeconds * 1_000;
  if (
    !Number.isSafeInteger(expectedExpiry) ||
    expectedExpiry !== expiresAtUnixMs
  ) {
    return null;
  }

  const rawAddresses: string[] = [];
  for (let index = 0; index < suppliedAddresses.length; index += 1) {
    const entry: unknown = suppliedAddresses[index];
    if (!hasExactKeys(entry, ["address", "family"])) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.address !== "string" ||
      (candidate.family !== 4 && candidate.family !== 6)
    ) {
      return null;
    }
    rawAddresses.push(candidate.address);
  }

  const decision = classifyResolvedAddressSet(
    rawAddresses,
    configuredInternalCidrs,
  );
  if (!decision.ok) return "POLICY_REJECTED";
  if (
    decision.addresses.length !== suppliedAddresses.length ||
    decision.addresses.some((address, index) => {
      const supplied = suppliedAddresses[index] as ValidatedIpAddress;
      return (
        supplied.address !== address.address ||
        supplied.family !== address.family
      );
    })
  ) {
    return null;
  }
  return value as unknown as ResolvedTarget;
}

function lookupError(): NodeJS.ErrnoException {
  return Object.assign(new Error("Pinned destination rejected."), {
    code: "EPERM",
  });
}

function pinnedLookup(
  canonicalHost: string,
  pinnedAddress: ValidatedIpAddress,
): LookupFunction {
  return (hostname, options, callback) => {
    if (
      hostname !== canonicalHost ||
      (options.family !== undefined &&
        options.family !== 0 &&
        options.family !== pinnedAddress.family)
    ) {
      callback(lookupError(), "", pinnedAddress.family);
      return;
    }
    if (options.all) {
      callback(null, [pinnedAddress]);
      return;
    }
    callback(null, pinnedAddress.address, pinnedAddress.family);
  };
}

function certificateVerifier(canonicalHost: string) {
  return (_hostname: string, certificate: DetailedPeerCertificate) =>
    checkServerIdentity(canonicalHost, certificate);
}

export function createPinnedRequestOptions(
  targetInput: unknown,
  requestInput: unknown,
  configuredInternalCidrs: unknown = [],
): PinnedRequestResult {
  let target: ResolvedTarget | "POLICY_REJECTED" | null;
  let spec: PinnedRequestSpec | null;
  try {
    target = parseTarget(targetInput, configuredInternalCidrs);
    spec = parseSpec(requestInput);
  } catch {
    return { ok: false, code: "INVALID_TARGET" };
  }
  if (target === "POLICY_REJECTED") {
    return { ok: false, code: "DESTINATION_POLICY_REJECTED" };
  }
  if (!target) return { ok: false, code: "INVALID_TARGET" };
  if (!spec) return { ok: false, code: "INVALID_REQUEST" };
  if (spec.now_unix_ms < target.resolved_at_unix_ms) {
    return { ok: false, code: "INVALID_TARGET" };
  }
  if (spec.now_unix_ms >= target.expires_at_unix_ms) {
    return { ok: false, code: "STALE_RESOLUTION" };
  }

  const pinnedAddress = target.addresses.find(
    (address) => address.address === spec.pinned_address,
  );
  if (!pinnedAddress) return { ok: false, code: "PIN_NOT_APPROVED" };

  const headers = Object.freeze({
    host: target.canonical_host,
    accept: "*/*",
    connection: "close",
    "user-agent": "OUTSCAN/1.0",
  });
  const options: HttpsRequestOptions = {
    protocol: spec.protocol,
    hostname: target.canonical_host,
    host: target.canonical_host,
    port: spec.protocol === "https:" ? 443 : 80,
    method: spec.method,
    path: spec.path,
    headers,
    family: pinnedAddress.family,
    lookup: pinnedLookup(target.canonical_host, pinnedAddress),
    agent: false,
    insecureHTTPParser: false,
    joinDuplicateHeaders: false,
    maxHeaderSize: 64 * 1_024,
  };
  if (spec.protocol === "https:") {
    options.servername = target.canonical_host;
    options.rejectUnauthorized = true;
    options.checkServerIdentity = certificateVerifier(target.canonical_host);
  }
  return { ok: true, options: Object.freeze(options) };
}
