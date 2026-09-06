import { canonicalizeHostname } from "./hostname.js";
import { isValidOriginFormPath } from "./pinned-request.js";
import {
  executePinnedRequest,
  parsePinnedTransportLimits,
  type PinnedTransportLimits,
  type PinnedTransportResponse,
  type PinnedTransportResult,
} from "./pinned-transport.js";
import {
  resolveAndClassifyHostname,
  type DnsAddressResolver,
  type ResolveTargetResult,
  type ResolvedTarget,
} from "./resolver.js";

const MAX_REDIRECTS = 5;
const MAX_RETRIES = 2;
const MAX_TOTAL_RESPONSE_BYTES = 192 * 1_024 * 1_024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const INPUT_KEYS = [
  "canonical_host",
  "protocol",
  "method",
  "path",
  "deadline_unix_ms",
  "max_redirects",
  "max_retries",
  "max_total_response_bytes",
  "transport_limits",
] as const;

export interface SafeHttpFlowInput {
  canonical_host: string;
  protocol: "http:" | "https:";
  method: "GET" | "HEAD";
  path: string;
  deadline_unix_ms: number;
  max_redirects: number;
  max_retries: number;
  max_total_response_bytes: number;
  transport_limits: Readonly<PinnedTransportLimits>;
}

export type SafeHttpFlowFailureCode =
  | "INVALID_FLOW"
  | "FLOW_DEADLINE_EXCEEDED"
  | "INVALID_REDIRECT"
  | "REDIRECT_DOWNGRADE"
  | "REDIRECT_LIMIT_EXCEEDED"
  | "TOTAL_RESPONSE_LIMIT_EXCEEDED"
  | "ORCHESTRATION_FAILED"
  | Extract<ResolveTargetResult, { ok: false }>["code"]
  | Extract<PinnedTransportResult, { ok: false }>["code"];

export type SafeHttpFlowResult =
  | {
      ok: true;
      response: PinnedTransportResponse;
      request_count: number;
      redirect_count: number;
      stop_reason: "COMPLETE" | "CROSS_HOST_REDIRECT";
    }
  | { ok: false; code: SafeHttpFlowFailureCode };

export type PinnedTransportExecutor = (
  target: ResolvedTarget,
  request: {
    protocol: "http:" | "https:";
    method: "GET" | "HEAD";
    path: string;
    pinned_address: string;
    now_unix_ms: number;
  },
  limits: Readonly<PinnedTransportLimits>,
  configuredInternalCidrs: unknown,
) => Promise<PinnedTransportResult>;

export interface SafeHttpFlowDependencies {
  now?: () => number;
  transport?: PinnedTransportExecutor;
}

interface CurrentRequest {
  protocol: "http:" | "https:";
  method: "GET" | "HEAD";
  path: string;
}

type RedirectDecision =
  | { kind: "NONE" }
  | { kind: "CROSS_HOST" }
  | { kind: "INVALID" }
  | { kind: "DOWNGRADE" }
  | { kind: "FOLLOW"; request: CurrentRequest };

function exactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function parseInput(input: unknown): SafeHttpFlowInput | null {
  if (!exactObject(input, INPUT_KEYS)) return null;
  try {
    const value = input as Record<string, unknown>;
    const canonical = canonicalizeHostname(value.canonical_host);
    const transportLimits = parsePinnedTransportLimits(value.transport_limits);
    if (
      !canonical.ok ||
      canonical.canonical_host !== value.canonical_host ||
      (value.protocol !== "http:" && value.protocol !== "https:") ||
      (value.method !== "GET" && value.method !== "HEAD") ||
      !isValidOriginFormPath(value.path) ||
      !boundedInteger(value.deadline_unix_ms, 0, Number.MAX_SAFE_INTEGER) ||
      !boundedInteger(value.max_redirects, 0, MAX_REDIRECTS) ||
      !boundedInteger(value.max_retries, 0, MAX_RETRIES) ||
      !boundedInteger(
        value.max_total_response_bytes,
        1,
        MAX_TOTAL_RESPONSE_BYTES,
      ) ||
      !transportLimits ||
      (value.max_total_response_bytes as number) <
        transportLimits.max_response_bytes
    ) {
      return null;
    }
    return Object.freeze({
      canonical_host: canonical.canonical_host,
      protocol: value.protocol,
      method: value.method,
      path: value.path,
      deadline_unix_ms: value.deadline_unix_ms,
      max_redirects: value.max_redirects,
      max_retries: value.max_retries,
      max_total_response_bytes: value.max_total_response_bytes,
      transport_limits: transportLimits,
    }) as SafeHttpFlowInput;
  } catch {
    return null;
  }
}

function redirectDecision(
  response: PinnedTransportResponse,
  current: CurrentRequest,
  canonicalHost: string,
): RedirectDecision {
  if (!REDIRECT_STATUSES.has(response.status_code)) return { kind: "NONE" };
  const locations = response.headers.filter(
    (header) => header.name === "location",
  );
  if (locations.length === 0) return { kind: "NONE" };
  if (locations.length !== 1) return { kind: "INVALID" };
  const location = locations[0]!.value;
  if (location.length > 8_192 || /[\0\r\n\\]/u.test(location)) {
    return { kind: "INVALID" };
  }

  try {
    const destination = new URL(
      location,
      `${current.protocol}//${canonicalHost}${current.path}`,
    );
    if (destination.username || destination.password || destination.port) {
      return { kind: "INVALID" };
    }
    if (destination.protocol !== "http:" && destination.protocol !== "https:") {
      return { kind: "INVALID" };
    }
    const host = canonicalizeHostname(destination.hostname);
    if (!host.ok) return { kind: "INVALID" };
    if (host.canonical_host !== canonicalHost) return { kind: "CROSS_HOST" };
    if (current.protocol === "https:" && destination.protocol === "http:") {
      return { kind: "DOWNGRADE" };
    }
    const path = `${destination.pathname}${destination.search}`;
    if (!isValidOriginFormPath(path)) return { kind: "INVALID" };
    return {
      kind: "FOLLOW",
      request: {
        protocol: destination.protocol,
        method: current.method,
        path,
      },
    };
  } catch {
    return { kind: "INVALID" };
  }
}

function retryable(code: SafeHttpFlowFailureCode): boolean {
  return (
    code === "DNS_LOOKUP_FAILED" ||
    code === "TRANSPORT_ERROR" ||
    code === "TIMEOUT"
  );
}

function readClock(now: () => number): number | null {
  try {
    const value = now();
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

export async function executeSafeHttpFlow(
  inputValue: unknown,
  resolver: DnsAddressResolver,
  configuredInternalCidrs: unknown = [],
  dependencies: SafeHttpFlowDependencies = {},
): Promise<SafeHttpFlowResult> {
  const input = parseInput(inputValue);
  if (!input) return { ok: false, code: "INVALID_FLOW" };
  const now = dependencies.now ?? Date.now;
  const transport = dependencies.transport ?? executePinnedRequest;
  let current: CurrentRequest = {
    protocol: input.protocol,
    method: input.method,
    path: input.path,
  };
  let retries = 0;
  let requestCount = 0;
  let redirectCount = 0;
  let totalResponseBytes = 0;

  while (true) {
    const resolutionTime = readClock(now);
    if (resolutionTime === null) {
      return { ok: false, code: "ORCHESTRATION_FAILED" };
    }
    if (resolutionTime >= input.deadline_unix_ms) {
      return { ok: false, code: "FLOW_DEADLINE_EXCEEDED" };
    }
    const resolved = await resolveAndClassifyHostname(
      input.canonical_host,
      resolver,
      configuredInternalCidrs,
      resolutionTime,
    );
    if (!resolved.ok) {
      if (retryable(resolved.code) && retries < input.max_retries) {
        retries += 1;
        continue;
      }
      return { ok: false, code: resolved.code };
    }

    const requestTime = readClock(now);
    if (requestTime === null) {
      return { ok: false, code: "ORCHESTRATION_FAILED" };
    }
    const remainingMs = input.deadline_unix_ms - requestTime;
    if (remainingMs < 100) {
      return { ok: false, code: "FLOW_DEADLINE_EXCEEDED" };
    }
    const limits = Object.freeze({
      ...input.transport_limits,
      timeout_ms: Math.min(input.transport_limits.timeout_ms, remainingMs),
    });
    const pin =
      resolved.target.addresses[retries % resolved.target.addresses.length]!;
    let dispatched: PinnedTransportResult;
    try {
      dispatched = await transport(
        resolved.target,
        {
          ...current,
          pinned_address: pin.address,
          now_unix_ms: requestTime,
        },
        limits,
        configuredInternalCidrs,
      );
    } catch {
      return { ok: false, code: "ORCHESTRATION_FAILED" };
    }
    requestCount += 1;
    if (!dispatched.ok) {
      if (retryable(dispatched.code) && retries < input.max_retries) {
        retries += 1;
        continue;
      }
      return { ok: false, code: dispatched.code };
    }
    const completedAt = readClock(now);
    if (completedAt === null) {
      return { ok: false, code: "ORCHESTRATION_FAILED" };
    }
    if (completedAt >= input.deadline_unix_ms) {
      return { ok: false, code: "FLOW_DEADLINE_EXCEEDED" };
    }

    totalResponseBytes += dispatched.response.body.byteLength;
    if (totalResponseBytes > input.max_total_response_bytes) {
      return { ok: false, code: "TOTAL_RESPONSE_LIMIT_EXCEEDED" };
    }
    const redirect = redirectDecision(
      dispatched.response,
      current,
      input.canonical_host,
    );
    if (redirect.kind === "NONE" || redirect.kind === "CROSS_HOST") {
      return {
        ok: true,
        response: dispatched.response,
        request_count: requestCount,
        redirect_count: redirectCount,
        stop_reason:
          redirect.kind === "NONE" ? "COMPLETE" : "CROSS_HOST_REDIRECT",
      };
    }
    if (redirect.kind === "INVALID") {
      return { ok: false, code: "INVALID_REDIRECT" };
    }
    if (redirect.kind === "DOWNGRADE") {
      return { ok: false, code: "REDIRECT_DOWNGRADE" };
    }
    if (redirectCount >= input.max_redirects) {
      return { ok: false, code: "REDIRECT_LIMIT_EXCEEDED" };
    }
    redirectCount += 1;
    retries = 0;
    current = redirect.request;
  }
}
