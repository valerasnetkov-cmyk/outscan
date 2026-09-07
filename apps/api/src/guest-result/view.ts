import {
  GUEST_RESULT_SECURITY_HEADERS,
  type GuestResultAccessResult,
} from "../guest-crypto/index.js";
import {
  GUEST_COVERAGE_GROUPS,
  GUEST_POSTURE_CHECKS,
  type Completeness,
  type ExecutionStatus,
  type GuestCoverageGroup,
  type GuestPostureCheck,
  type PostureOutcome,
  type SanitizedGuestProjection,
} from "../scanner-output/index.js";
import { canonicalizeHostname } from "../target/index.js";

const MAX_RESULT_WINDOW_SECONDS = 1_800;
const MAX_UNIX_SECONDS_FOR_ISO = 253_402_300_799n;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const OUTCOMES = new Set(["PASS", "ATTENTION", "UNKNOWN", "NOT_APPLICABLE"]);
const EXECUTION_STATUSES = new Set([
  "SUCCESS",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "SUPERSEDED",
]);
const COMPLETENESS = new Set([
  "COMPLETE",
  "PARTIAL",
  "NOT_APPLICABLE",
  "UNKNOWN",
]);
const CHECKS = new Set<string>(GUEST_POSTURE_CHECKS);
const COVERAGE = new Set<string>(GUEST_COVERAGE_GROUPS);
const GUEST_RESULT_LIMITATIONS = Object.freeze([
  "GUEST_POSTURE_ONLY",
  "NO_SECURITY_SCORE",
  "NO_ABSOLUTE_ASSURANCE",
] as const);

const SECTION_CHECKS = Object.freeze({
  INFRASTRUCTURE: ["DNS_AAAA_PRESENT", "INFRA_RPKI"],
  DOMAIN: ["DNS_DNSSEC", "DNS_CAA", "SECURITY_TXT"],
  MAIL: ["MAIL_SPF", "MAIL_DMARC", "MAIL_MTA_STS", "MAIL_TLS_RPT"],
  TLS: ["TLS_CERTIFICATE"],
  WEB: [
    "HTTP_HSTS",
    "HTTP_CSP",
    "HTTP_X_CONTENT_TYPE_OPTIONS",
    "HTTP_FRAME_PROTECTION",
    "HTTP_REFERRER_POLICY",
    "HTTP_PERMISSIONS_POLICY",
    "HTTP_PROTOCOL",
  ],
} as const satisfies Record<string, readonly GuestPostureCheck[]>);

type GuestResultAccess = Extract<
  GuestResultAccessResult,
  { ok: true }
>["access"];
type PublicCoverageState =
  | "COMPLETE"
  | "PARTIAL"
  | "NOT_APPLICABLE"
  | "UNKNOWN"
  | "UNAVAILABLE"
  | "MISSING";

export interface GuestResultView {
  schema_version: 1;
  guest_scan_id: string;
  canonical_host: string;
  status: "COMPLETED";
  completed_at: string;
  result_access_expires_at: string;
  posture_sections: readonly Readonly<{
    section_id: keyof typeof SECTION_CHECKS;
    checks: readonly Readonly<{
      check_id: GuestPostureCheck;
      outcome: PostureOutcome;
    }>[];
  }>[];
  potential_risk_count: number;
  warning_count: number;
  coverage: Readonly<{
    state: "COMPLETE" | "PARTIAL" | "INSUFFICIENT";
    complete_group_count: number;
    total_group_count: number;
    groups: readonly Readonly<{
      detector_group: GuestCoverageGroup;
      state: PublicCoverageState;
    }>[];
  }>;
  limitations: readonly [
    "GUEST_POSTURE_ONLY",
    "NO_SECURITY_SCORE",
    "NO_ABSOLUTE_ASSURANCE",
  ];
}

export type GuestResultViewDecision =
  | {
      ok: true;
      response_headers: typeof GUEST_RESULT_SECURITY_HEADERS;
      body: Readonly<GuestResultView>;
    }
  | { ok: false; code: "INVALID_GUEST_RESULT_VIEW" };

const INPUT_KEYS = ["access", "completed_at_unix_seconds", "projection"];
const ACCESS_KEYS = [
  "guest_scan_id",
  "result_access_expires_at_unix_seconds",
  "result_token_expires_in_seconds",
  "response_headers",
];
const PROJECTION_KEYS = [
  "schema_version",
  "canonical_host",
  "posture",
  "potential_risk_count",
  "coverage",
  "warning_count",
  "execution",
];

function exact(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function integer(value: unknown, maximum: number): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= maximum
  );
}

function snapshotAccess(value: unknown): GuestResultAccess | null {
  if (!exact(value, ACCESS_KEYS)) return null;
  try {
    const id = value.guest_scan_id;
    const expires = value.result_access_expires_at_unix_seconds;
    const remaining = value.result_token_expires_in_seconds;
    const headers = value.response_headers;
    if (
      typeof id !== "string" ||
      !ID_PATTERN.test(id) ||
      typeof expires !== "bigint" ||
      expires < 1n ||
      expires > MAX_UNIX_SECONDS_FOR_ISO ||
      !Number.isSafeInteger(remaining) ||
      (remaining as number) < 1 ||
      (remaining as number) > MAX_RESULT_WINDOW_SECONDS ||
      !exact(headers, ["cache-control", "referrer-policy"]) ||
      headers["cache-control"] !== "no-store" ||
      headers["referrer-policy"] !== "no-referrer"
    )
      return null;
    return Object.freeze({
      guest_scan_id: id,
      result_access_expires_at_unix_seconds: expires,
      result_token_expires_in_seconds: remaining as number,
      response_headers: GUEST_RESULT_SECURITY_HEADERS,
    });
  } catch {
    return null;
  }
}

export function snapshotSanitizedGuestProjection(
  value: unknown,
): SanitizedGuestProjection | null {
  if (!exact(value, PROJECTION_KEYS)) return null;
  try {
    const schemaVersion = value.schema_version;
    const canonicalHost = value.canonical_host;
    const postureValue = value.posture;
    const riskCount = value.potential_risk_count;
    const coverageValue = value.coverage;
    const warningCount = value.warning_count;
    const executionValue = value.execution;
    const host = canonicalizeHostname(canonicalHost);
    if (
      !host.ok ||
      host.canonical_host !== canonicalHost ||
      schemaVersion !== 1
    )
      return null;
    if (
      !Array.isArray(postureValue) ||
      postureValue.length > GUEST_POSTURE_CHECKS.length
    )
      return null;
    const seenChecks = new Set<string>();
    const posture = postureValue.map((item) => {
      if (!exact(item, ["check_id", "outcome"])) throw new Error("posture");
      const check = item.check_id;
      const outcome = item.outcome;
      if (
        typeof check !== "string" ||
        !CHECKS.has(check) ||
        seenChecks.has(check) ||
        typeof outcome !== "string" ||
        !OUTCOMES.has(outcome)
      )
        throw new Error("posture");
      seenChecks.add(check);
      return Object.freeze({
        check_id: check as GuestPostureCheck,
        outcome: outcome as PostureOutcome,
      });
    });
    if (
      !Array.isArray(coverageValue) ||
      coverageValue.length < 1 ||
      coverageValue.length > GUEST_COVERAGE_GROUPS.length
    )
      return null;
    const seenCoverage = new Set<string>();
    const coverage = coverageValue.map((item) => {
      if (!exact(item, ["detector_group", "execution_status", "completeness"]))
        throw new Error("coverage");
      const group = item.detector_group;
      const status = item.execution_status;
      const completeness = item.completeness;
      if (
        typeof group !== "string" ||
        !COVERAGE.has(group) ||
        seenCoverage.has(group) ||
        typeof status !== "string" ||
        !EXECUTION_STATUSES.has(status) ||
        typeof completeness !== "string" ||
        !COMPLETENESS.has(completeness)
      )
        throw new Error("coverage");
      seenCoverage.add(group);
      return Object.freeze({
        detector_group: group as GuestCoverageGroup,
        execution_status: status as ExecutionStatus,
        completeness: completeness as Completeness,
      });
    });
    if (
      !integer(riskCount, 256) ||
      !integer(warningCount, 32) ||
      !exact(executionValue, ["policy_version", "duration_ms", "request_count"])
    )
      return null;
    const policyVersion = executionValue.policy_version;
    const duration = executionValue.duration_ms;
    const requestCount = executionValue.request_count;
    if (
      policyVersion !== "1.0.0" ||
      !integer(duration, 30_000) ||
      !integer(requestCount, 40)
    )
      return null;
    return Object.freeze({
      schema_version: 1,
      canonical_host: host.canonical_host,
      posture: Object.freeze(posture),
      potential_risk_count: riskCount,
      coverage: Object.freeze(coverage),
      warning_count: warningCount,
      execution: Object.freeze({
        policy_version: "1.0.0",
        duration_ms: duration,
        request_count: requestCount,
      }),
    });
  } catch {
    return null;
  }
}

function publicCoverageState(
  status: ExecutionStatus,
  completeness: Completeness,
): PublicCoverageState {
  if (completeness === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  if (status !== "SUCCESS") return "UNAVAILABLE";
  return completeness;
}

export function createGuestResultView(value: unknown): GuestResultViewDecision {
  if (!exact(value, INPUT_KEYS))
    return { ok: false, code: "INVALID_GUEST_RESULT_VIEW" };
  try {
    const access = snapshotAccess(value.access);
    const projection = snapshotSanitizedGuestProjection(value.projection);
    const completed = value.completed_at_unix_seconds;
    if (
      !access ||
      !projection ||
      typeof completed !== "bigint" ||
      completed < 0n ||
      completed > MAX_UNIX_SECONDS_FOR_ISO
    )
      return { ok: false, code: "INVALID_GUEST_RESULT_VIEW" };
    const authorizedAt =
      access.result_access_expires_at_unix_seconds -
      BigInt(access.result_token_expires_in_seconds);
    if (completed > authorizedAt)
      return { ok: false, code: "INVALID_GUEST_RESULT_VIEW" };

    const postureById = new Map(
      projection.posture.map((item) => [item.check_id, item]),
    );
    const sections = Object.entries(SECTION_CHECKS).map(([sectionId, checks]) =>
      Object.freeze({
        section_id: sectionId as keyof typeof SECTION_CHECKS,
        checks: Object.freeze(
          checks.flatMap((checkId) => {
            const item = postureById.get(checkId);
            return item ? [Object.freeze({ ...item })] : [];
          }),
        ),
      }),
    );
    const coverageById = new Map(
      projection.coverage.map((item) => [item.detector_group, item]),
    );
    const groups = GUEST_COVERAGE_GROUPS.map((group) => {
      const item = coverageById.get(group);
      return Object.freeze({
        detector_group: group,
        state: item
          ? publicCoverageState(item.execution_status, item.completeness)
          : "MISSING",
      });
    });
    const resolved = groups.filter(
      (item) => item.state === "COMPLETE" || item.state === "NOT_APPLICABLE",
    ).length;
    const complete = groups.filter((item) => item.state === "COMPLETE").length;
    const useful = groups.some(
      (item) => item.state === "COMPLETE" || item.state === "PARTIAL",
    );
    const state =
      resolved === groups.length
        ? "COMPLETE"
        : useful
          ? "PARTIAL"
          : "INSUFFICIENT";
    return Object.freeze({
      ok: true,
      response_headers: GUEST_RESULT_SECURITY_HEADERS,
      body: Object.freeze({
        schema_version: 1,
        guest_scan_id: access.guest_scan_id,
        canonical_host: projection.canonical_host,
        status: "COMPLETED",
        completed_at: new Date(Number(completed) * 1_000).toISOString(),
        result_access_expires_at: new Date(
          Number(access.result_access_expires_at_unix_seconds) * 1_000,
        ).toISOString(),
        posture_sections: Object.freeze(sections),
        potential_risk_count: projection.potential_risk_count,
        warning_count: projection.warning_count,
        coverage: Object.freeze({
          state,
          complete_group_count: complete,
          total_group_count: groups.length,
          groups: Object.freeze(groups),
        }),
        limitations: GUEST_RESULT_LIMITATIONS,
      }),
    });
  } catch {
    return { ok: false, code: "INVALID_GUEST_RESULT_VIEW" };
  }
}
