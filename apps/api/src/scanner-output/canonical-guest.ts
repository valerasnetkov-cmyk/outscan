import { createHash } from "node:crypto";

import {
  projectGuestScannerOutput,
  type GuestProjectionResult,
  type SanitizedGuestProjection,
} from "./guest-projection.js";

export const GUEST_EVIDENCE_REDACTION = "[REDACTED:UNTRUSTED_EVIDENCE]";

interface ValidatedGuestEnvelope {
  observations: Array<{ check_id: string; outcome: string }>;
  candidate_findings: Array<{
    fingerprint: string;
    severity: string;
    confidence: number;
    evidence: string;
  }>;
  coverage: Array<{
    detector_group: string;
    execution_status: string;
    completeness: string;
  }>;
  execution_metadata: {
    schema_version: 1;
    profile: "GUEST_SAFE";
    canonical_host: string;
    policy_id: "outscan-v1";
    policy_version: "1.0.0";
    duration_ms: number;
    request_count: number;
  };
  warnings: Array<{ code: string }>;
}

export interface CanonicalGuestScannerResult {
  schema_version: 1;
  payload_digest: string;
  payload_size: number;
  projection: SanitizedGuestProjection;
  read_canonical_payload: () => Uint8Array;
}

export type CanonicalGuestScannerResultDecision =
  | { ok: true; result: Readonly<CanonicalGuestScannerResult> }
  | Extract<GuestProjectionResult, { ok: false }>;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFindings(
  left: ValidatedGuestEnvelope["candidate_findings"][number],
  right: ValidatedGuestEnvelope["candidate_findings"][number],
): number {
  return (
    compareText(left.fingerprint, right.fingerprint) ||
    compareText(left.severity, right.severity) ||
    left.confidence - right.confidence
  );
}

function canonicalObject(input: ValidatedGuestEnvelope) {
  return {
    observations: input.observations
      .map((item) => ({ check_id: item.check_id, outcome: item.outcome }))
      .sort((left, right) => compareText(left.check_id, right.check_id)),
    candidate_findings: input.candidate_findings
      .map((item) => ({
        fingerprint: item.fingerprint,
        severity: item.severity,
        confidence: item.confidence,
        evidence: GUEST_EVIDENCE_REDACTION,
      }))
      .sort(compareFindings),
    coverage: input.coverage
      .map((item) => ({
        detector_group: item.detector_group,
        execution_status: item.execution_status,
        completeness: item.completeness,
      }))
      .sort((left, right) =>
        compareText(left.detector_group, right.detector_group),
      ),
    execution_metadata: {
      schema_version: 1,
      profile: "GUEST_SAFE",
      canonical_host: input.execution_metadata.canonical_host,
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      duration_ms: input.execution_metadata.duration_ms,
      request_count: input.execution_metadata.request_count,
    },
    warnings: input.warnings
      .map((item) => ({ code: item.code }))
      .sort((left, right) => compareText(left.code, right.code)),
  };
}

export function produceCanonicalGuestScannerResult(
  raw: unknown,
  maximumBytes: unknown,
): CanonicalGuestScannerResultDecision {
  if (!(raw instanceof Uint8Array)) {
    return { ok: false, code: "INVALID_SCANNER_OUTPUT" };
  }
  const snapshot = Buffer.from(raw);
  const projected = projectGuestScannerOutput(snapshot, maximumBytes);
  if (!projected.ok) return projected;

  let parsed: ValidatedGuestEnvelope;
  try {
    parsed = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(snapshot),
    ) as ValidatedGuestEnvelope;
  } catch {
    return { ok: false, code: "INVALID_SCANNER_OUTPUT" };
  }

  const canonicalPayload = Buffer.from(
    JSON.stringify(canonicalObject(parsed)),
    "utf8",
  );
  if (canonicalPayload.byteLength > (maximumBytes as number)) {
    return { ok: false, code: "OUTPUT_TOO_LARGE" };
  }
  const payloadDigest = `sha256:${createHash("sha256")
    .update(canonicalPayload)
    .digest("hex")}`;

  return {
    ok: true,
    result: Object.freeze({
      schema_version: 1,
      payload_digest: payloadDigest,
      payload_size: canonicalPayload.byteLength,
      projection: projected.projection,
      read_canonical_payload: () => Buffer.from(canonicalPayload),
    }),
  };
}
