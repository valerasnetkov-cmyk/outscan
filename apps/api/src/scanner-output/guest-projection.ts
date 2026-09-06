import { canonicalizeHostname } from "../target/index.js";

const MAX_GUEST_OUTPUT_BYTES = 2 * 1_024 * 1_024;
const MAX_JSON_DEPTH = 32;
const MAX_OBSERVATIONS = 64;
const MAX_FINDINGS = 256;
const MAX_COVERAGE = 16;
const MAX_WARNINGS = 32;
const MAX_EVIDENCE_BYTES = 4_096;
const MACHINE_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const FINGERPRINT = /^sha256:[0-9a-f]{64}$/u;

export const GUEST_POSTURE_CHECKS = Object.freeze([
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
] as const);

export const GUEST_COVERAGE_GROUPS = Object.freeze([
  "TARGET_RESOLUTION",
  "DNS_DOMAIN_POSTURE",
  "TLS_CERTIFICATE_POSTURE",
  "HTTP_SECURITY_POSTURE",
  "MAIL_SECURITY_POSTURE",
  "PUBLIC_INFRASTRUCTURE",
  "RDAP_ENRICHMENT",
  "CT_ENRICHMENT",
] as const);

type GuestPostureCheck = (typeof GUEST_POSTURE_CHECKS)[number];
type GuestCoverageGroup = (typeof GUEST_COVERAGE_GROUPS)[number];
type PostureOutcome = "PASS" | "ATTENTION" | "UNKNOWN" | "NOT_APPLICABLE";
type ExecutionStatus =
  "SUCCESS" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "SUPERSEDED";
type Completeness = "COMPLETE" | "PARTIAL" | "NOT_APPLICABLE" | "UNKNOWN";

export interface GuestPostureObservation {
  check_id: GuestPostureCheck;
  outcome: PostureOutcome;
}

export interface GuestCoverageProjection {
  detector_group: GuestCoverageGroup;
  execution_status: ExecutionStatus;
  completeness: Completeness;
}

export interface SanitizedGuestProjection {
  schema_version: 1;
  canonical_host: string;
  posture: readonly Readonly<GuestPostureObservation>[];
  potential_risk_count: number;
  coverage: readonly Readonly<GuestCoverageProjection>[];
  warning_count: number;
  execution: Readonly<{
    policy_version: "1.0.0";
    duration_ms: number;
    request_count: number;
  }>;
}

export type GuestProjectionResult =
  | { ok: true; projection: SanitizedGuestProjection }
  | {
      ok: false;
      code:
        "INVALID_OUTPUT_LIMIT" | "OUTPUT_TOO_LARGE" | "INVALID_SCANNER_OUTPUT";
    };

const CHECK_SET = new Set<string>(GUEST_POSTURE_CHECKS);
const COVERAGE_SET = new Set<string>(GUEST_COVERAGE_GROUPS);
const OUTCOMES = new Set<string>([
  "PASS",
  "ATTENTION",
  "UNKNOWN",
  "NOT_APPLICABLE",
]);
const EXECUTION_STATUSES = new Set<string>([
  "SUCCESS",
  "FAILED",
  "TIMED_OUT",
  "CANCELLED",
  "SUPERSEDED",
]);
const COMPLETENESS = new Set<string>([
  "COMPLETE",
  "PARTIAL",
  "NOT_APPLICABLE",
  "UNKNOWN",
]);
const SEVERITIES = new Set<string>([
  "INFO",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

function exactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const actual = Reflect.ownKeys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function hasUniqueJsonKeys(text: string): boolean {
  const stack: Array<
    { kind: "array" } | { kind: "object"; keys: Set<string> }
  > = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "{") {
      stack.push({ kind: "object", keys: new Set() });
      if (stack.length > MAX_JSON_DEPTH) return false;
      continue;
    }
    if (character === "[") {
      stack.push({ kind: "array" });
      if (stack.length > MAX_JSON_DEPTH) return false;
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      continue;
    }
    if (character !== '"') continue;

    const start = index;
    let escaped = false;
    for (index += 1; index < text.length; index += 1) {
      const current = text[index];
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        break;
      }
    }
    if (index >= text.length) return false;
    let next = index + 1;
    while (/\s/u.test(text[next] ?? "")) next += 1;
    const context = stack.at(-1);
    if (text[next] !== ":" || context?.kind !== "object") continue;
    let key: unknown;
    try {
      key = JSON.parse(text.slice(start, index + 1));
    } catch {
      return false;
    }
    if (typeof key !== "string" || context.keys.has(key)) return false;
    context.keys.add(key);
  }
  return stack.length === 0;
}

function parseJsonBytes(raw: unknown, maximumBytes: number): unknown | null {
  if (!(raw instanceof Uint8Array) || raw.byteLength > maximumBytes)
    return null;
  if (
    raw.byteLength >= 3 &&
    raw[0] === 0xef &&
    raw[1] === 0xbb &&
    raw[2] === 0xbf
  ) {
    return null;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    if (!hasUniqueJsonKeys(text)) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function parseObservations(value: unknown): GuestPostureObservation[] | null {
  if (!Array.isArray(value) || value.length > MAX_OBSERVATIONS) return null;
  const seen = new Set<string>();
  const output: GuestPostureObservation[] = [];
  for (const entry of value) {
    if (!exactObject(entry, ["check_id", "outcome"])) return null;
    const observation = entry as Record<string, unknown>;
    if (
      typeof observation.check_id !== "string" ||
      !CHECK_SET.has(observation.check_id) ||
      seen.has(observation.check_id) ||
      typeof observation.outcome !== "string" ||
      !OUTCOMES.has(observation.outcome)
    ) {
      return null;
    }
    seen.add(observation.check_id);
    output.push({
      check_id: observation.check_id as GuestPostureCheck,
      outcome: observation.outcome as PostureOutcome,
    });
  }
  return output.sort((left, right) =>
    left.check_id.localeCompare(right.check_id),
  );
}

function parseCoverage(value: unknown): GuestCoverageProjection[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_COVERAGE
  ) {
    return null;
  }
  const seen = new Set<string>();
  const output: GuestCoverageProjection[] = [];
  for (const entry of value) {
    if (
      !exactObject(entry, [
        "detector_group",
        "execution_status",
        "completeness",
      ])
    ) {
      return null;
    }
    const coverage = entry as Record<string, unknown>;
    if (
      typeof coverage.detector_group !== "string" ||
      !COVERAGE_SET.has(coverage.detector_group) ||
      seen.has(coverage.detector_group) ||
      typeof coverage.execution_status !== "string" ||
      !EXECUTION_STATUSES.has(coverage.execution_status) ||
      typeof coverage.completeness !== "string" ||
      !COMPLETENESS.has(coverage.completeness)
    ) {
      return null;
    }
    seen.add(coverage.detector_group);
    output.push({
      detector_group: coverage.detector_group as GuestCoverageGroup,
      execution_status: coverage.execution_status as ExecutionStatus,
      completeness: coverage.completeness as Completeness,
    });
  }
  return output.sort((left, right) =>
    left.detector_group.localeCompare(right.detector_group),
  );
}

function findingCount(value: unknown): number | null {
  if (!Array.isArray(value) || value.length > MAX_FINDINGS) return null;
  const fingerprints = new Set<string>();
  for (const entry of value) {
    if (
      !exactObject(entry, ["fingerprint", "severity", "confidence", "evidence"])
    ) {
      return null;
    }
    const finding = entry as Record<string, unknown>;
    if (
      typeof finding.fingerprint !== "string" ||
      !FINGERPRINT.test(finding.fingerprint) ||
      typeof finding.severity !== "string" ||
      !SEVERITIES.has(finding.severity) ||
      !boundedInteger(finding.confidence, 0, 100) ||
      typeof finding.evidence !== "string" ||
      Buffer.byteLength(finding.evidence, "utf8") > MAX_EVIDENCE_BYTES
    ) {
      return null;
    }
    fingerprints.add(finding.fingerprint);
  }
  return fingerprints.size;
}

function warningCount(value: unknown): number | null {
  if (!Array.isArray(value) || value.length > MAX_WARNINGS) return null;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!exactObject(entry, ["code"])) return null;
    const code = (entry as Record<string, unknown>).code;
    if (
      typeof code !== "string" ||
      !MACHINE_CODE.test(code) ||
      seen.has(code)
    ) {
      return null;
    }
    seen.add(code);
  }
  return value.length;
}

export function projectGuestScannerOutput(
  raw: unknown,
  maximumBytes: unknown,
): GuestProjectionResult {
  if (!boundedInteger(maximumBytes, 1, MAX_GUEST_OUTPUT_BYTES)) {
    return { ok: false, code: "INVALID_OUTPUT_LIMIT" };
  }
  if (raw instanceof Uint8Array && raw.byteLength > (maximumBytes as number)) {
    return { ok: false, code: "OUTPUT_TOO_LARGE" };
  }
  const parsed = parseJsonBytes(raw, maximumBytes as number);
  if (
    !exactObject(parsed, [
      "observations",
      "candidate_findings",
      "coverage",
      "execution_metadata",
      "warnings",
    ])
  ) {
    return { ok: false, code: "INVALID_SCANNER_OUTPUT" };
  }
  const envelope = parsed as Record<string, unknown>;
  const observations = parseObservations(envelope.observations);
  const potentialRiskCount = findingCount(envelope.candidate_findings);
  const coverage = parseCoverage(envelope.coverage);
  const warningTotal = warningCount(envelope.warnings);
  const metadata = envelope.execution_metadata;
  if (
    !observations ||
    potentialRiskCount === null ||
    !coverage ||
    warningTotal === null ||
    !exactObject(metadata, [
      "schema_version",
      "profile",
      "canonical_host",
      "policy_id",
      "policy_version",
      "duration_ms",
      "request_count",
    ])
  ) {
    return { ok: false, code: "INVALID_SCANNER_OUTPUT" };
  }
  const execution = metadata as Record<string, unknown>;
  const host = canonicalizeHostname(execution.canonical_host);
  if (
    !host.ok ||
    host.canonical_host !== execution.canonical_host ||
    execution.schema_version !== 1 ||
    execution.profile !== "GUEST_SAFE" ||
    execution.policy_id !== "outscan-v1" ||
    execution.policy_version !== "1.0.0" ||
    !boundedInteger(execution.duration_ms, 0, 30_000) ||
    !boundedInteger(execution.request_count, 0, 40)
  ) {
    return { ok: false, code: "INVALID_SCANNER_OUTPUT" };
  }
  return {
    ok: true,
    projection: Object.freeze({
      schema_version: 1,
      canonical_host: host.canonical_host,
      posture: Object.freeze(observations.map((item) => Object.freeze(item))),
      potential_risk_count: potentialRiskCount,
      coverage: Object.freeze(coverage.map((item) => Object.freeze(item))),
      warning_count: warningTotal,
      execution: Object.freeze({
        policy_version: "1.0.0",
        duration_ms: execution.duration_ms as number,
        request_count: execution.request_count as number,
      }),
    }),
  };
}
