import { describe, expect, it } from "vitest";

import { projectGuestScannerOutput } from "../src/scanner-output/index.js";

function fingerprint(character: string) {
  return `sha256:${character.repeat(64)}`;
}

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    observations: [
      { check_id: "TLS_CERTIFICATE", outcome: "PASS" },
      { check_id: "DNS_DNSSEC", outcome: "ATTENTION" },
    ],
    candidate_findings: [
      {
        fingerprint: fingerprint("1"),
        severity: "MEDIUM",
        confidence: 80,
        evidence: "internal evidence",
      },
    ],
    coverage: [
      {
        detector_group: "TLS_CERTIFICATE_POSTURE",
        execution_status: "SUCCESS",
        completeness: "COMPLETE",
      },
      {
        detector_group: "DNS_DOMAIN_POSTURE",
        execution_status: "SUCCESS",
        completeness: "COMPLETE",
      },
    ],
    execution_metadata: {
      schema_version: 1,
      profile: "GUEST_SAFE",
      canonical_host: "example.com",
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      duration_ms: 1_200,
      request_count: 8,
    },
    warnings: [{ code: "PARTIAL_RDAP_DATA" }],
    ...overrides,
  };
}

function bytes(value: unknown = envelope()) {
  return Buffer.from(JSON.stringify(value));
}

describe("Guest scanner-output projection", () => {
  it("normalizes deterministic posture and exposes only an aggregate risk count", () => {
    const result = projectGuestScannerOutput(bytes(), 64 * 1_024);
    expect(result).toEqual({
      ok: true,
      projection: {
        schema_version: 1,
        canonical_host: "example.com",
        posture: [
          { check_id: "DNS_DNSSEC", outcome: "ATTENTION" },
          { check_id: "TLS_CERTIFICATE", outcome: "PASS" },
        ],
        potential_risk_count: 1,
        coverage: [
          {
            detector_group: "DNS_DOMAIN_POSTURE",
            execution_status: "SUCCESS",
            completeness: "COMPLETE",
          },
          {
            detector_group: "TLS_CERTIFICATE_POSTURE",
            execution_status: "SUCCESS",
            completeness: "COMPLETE",
          },
        ],
        warning_count: 1,
        execution: {
          policy_version: "1.0.0",
          duration_ms: 1_200,
          request_count: 8,
        },
      },
    });
  });

  it("deduplicates findings by canonical fingerprint", () => {
    const finding = {
      fingerprint: fingerprint("2"),
      severity: "HIGH",
      confidence: 90,
      evidence: "first",
    };
    const result = projectGuestScannerOutput(
      bytes({
        ...envelope(),
        candidate_findings: [finding, { ...finding, evidence: "second" }],
      }),
      64 * 1_024,
    );
    expect(result).toMatchObject({
      ok: true,
      projection: { potential_risk_count: 1 },
    });
  });

  it("discards hostile evidence, CVE, endpoint and markup content", () => {
    const secret =
      '<script>alert(1)</script> CVE-2026-9999 https://internal.example/admin\r\n=HYPERLINK("bad")';
    const result = projectGuestScannerOutput(
      bytes({
        ...envelope(),
        candidate_findings: [
          {
            fingerprint: fingerprint("3"),
            severity: "CRITICAL",
            confidence: 100,
            evidence: secret,
          },
        ],
      }),
      64 * 1_024,
    );
    expect(result).toMatchObject({ ok: true });
    expect(JSON.stringify(result)).not.toContain(secret);
    if (!result.ok) throw new Error("Expected projection.");
    expect(Reflect.ownKeys(result.projection)).not.toContain(
      "candidate_findings",
    );
    expect(result.projection.potential_risk_count).toBe(1);
  });

  it("deep-freezes the returned projection collections", () => {
    const result = projectGuestScannerOutput(bytes(), 64 * 1_024);
    if (!result.ok) throw new Error("Expected projection.");
    expect(Object.isFrozen(result.projection)).toBe(true);
    expect(Object.isFrozen(result.projection.posture)).toBe(true);
    expect(Object.isFrozen(result.projection.posture[0])).toBe(true);
    expect(Object.isFrozen(result.projection.coverage)).toBe(true);
    expect(Object.isFrozen(result.projection.coverage[0])).toBe(true);
    expect(Object.isFrozen(result.projection.execution)).toBe(true);
  });

  it.each([0, 2 * 1_024 * 1_024 + 1, 1.5, "1024"])(
    "rejects invalid output limit %s",
    (limit) => {
      expect(projectGuestScannerOutput(bytes(), limit)).toEqual({
        ok: false,
        code: "INVALID_OUTPUT_LIMIT",
      });
    },
  );

  it("rejects bytes beyond the configured limit before parsing", () => {
    expect(projectGuestScannerOutput(bytes(), 10)).toEqual({
      ok: false,
      code: "OUTPUT_TOO_LARGE",
    });
  });

  it.each([
    Buffer.from([0xff]),
    Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
    Buffer.from("not-json"),
    Buffer.from("{} trailing"),
    "not-bytes",
  ])("rejects malformed byte framing without parser detail", (raw) => {
    expect(projectGuestScannerOutput(raw, 64 * 1_024)).toEqual({
      ok: false,
      code: "INVALID_SCANNER_OUTPUT",
    });
  });

  it.each([
    '{"observations":[],"observations":[],"candidate_findings":[],"coverage":[],"execution_metadata":{},"warnings":[]}',
    '{"observations":[],"candidate_findings":[],"coverage":[],"execution_metadata":{"schema_version":1,"\\u0073chema_version":1},"warnings":[]}',
  ])("rejects duplicate JSON keys including escaped equivalents", (raw) => {
    expect(projectGuestScannerOutput(Buffer.from(raw), 64 * 1_024)).toEqual({
      ok: false,
      code: "INVALID_SCANNER_OUTPUT",
    });
  });

  it("rejects excessive JSON nesting", () => {
    const nested = `${"[".repeat(33)}0${"]".repeat(33)}`;
    expect(projectGuestScannerOutput(Buffer.from(nested), 64 * 1_024)).toEqual({
      ok: false,
      code: "INVALID_SCANNER_OUTPUT",
    });
  });

  it.each([
    { observations: [{ check_id: "UNKNOWN_CHECK", outcome: "PASS" }] },
    {
      observations: [
        { check_id: "DNS_DNSSEC", outcome: "PASS" },
        { check_id: "DNS_DNSSEC", outcome: "PASS" },
      ],
    },
    {
      observations: [
        { check_id: "DNS_DNSSEC", outcome: "PASS", detail: "leak" },
      ],
    },
    { observations: [{ check_id: "DNS_DNSSEC", outcome: "GOOD" }] },
  ])(
    "rejects unknown, duplicate or expanded observation output",
    (override) => {
      expect(
        projectGuestScannerOutput(
          bytes({ ...envelope(), ...override }),
          64 * 1_024,
        ),
      ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
    },
  );

  it.each([
    {
      candidate_findings: [
        {
          fingerprint: "invalid",
          severity: "HIGH",
          confidence: 90,
          evidence: "x",
        },
      ],
    },
    {
      candidate_findings: [
        {
          fingerprint: fingerprint("4"),
          severity: "EXTREME",
          confidence: 90,
          evidence: "x",
        },
      ],
    },
    {
      candidate_findings: [
        {
          fingerprint: fingerprint("4"),
          severity: "HIGH",
          confidence: 101,
          evidence: "x",
        },
      ],
    },
    {
      candidate_findings: [
        {
          fingerprint: fingerprint("4"),
          severity: "HIGH",
          confidence: 90,
          evidence: "x".repeat(4_097),
        },
      ],
    },
  ])("rejects malformed or oversized candidate findings", (override) => {
    expect(
      projectGuestScannerOutput(
        bytes({ ...envelope(), ...override }),
        64 * 1_024,
      ),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });

  it.each([
    { coverage: [] },
    {
      coverage: [
        {
          detector_group: "UNKNOWN_GROUP",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
      ],
    },
    {
      coverage: [
        {
          detector_group: "DNS_DOMAIN_POSTURE",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
        {
          detector_group: "DNS_DOMAIN_POSTURE",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
      ],
    },
  ])("rejects absent, unknown or duplicate coverage", (override) => {
    expect(
      projectGuestScannerOutput(
        bytes({ ...envelope(), ...override }),
        64 * 1_024,
      ),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });

  it.each([
    { profile: "VERIFIED_BASELINE" },
    { canonical_host: "Example.com" },
    { policy_id: "other" },
    { policy_version: "1.0.1" },
    { duration_ms: 30_001 },
    { request_count: 41 },
    { extra: true },
  ])("rejects invalid Guest execution metadata", (change) => {
    expect(
      projectGuestScannerOutput(
        bytes({
          ...envelope(),
          execution_metadata: { ...envelope().execution_metadata, ...change },
        }),
        64 * 1_024,
      ),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });

  it.each([
    [[{ code: "bad-code" }]],
    [[{ code: "VALID", message: "leak" }]],
    [[{ code: "DUPLICATE" }, { code: "DUPLICATE" }]],
    [Array.from({ length: 33 }, () => ({ code: "WARNING" }))],
  ] as unknown[][])("rejects hostile warning shapes", (warnings) => {
    expect(
      projectGuestScannerOutput(bytes({ ...envelope(), warnings }), 64 * 1_024),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });

  it("rejects unknown top-level fields", () => {
    expect(
      projectGuestScannerOutput(
        bytes({ ...envelope(), raw_output: "leak" }),
        64 * 1_024,
      ),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });

  it.each([
    {
      observations: Array.from({ length: 65 }, () => ({
        check_id: "DNS_DNSSEC",
        outcome: "PASS",
      })),
    },
    {
      candidate_findings: Array.from({ length: 257 }, (_, index) => ({
        fingerprint: `sha256:${index.toString(16).padStart(64, "0")}`,
        severity: "LOW",
        confidence: 50,
        evidence: "x",
      })),
    },
    {
      coverage: Array.from({ length: 17 }, () => ({
        detector_group: "DNS_DOMAIN_POSTURE",
        execution_status: "SUCCESS",
        completeness: "COMPLETE",
      })),
    },
  ])("rejects every oversized output collection", (override) => {
    expect(
      projectGuestScannerOutput(
        bytes({ ...envelope(), ...override }),
        128 * 1_024,
      ),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });
});
