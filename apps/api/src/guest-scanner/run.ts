import { createHash } from "node:crypto";

import {
  authorizeScannerExecution,
  type ScannerExecutionRequest,
} from "../scanner-policy/index.js";
import {
  executePinnedRequest,
  executeSafeHttpFlow,
  canonicalizeHostname,
  resolveAndClassifyHostname,
  snapshotConfiguredInternalCidrs,
  type DnsAddressResolver,
  type PinnedTransportExecutor,
  type SafeHttpFlowResult,
} from "../target/index.js";
import { inspectGuestSecurityHeaders } from "./headers.js";
import {
  GUEST_SECURITY_TXT_MAX_BYTES,
  GUEST_SECURITY_TXT_PATH,
  inspectGuestSecurityTxt,
} from "./security-txt.js";

const REQUIRED_CAPABILITIES = [
  "DNS_READ",
  "TLS_HANDSHAKE",
  "HTTP_GET_HEAD",
  "SAME_HOST_REDIRECT",
  "HTTP_HEADER_OBSERVE",
] as const;
const INPUT_KEYS = ["schema_version", "canonical_target", "policy"] as const;
const CHECKS = [
  "DNS_AAAA_PRESENT",
  "DNS_DNSSEC",
  "DNS_CAA",
  "MAIL_SPF",
  "MAIL_DMARC",
  "MAIL_MTA_STS",
  "MAIL_TLS_RPT",
  "TLS_CERTIFICATE",
  "HTTP_HSTS",
  "HTTP_CSP",
  "HTTP_X_CONTENT_TYPE_OPTIONS",
  "HTTP_FRAME_PROTECTION",
  "HTTP_REFERRER_POLICY",
  "HTTP_PERMISSIONS_POLICY",
  "HTTP_PROTOCOL",
  "INFRA_RPKI",
  "SECURITY_TXT",
] as const;
const UNAVAILABLE_COVERAGE = [
  "MAIL_SECURITY_POSTURE",
  "PUBLIC_INFRASTRUCTURE",
  "RDAP_ENRICHMENT",
  "CT_ENRICHMENT",
] as const;

type Check = (typeof CHECKS)[number];
type Outcome = "PASS" | "ATTENTION" | "UNKNOWN";

export interface GuestScannerDependencies {
  now_unix_ms?: () => number;
  transport?: PinnedTransportExecutor;
  configured_internal_cidrs?: unknown;
}

export type GuestScannerRunResult =
  | { ok: true; output: Readonly<Record<string, unknown>> }
  | {
      ok: false;
      code: "INVALID_SCANNER_INPUT" | "INVALID_SCANNER_RUNTIME";
    };

function exact(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length &&
      actual.every((key) => typeof key === "string" && keys.includes(key))
    );
  } catch {
    return false;
  }
}

function scannerInput(value: unknown): {
  canonical_host: string;
  policy: ScannerExecutionRequest;
} | null {
  if (!exact(value, INPUT_KEYS)) return null;
  try {
    const input = value as Record<string, unknown>;
    const decision = authorizeScannerExecution(input.policy);
    const canonical = canonicalizeHostname(input.canonical_target);
    if (
      input.schema_version !== 1 ||
      !canonical.ok ||
      canonical.canonical_host !== input.canonical_target ||
      !decision.allowed ||
      decision.request.profile !== "GUEST_SAFE" ||
      !REQUIRED_CAPABILITIES.every((capability) =>
        decision.request.requested_capabilities.includes(capability),
      ) ||
      decision.request.budgets.hard_duration_seconds < 1 ||
      decision.request.budgets.max_requests < 3 ||
      decision.request.budgets.max_concurrency < 2 ||
      decision.request.budgets.max_response_bytes < 1 ||
      decision.request.budgets.max_total_response_bytes < 1
    ) {
      return null;
    }
    return {
      canonical_host: canonical.canonical_host,
      policy: decision.request,
    };
  } catch {
    return null;
  }
}

function safeNow(now: () => number): number | null {
  try {
    const value = now();
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

function fingerprint(host: string, check: Check): string {
  return `sha256:${createHash("sha256")
    .update("OUTSCAN:GUEST_FINDING:v1\0", "utf8")
    .update(host, "utf8")
    .update("\0", "utf8")
    .update(check, "ascii")
    .digest("hex")}`;
}

function buildOutput(
  host: string,
  startedAt: number,
  completedAt: number,
  requestCount: number,
  resolved: Awaited<ReturnType<typeof resolveAndClassifyHostname>>,
  http: Awaited<ReturnType<typeof executeSafeHttpFlow>> | null,
  securityTxt: SafeHttpFlowResult | null,
) {
  const outcomes = new Map<Check, Outcome>(
    CHECKS.map((check) => [check, "UNKNOWN"]),
  );
  if (resolved.ok) {
    outcomes.set(
      "DNS_AAAA_PRESENT",
      resolved.target.addresses.some((address) => address.family === 6)
        ? "PASS"
        : "ATTENTION",
    );
  }
  if (http?.ok) {
    outcomes.set("TLS_CERTIFICATE", "PASS");
    outcomes.set("HTTP_PROTOCOL", "PASS");
    for (const observation of inspectGuestSecurityHeaders(
      http.response.headers,
    )) {
      outcomes.set(observation.check_id, observation.outcome);
    }
  }
  if (securityTxt?.ok) {
    outcomes.set(
      "SECURITY_TXT",
      securityTxt.stop_reason === "COMPLETE"
        ? inspectGuestSecurityTxt(securityTxt.response, host, completedAt)
        : "ATTENTION",
    );
  }
  const candidateFindings = [...outcomes]
    .filter(
      ([check, outcome]) =>
        (check.startsWith("HTTP_") || check === "SECURITY_TXT") &&
        outcome === "ATTENTION",
    )
    .map(([check]) => ({
      fingerprint: fingerprint(host, check),
      severity:
        check === "HTTP_HSTS" || check === "HTTP_CSP" ? "MEDIUM" : "LOW",
      confidence: 90,
      evidence: `${check}:NOT_ACCEPTED`,
    }));
  const unavailable = UNAVAILABLE_COVERAGE.map((detector_group) => ({
    detector_group,
    execution_status: "FAILED",
    completeness: "UNKNOWN",
  }));
  return Object.freeze({
    observations: [...outcomes].map(([check_id, outcome]) => ({
      check_id,
      outcome,
    })),
    candidate_findings: candidateFindings,
    coverage: [
      {
        detector_group: "TARGET_RESOLUTION",
        execution_status: resolved.ok ? "SUCCESS" : "FAILED",
        completeness: resolved.ok ? "COMPLETE" : "UNKNOWN",
      },
      {
        detector_group: "DNS_DOMAIN_POSTURE",
        execution_status: resolved.ok ? "SUCCESS" : "FAILED",
        completeness: resolved.ok ? "PARTIAL" : "UNKNOWN",
      },
      {
        detector_group: "TLS_CERTIFICATE_POSTURE",
        execution_status: http?.ok ? "SUCCESS" : "FAILED",
        completeness: http?.ok ? "COMPLETE" : "UNKNOWN",
      },
      {
        detector_group: "HTTP_SECURITY_POSTURE",
        execution_status: http?.ok ? "SUCCESS" : "FAILED",
        completeness: http?.ok ? "PARTIAL" : "UNKNOWN",
      },
      ...unavailable,
    ],
    execution_metadata: {
      schema_version: 1,
      profile: "GUEST_SAFE",
      canonical_host: host,
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      duration_ms: Math.max(0, Math.min(30_000, completedAt - startedAt)),
      request_count: requestCount,
    },
    warnings: [
      ...(!resolved.ok ? [{ code: "TARGET_RESOLUTION_UNAVAILABLE" }] : []),
      ...(resolved.ok && !http?.ok
        ? [{ code: "HTTPS_PROBE_UNAVAILABLE" }]
        : []),
      ...(resolved.ok && !securityTxt?.ok
        ? [{ code: "SECURITY_TXT_UNAVAILABLE" }]
        : []),
      ...UNAVAILABLE_COVERAGE.map((group) => ({
        code: `${group}_UNAVAILABLE`,
      })),
    ],
  });
}

export async function runGuestSafeScanner(
  rawInput: unknown,
  resolver: DnsAddressResolver,
  dependencies: GuestScannerDependencies = {},
): Promise<GuestScannerRunResult> {
  const input = scannerInput(rawInput);
  const now = dependencies.now_unix_ms ?? Date.now;
  const configuredInternalCidrs = snapshotConfiguredInternalCidrs(
    dependencies.configured_internal_cidrs ?? [],
  );
  if (!input) return { ok: false, code: "INVALID_SCANNER_INPUT" };
  if (
    typeof resolver?.resolve4 !== "function" ||
    typeof resolver?.resolve6 !== "function" ||
    typeof now !== "function" ||
    !configuredInternalCidrs
  ) {
    return { ok: false, code: "INVALID_SCANNER_RUNTIME" };
  }
  const startedAt = safeNow(now);
  if (startedAt === null) return { ok: false, code: "INVALID_SCANNER_RUNTIME" };
  const durationMs = input.policy.budgets.hard_duration_seconds * 1_000;
  if (!Number.isSafeInteger(startedAt + durationMs)) {
    return { ok: false, code: "INVALID_SCANNER_RUNTIME" };
  }
  let requestCount = 0;
  const reserve = () => {
    if (requestCount >= input.policy.budgets.max_requests) return false;
    requestCount += 1;
    return true;
  };
  const boundedResolver: DnsAddressResolver = {
    resolve4: (host, options) =>
      reserve()
        ? resolver.resolve4(host, options)
        : Promise.reject(new Error("REQUEST_BUDGET_EXCEEDED")),
    resolve6: (host, options) =>
      reserve()
        ? resolver.resolve6(host, options)
        : Promise.reject(new Error("REQUEST_BUDGET_EXCEEDED")),
  };
  const transport = dependencies.transport ?? executePinnedRequest;
  const boundedTransport: PinnedTransportExecutor = (...argumentsValue) =>
    reserve()
      ? transport(...argumentsValue)
      : Promise.resolve({ ok: false, code: "TRANSPORT_ERROR" });
  try {
    const resolved = await resolveAndClassifyHostname(
      input.canonical_host,
      boundedResolver,
      configuredInternalCidrs,
      startedAt,
    );
    const http = resolved.ok
      ? await executeSafeHttpFlow(
          {
            canonical_host: input.canonical_host,
            protocol: "https:",
            method: "GET",
            path: "/",
            deadline_unix_ms: startedAt + durationMs,
            max_redirects: input.policy.budgets.max_redirects,
            max_retries: 0,
            max_total_response_bytes:
              input.policy.budgets.max_total_response_bytes,
            transport_limits: {
              timeout_ms: Math.min(durationMs, 30_000),
              max_response_bytes: Math.min(
                input.policy.budgets.max_response_bytes,
                64 * 1_024,
              ),
              max_header_pairs: 100,
              max_header_bytes: 64 * 1_024,
            },
          },
          boundedResolver,
          configuredInternalCidrs,
          { now, transport: boundedTransport },
        )
      : null;
    const securityTxt = resolved.ok
      ? await executeSafeHttpFlow(
          {
            canonical_host: input.canonical_host,
            protocol: "https:",
            method: "GET",
            path: GUEST_SECURITY_TXT_PATH,
            deadline_unix_ms: startedAt + durationMs,
            max_redirects: input.policy.budgets.max_redirects,
            max_retries: 0,
            max_total_response_bytes: GUEST_SECURITY_TXT_MAX_BYTES,
            transport_limits: {
              timeout_ms: Math.min(durationMs, 30_000),
              max_response_bytes: Math.min(
                input.policy.budgets.max_response_bytes,
                GUEST_SECURITY_TXT_MAX_BYTES,
              ),
              max_header_pairs: 100,
              max_header_bytes: 64 * 1_024,
            },
          },
          boundedResolver,
          configuredInternalCidrs,
          { now, transport: boundedTransport },
        )
      : null;
    const completedAt = safeNow(now);
    if (completedAt === null) {
      return { ok: false, code: "INVALID_SCANNER_RUNTIME" };
    }
    return {
      ok: true,
      output: buildOutput(
        input.canonical_host,
        startedAt,
        completedAt,
        requestCount,
        resolved,
        http,
        securityTxt,
      ),
    };
  } catch {
    return { ok: false, code: "INVALID_SCANNER_RUNTIME" };
  }
}
