import { isDeepStrictEqual } from "node:util";

import { GUEST_RESULT_SECURITY_HEADERS } from "../guest-crypto/index.js";
import { createGuestResultView } from "../guest-result/index.js";
import type { ReadGuestResultDecision } from "../guest-scan/index.js";
import {
  GUEST_COVERAGE_GROUPS,
  GUEST_POSTURE_CHECKS,
} from "../scanner-output/index.js";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function seconds(value: unknown): bigint | null {
  if (typeof value !== "string" || value.length !== 24) return null;
  const milliseconds = Date.parse(value);
  return Number.isSafeInteger(milliseconds) &&
    milliseconds >= 0 &&
    milliseconds % 1000 === 0
    ? BigInt(milliseconds / 1000)
    : null;
}

// Rebuild through the canonical view builder, then require exact equality.
// Only the rebuilt data is returned; service objects/toJSON never reach reply.send.
export function projectGuestResultDecision(
  value: unknown,
  scanId: string,
  now: bigint,
): ReadGuestResultDecision | null {
  try {
    if (!record(value)) return null;
    if (value.ok === false) {
      for (const code of [
        "INVALID_RESULT_REQUEST",
        "RESULT_ACCESS_DENIED",
      ] as const) {
        const denial = { ok: false as const, code };
        if (isDeepStrictEqual(value, denial)) return denial;
      }
      return null;
    }
    if (value.ok !== true || !record(value.body)) return null;
    const body = value.body;
    const expires = seconds(body.result_access_expires_at);
    const completed = seconds(body.completed_at);
    if (
      expires === null ||
      completed === null ||
      expires <= now ||
      expires - now > 1800n ||
      completed > now
    )
      return null;
    if (
      !Array.isArray(body.posture_sections) ||
      body.posture_sections.length !== 5 ||
      !record(body.coverage)
    )
      return null;
    const posture = body.posture_sections.flatMap((section: unknown) => {
      if (
        !record(section) ||
        !Array.isArray(section.checks) ||
        section.checks.length > GUEST_POSTURE_CHECKS.length
      )
        throw new Error();
      return section.checks;
    });
    const groups = body.coverage.groups;
    if (
      !Array.isArray(groups) ||
      groups.length !== GUEST_COVERAGE_GROUPS.length
    )
      return null;
    const coverage = groups.flatMap((group: unknown) => {
      if (!record(group)) throw new Error();
      const state = group.state;
      if (state === "MISSING") return [];
      if (
        state !== "UNAVAILABLE" &&
        state !== "COMPLETE" &&
        state !== "PARTIAL" &&
        state !== "NOT_APPLICABLE" &&
        state !== "UNKNOWN"
      )
        throw new Error();
      return [
        {
          detector_group: group.detector_group,
          execution_status: state === "UNAVAILABLE" ? "FAILED" : "SUCCESS",
          completeness: state === "UNAVAILABLE" ? "UNKNOWN" : state,
        },
      ];
    });
    const rebuilt = createGuestResultView({
      access: {
        guest_scan_id: scanId,
        result_access_expires_at_unix_seconds: expires,
        result_token_expires_in_seconds: Number(expires - now),
        response_headers: GUEST_RESULT_SECURITY_HEADERS,
      },
      completed_at_unix_seconds: completed,
      projection: {
        schema_version: 1,
        canonical_host: body.canonical_host,
        posture,
        potential_risk_count: body.potential_risk_count,
        warning_count: body.warning_count,
        coverage,
        // Private execution metadata is not reconstructed from public input.
        execution: {
          policy_version: "1.0.0",
          duration_ms: 0,
          request_count: 0,
        },
      },
    });
    return rebuilt.ok && isDeepStrictEqual(value, rebuilt) ? rebuilt : null;
  } catch {
    return null;
  }
}
