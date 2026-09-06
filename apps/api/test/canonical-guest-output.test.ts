import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  encodeResultEnvelopeAuthenticationMessage,
  RESULT_ENVELOPE_AUDIENCE,
  type ResultEnvelope,
  verifyAuthenticatedResultEnvelope,
} from "../src/result-envelope/index.js";
import {
  GUEST_EVIDENCE_REDACTION,
  produceCanonicalGuestScannerResult,
  projectGuestScannerOutput,
} from "../src/scanner-output/index.js";

const NOW = 1_800_000_000;
const KEY_VERSION = 3;
const KEY = Buffer.alloc(32, 0x41);

function fingerprint(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

function envelope() {
  return {
    warnings: [{ code: "PARTIAL_RDAP_DATA" }, { code: "TLS_CHAIN_PARTIAL" }],
    execution_metadata: {
      request_count: 8,
      duration_ms: 1_200,
      policy_version: "1.0.0",
      policy_id: "outscan-v1",
      canonical_host: "example.com",
      profile: "GUEST_SAFE",
      schema_version: 1,
    },
    coverage: [
      {
        completeness: "COMPLETE",
        execution_status: "SUCCESS",
        detector_group: "TLS_CERTIFICATE_POSTURE",
      },
      {
        completeness: "PARTIAL",
        execution_status: "SUCCESS",
        detector_group: "DNS_DOMAIN_POSTURE",
      },
    ],
    candidate_findings: [
      {
        evidence: "CVE-2026-9999 https://internal.example/admin\r\n=CMD()",
        confidence: 90,
        severity: "HIGH",
        fingerprint: fingerprint("b"),
      },
      {
        evidence: "<script>secret()</script>",
        confidence: 70,
        severity: "MEDIUM",
        fingerprint: fingerprint("a"),
      },
    ],
    observations: [
      { outcome: "PASS", check_id: "TLS_CERTIFICATE" },
      { outcome: "ATTENTION", check_id: "DNS_DNSSEC" },
    ],
  };
}

function bytes(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function requireCanonical(value: unknown = envelope()) {
  const produced = produceCanonicalGuestScannerResult(bytes(value), 64 * 1_024);
  if (!produced.ok) throw new Error(`Unexpected ${produced.code}.`);
  return produced.result;
}

describe("canonical Guest ScannerResultEnvelope producer", () => {
  it("normalizes field and collection order into one deterministic payload", () => {
    const first = requireCanonical();
    const original = envelope();
    const permuted = {
      observations: [...original.observations].reverse(),
      candidate_findings: [...original.candidate_findings].reverse(),
      coverage: [...original.coverage].reverse(),
      execution_metadata: { ...original.execution_metadata },
      warnings: [...original.warnings].reverse(),
    };
    const second = requireCanonical(permuted);

    expect(second.read_canonical_payload()).toEqual(
      first.read_canonical_payload(),
    );
    expect(second.payload_digest).toBe(first.payload_digest);
    expect(second.payload_size).toBe(first.payload_size);

    const parsed = JSON.parse(
      Buffer.from(first.read_canonical_payload()).toString("utf8"),
    ) as ReturnType<typeof envelope>;
    expect(parsed.observations.map((item) => item.check_id)).toEqual([
      "DNS_DNSSEC",
      "TLS_CERTIFICATE",
    ]);
    expect(parsed.candidate_findings.map((item) => item.fingerprint)).toEqual([
      fingerprint("a"),
      fingerprint("b"),
    ]);
    expect(parsed.coverage.map((item) => item.detector_group)).toEqual([
      "DNS_DOMAIN_POSTURE",
      "TLS_CERTIFICATE_POSTURE",
    ]);
    expect(parsed.warnings.map((item) => item.code)).toEqual([
      "PARTIAL_RDAP_DATA",
      "TLS_CHAIN_PARTIAL",
    ]);
  });

  it("redacts evidence before digesting or signing the canonical payload", () => {
    const produced = requireCanonical();
    const payloadText = Buffer.from(produced.read_canonical_payload()).toString(
      "utf8",
    );
    expect(payloadText).not.toContain("CVE-2026-9999");
    expect(payloadText).not.toContain("internal.example");
    expect(payloadText).not.toContain("<script>");
    expect(payloadText).not.toContain("=CMD()");
    expect(payloadText.match(/REDACTED:UNTRUSTED_EVIDENCE/gu)).toHaveLength(2);

    const parsed = JSON.parse(payloadText) as ReturnType<typeof envelope>;
    expect(
      parsed.candidate_findings.every(
        (finding) => finding.evidence === GUEST_EVIDENCE_REDACTION,
      ),
    ).toBe(true);
    expect(produced.projection.potential_risk_count).toBe(2);
    expect(
      projectGuestScannerOutput(produced.read_canonical_payload(), 64 * 1_024),
    ).toEqual({
      ok: true,
      projection: produced.projection,
    });
  });

  it("returns isolated canonical payload copies", () => {
    const produced = requireCanonical();
    const expectedDigest = produced.payload_digest;
    const first = produced.read_canonical_payload();
    first.fill(0);
    const second = produced.read_canonical_payload();

    expect(second.some((value) => value !== 0)).toBe(true);
    expect(produced.payload_digest).toBe(expectedDigest);
    expect(second.byteLength).toBe(produced.payload_size);
    expect(Object.isFrozen(produced)).toBe(true);
    expect(Object.isFrozen(produced.projection)).toBe(true);
  });

  it("binds canonical bytes to authenticated ResultEnvelope verification", () => {
    const produced = requireCanonical();
    const payload = produced.read_canonical_payload();
    const envelope: ResultEnvelope = {
      schema_version: 1,
      job_id: "job_02",
      attempt_id: "attempt_03",
      fence: 11,
      workload_identity: "supervisor:guest-safe-01",
      audience: RESULT_ENVELOPE_AUDIENCE,
      issued_at: NOW - 5,
      expires_at: NOW + 60,
      payload_digest: produced.payload_digest,
      payload_size: produced.payload_size,
      payload,
    };
    const header = {
      schema_version: envelope.schema_version,
      job_id: envelope.job_id,
      attempt_id: envelope.attempt_id,
      fence: envelope.fence,
      workload_identity: envelope.workload_identity,
      audience: envelope.audience,
      issued_at: envelope.issued_at,
      expires_at: envelope.expires_at,
      payload_digest: envelope.payload_digest,
      payload_size: envelope.payload_size,
    };
    const mac = createHmac("sha256", KEY)
      .update(encodeResultEnvelopeAuthenticationMessage(header, KEY_VERSION))
      .digest("base64url");

    const verified = verifyAuthenticatedResultEnvelope(
      {
        envelope,
        authentication: {
          scheme: "HMAC-SHA-256",
          key_version: KEY_VERSION,
          mac,
        },
      },
      {
        now_unix_seconds: NOW,
        expected_workload_identity: "supervisor:guest-safe-01",
        expected_audience: RESULT_ENVELOPE_AUDIENCE,
        max_payload_bytes: 2 * 1_024 * 1_024,
        keyring: new Map([[KEY_VERSION, KEY]]),
      },
    );
    expect(verified).toMatchObject({
      ok: true,
      verified: {
        submission_identity: { payload_digest: produced.payload_digest },
      },
    });
  });

  it("propagates strict parser limits and validation failures", () => {
    expect(produceCanonicalGuestScannerResult("not-bytes", 1_024)).toEqual({
      ok: false,
      code: "INVALID_SCANNER_OUTPUT",
    });
    expect(produceCanonicalGuestScannerResult(bytes(envelope()), 0)).toEqual({
      ok: false,
      code: "INVALID_OUTPUT_LIMIT",
    });
    expect(produceCanonicalGuestScannerResult(bytes(envelope()), 10)).toEqual({
      ok: false,
      code: "OUTPUT_TOO_LARGE",
    });
    expect(
      produceCanonicalGuestScannerResult(
        bytes({ ...envelope(), raw_output: "forbidden" }),
        64 * 1_024,
      ),
    ).toEqual({ ok: false, code: "INVALID_SCANNER_OUTPUT" });
  });
});
