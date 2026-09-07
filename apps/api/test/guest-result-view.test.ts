import { describe, expect, it } from "vitest";

import { GUEST_RESULT_SECURITY_HEADERS } from "../src/guest-crypto/index.js";
import { createGuestResultView } from "../src/guest-result/index.js";

const NOW = 1_800_000_000n;

function input(overrides: Record<string, unknown> = {}) {
  return {
    access: {
      guest_scan_id: "guest_scan_01",
      result_access_expires_at_unix_seconds: NOW + 1_800n,
      result_token_expires_in_seconds: 1_800,
      response_headers: GUEST_RESULT_SECURITY_HEADERS,
    },
    completed_at_unix_seconds: NOW - 1n,
    projection: {
      schema_version: 1,
      canonical_host: "example.com",
      posture: [
        { check_id: "TLS_CERTIFICATE", outcome: "PASS" },
        { check_id: "DNS_DNSSEC", outcome: "ATTENTION" },
        { check_id: "MAIL_DMARC", outcome: "UNKNOWN" },
        { check_id: "HTTP_HSTS", outcome: "PASS" },
      ],
      potential_risk_count: 2,
      coverage: [
        {
          detector_group: "TARGET_RESOLUTION",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
        {
          detector_group: "DNS_DOMAIN_POSTURE",
          execution_status: "SUCCESS",
          completeness: "PARTIAL",
        },
        {
          detector_group: "TLS_CERTIFICATE_POSTURE",
          execution_status: "TIMED_OUT",
          completeness: "UNKNOWN",
        },
        {
          detector_group: "MAIL_SECURITY_POSTURE",
          execution_status: "SUCCESS",
          completeness: "NOT_APPLICABLE",
        },
      ],
      warning_count: 1,
      execution: {
        policy_version: "1.0.0",
        duration_ms: 1_200,
        request_count: 8,
      },
    },
    ...overrides,
  };
}

describe("sanitized Guest result view", () => {
  it("builds stable posture sections and honest complete coverage inventory", () => {
    const result = createGuestResultView(input());
    expect(result).toMatchObject({
      ok: true,
      response_headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
      body: {
        guest_scan_id: "guest_scan_01",
        canonical_host: "example.com",
        status: "COMPLETED",
        potential_risk_count: 2,
        coverage: {
          state: "PARTIAL",
          complete_group_count: 1,
          total_group_count: 8,
        },
        limitations: [
          "GUEST_POSTURE_ONLY",
          "NO_SECURITY_SCORE",
          "NO_ABSOLUTE_ASSURANCE",
        ],
      },
    });
    if (!result.ok) throw new Error(result.code);
    expect(
      result.body.posture_sections.map((section) => section.section_id),
    ).toEqual(["INFRASTRUCTURE", "DOMAIN", "MAIL", "TLS", "WEB"]);
    expect(result.body.coverage.groups).toEqual([
      { detector_group: "TARGET_RESOLUTION", state: "COMPLETE" },
      { detector_group: "DNS_DOMAIN_POSTURE", state: "PARTIAL" },
      { detector_group: "TLS_CERTIFICATE_POSTURE", state: "UNAVAILABLE" },
      { detector_group: "HTTP_SECURITY_POSTURE", state: "MISSING" },
      { detector_group: "MAIL_SECURITY_POSTURE", state: "NOT_APPLICABLE" },
      { detector_group: "PUBLIC_INFRASTRUCTURE", state: "MISSING" },
      { detector_group: "RDAP_ENRICHMENT", state: "MISSING" },
      { detector_group: "CT_ENRICHMENT", state: "MISSING" },
    ]);
  });

  it("omits scanner execution details and raw finding/evidence surfaces", () => {
    const result = createGuestResultView(input());
    expect(result).toMatchObject({ ok: true });
    const body = JSON.stringify(result);
    for (const forbidden of [
      "duration_ms",
      "request_count",
      "candidate_findings",
      "evidence",
      "severity",
      "confidence",
      "fingerprint",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("marks coverage insufficient when no detector produced useful coverage", () => {
    const value = input();
    value.projection.coverage = [
      {
        detector_group: "TARGET_RESOLUTION",
        execution_status: "FAILED",
        completeness: "UNKNOWN",
      },
    ];
    expect(createGuestResultView(value)).toMatchObject({
      ok: true,
      body: { coverage: { state: "INSUFFICIENT", complete_group_count: 0 } },
    });
  });

  it("deep-freezes the response body and collections", () => {
    const result = createGuestResultView(input());
    if (!result.ok) throw new Error(result.code);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.body)).toBe(true);
    expect(Object.isFrozen(result.body.posture_sections)).toBe(true);
    expect(Object.isFrozen(result.body.posture_sections[0]?.checks)).toBe(true);
    expect(Object.isFrozen(result.body.coverage.groups)).toBe(true);
    expect(Object.isFrozen(result.body.limitations)).toBe(true);
  });

  it.each([
    { extra: true },
    { completed_at_unix_seconds: NOW + 1n },
    { completed_at_unix_seconds: -1n },
    { access: { ...input().access, result_token_expires_in_seconds: 1_801 } },
    {
      access: {
        ...input().access,
        response_headers: {
          "cache-control": "public",
          "referrer-policy": "no-referrer",
        },
      },
    },
    {
      projection: {
        ...input().projection,
        canonical_host: "HTTPS://example.com",
      },
    },
    { projection: { ...input().projection, raw_findings: [] } },
    { projection: { ...input().projection, potential_risk_count: 257 } },
    {
      projection: {
        ...input().projection,
        coverage: [
          {
            detector_group: "UNKNOWN",
            execution_status: "SUCCESS",
            completeness: "COMPLETE",
          },
        ],
      },
    },
  ])("rejects malformed or disclosure-expanding input %#", (override) => {
    expect(createGuestResultView(input(override))).toEqual({
      ok: false,
      code: "INVALID_GUEST_RESULT_VIEW",
    });
  });

  it("contains hostile and changing persisted getters", () => {
    const hostile = input();
    Object.defineProperty(hostile.projection, "posture", {
      enumerable: true,
      get: () => {
        throw new Error("stored detail");
      },
    });
    expect(createGuestResultView(hostile)).toEqual({
      ok: false,
      code: "INVALID_GUEST_RESULT_VIEW",
    });

    const changing = input();
    let reads = 0;
    Object.defineProperty(changing.projection, "warning_count", {
      enumerable: true,
      get: () => (++reads === 1 ? 1 : 99),
    });
    expect(createGuestResultView(changing)).toMatchObject({
      ok: true,
      body: { warning_count: 1 },
    });
    expect(reads).toBe(1);
  });
});
