import { createHash, createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  encodeResultEnvelopeAuthenticationMessage,
  RESULT_ENVELOPE_AUDIENCE,
  RESULT_ENVELOPE_MAX_PAYLOAD_BYTES,
  type AuthenticatedResultSubmission,
  type ResultEnvelope,
  type ResultEnvelopeHeader,
  type ResultEnvelopeVerificationContext,
  verifyAuthenticatedResultEnvelope,
} from "../src/result-envelope/index.js";
import { projectGuestScannerOutput } from "../src/scanner-output/index.js";

const NOW = 1_800_000_000;
const KEY_VERSION = 7;
const KEY = Buffer.alloc(32, 0x5a);
const WORKLOAD = "supervisor:guest-safe-01";

function scannerPayload(): Buffer {
  return Buffer.from(
    JSON.stringify({
      observations: [{ check_id: "DNS_CAA", outcome: "PASS" }],
      candidate_findings: [
        {
          fingerprint: `sha256:${"a".repeat(64)}`,
          severity: "MEDIUM",
          confidence: 80,
          evidence: "internal-only",
        },
      ],
      coverage: [
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
        duration_ms: 500,
        request_count: 3,
      },
      warnings: [],
    }),
  );
}

function digest(payload: Uint8Array): string {
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

function headerOf(envelope: ResultEnvelope): ResultEnvelopeHeader {
  return {
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
}

function signed(
  envelopeOverrides: Partial<ResultEnvelope> = {},
  key = KEY,
): AuthenticatedResultSubmission {
  const payload = envelopeOverrides.payload ?? scannerPayload();
  const envelope: ResultEnvelope = {
    schema_version: 1,
    job_id: "job_01",
    attempt_id: "attempt_01",
    fence: 9,
    workload_identity: WORKLOAD,
    audience: RESULT_ENVELOPE_AUDIENCE,
    issued_at: NOW - 10,
    expires_at: NOW + 60,
    payload_digest: digest(payload),
    payload_size: payload.byteLength,
    payload,
    ...envelopeOverrides,
  };
  const message = encodeResultEnvelopeAuthenticationMessage(
    headerOf(envelope),
    KEY_VERSION,
  );
  const mac = createHmac("sha256", key).update(message).digest("base64url");
  return {
    envelope,
    authentication: {
      scheme: "HMAC-SHA-256",
      key_version: KEY_VERSION,
      mac,
    },
  };
}

function context(
  overrides: Partial<ResultEnvelopeVerificationContext> = {},
): ResultEnvelopeVerificationContext {
  return {
    now_unix_seconds: NOW,
    expected_workload_identity: WORKLOAD,
    expected_audience: RESULT_ENVELOPE_AUDIENCE,
    max_payload_bytes: 2 * 1_024 * 1_024,
    keyring: new Map([[KEY_VERSION, KEY]]),
    ...overrides,
  };
}

describe("authenticated ResultEnvelope", () => {
  it("authenticates identity and yields a Guest-projectable payload copy", () => {
    const input = signed();
    const result = verifyAuthenticatedResultEnvelope(input, context());

    expect(result).toMatchObject({
      ok: true,
      verified: {
        header: {
          job_id: "job_01",
          attempt_id: "attempt_01",
          fence: 9,
          payload_size: input.envelope.payload_size,
        },
        submission_identity: {
          attempt_id: "attempt_01",
          fence: 9,
          payload_digest: input.envelope.payload_digest,
        },
      },
    });
    if (!result.ok) throw new Error("Expected an authenticated envelope.");

    const firstRead = result.verified.read_payload();
    firstRead.fill(0);
    const secondRead = result.verified.read_payload();
    expect(secondRead).toEqual(scannerPayload());
    expect(
      projectGuestScannerOutput(secondRead, 2 * 1_024 * 1_024),
    ).toMatchObject({
      ok: true,
      projection: { canonical_host: "example.com", potential_risk_count: 1 },
    });
    expect(Object.isFrozen(result.verified)).toBe(true);
    expect(Object.isFrozen(result.verified.header)).toBe(true);
  });

  it("uses a stable domain-separated canonical binary message", () => {
    const input = signed();
    const encoded = encodeResultEnvelopeAuthenticationMessage(
      headerOf(input.envelope),
      KEY_VERSION,
    );

    expect(encoded.subarray(0, 27).toString("ascii")).toBe(
      "OUTSCAN:RESULT_ENVELOPE:v1\0",
    );
    expect(encoded.toString("hex")).toBe(
      "4f55545343414e3a524553554c545f454e56454c4f50453a7631000000000100000007000000066a6f625f30310000000a617474656d70745f303100000000000000090000001873757065727669736f723a67756573742d736166652d3031000000196f75747363616e2d726573756c742d696e67726573733a7631000000006b49d1f6000000006b49d23c8662ac6d6fbdbbff4cf36d96d22f1daa2795b1dc314fdeadf4c0e424214dd3de000000000000021a",
    );
  });

  it.each([
    ["job_id", "job_02"],
    ["attempt_id", "attempt_02"],
    ["fence", 10],
    ["issued_at", NOW - 11],
    ["expires_at", NOW + 61],
    ["payload_digest", `sha256:${"b".repeat(64)}`],
    ["payload_size", 1],
  ] as const)("rejects unsigned %s tampering", (field, value) => {
    const input = signed();
    Object.assign(input.envelope, { [field]: value });
    expect(verifyAuthenticatedResultEnvelope(input, context())).toEqual({
      ok: false,
      code: "RESULT_AUTHENTICATION_FAILED",
    });
  });

  it("collapses key and MAC failures to one authentication result", () => {
    const wrongKey = Buffer.alloc(32, 0x33);
    const padded = signed();
    padded.authentication.mac += "=";

    expect(
      verifyAuthenticatedResultEnvelope(
        signed(),
        context({ keyring: new Map() }),
      ),
    ).toEqual({ ok: false, code: "RESULT_AUTHENTICATION_FAILED" });
    expect(
      verifyAuthenticatedResultEnvelope(
        signed(),
        context({ keyring: new Map([[KEY_VERSION, wrongKey]]) }),
      ),
    ).toEqual({ ok: false, code: "RESULT_AUTHENTICATION_FAILED" });
    expect(
      verifyAuthenticatedResultEnvelope(
        signed(),
        context({ keyring: new Map([[KEY_VERSION, Buffer.alloc(31)]]) }),
      ),
    ).toEqual({ ok: false, code: "RESULT_AUTHENTICATION_FAILED" });

    const changedVersion = signed();
    changedVersion.authentication.key_version = KEY_VERSION + 1;
    expect(
      verifyAuthenticatedResultEnvelope(
        changedVersion,
        context({ keyring: new Map([[KEY_VERSION + 1, KEY]]) }),
      ),
    ).toEqual({ ok: false, code: "RESULT_AUTHENTICATION_FAILED" });
    expect(verifyAuthenticatedResultEnvelope(padded, context())).toEqual({
      ok: false,
      code: "INVALID_RESULT_ENVELOPE",
    });
    expect(
      verifyAuthenticatedResultEnvelope(
        signed(),
        context({
          keyring: {
            get: () => {
              throw new Error("secret");
            },
          } as never,
        }),
      ),
    ).toEqual({ ok: false, code: "RESULT_AUTHENTICATION_FAILED" });
  });

  it.each([
    [signed({ workload_identity: "supervisor:other" }), context()],
    [signed({ audience: "other-ingress:v1" }), context()],
    [signed({ issued_at: NOW + 31 }), context()],
    [signed({ issued_at: NOW - 301, expires_at: NOW + 1 }), context()],
    [signed({ expires_at: NOW }), context()],
  ])("denies identity, audience and time-window failures", (input, trusted) => {
    expect(verifyAuthenticatedResultEnvelope(input, trusted)).toEqual({
      ok: false,
      code: "RESULT_AUTHENTICATION_FAILED",
    });
  });

  it("checks actual payload size and digest only after authentication", () => {
    const changedPayload = signed();
    changedPayload.envelope.payload = Buffer.from(
      changedPayload.envelope.payload.map((value, index) =>
        index === 0 ? value ^ 1 : value,
      ),
    );
    expect(
      verifyAuthenticatedResultEnvelope(changedPayload, context()),
    ).toEqual({
      ok: false,
      code: "RESULT_PAYLOAD_MISMATCH",
    });

    const sizeMismatch = signed({
      payload_size: scannerPayload().byteLength + 1,
    });
    expect(verifyAuthenticatedResultEnvelope(sizeMismatch, context())).toEqual({
      ok: false,
      code: "RESULT_PAYLOAD_MISMATCH",
    });
  });

  it("rejects payload over the profile limit and invalid global limits", () => {
    expect(
      verifyAuthenticatedResultEnvelope(
        signed(),
        context({ max_payload_bytes: 1 }),
      ),
    ).toEqual({ ok: false, code: "RESULT_PAYLOAD_TOO_LARGE" });
    expect(
      verifyAuthenticatedResultEnvelope(
        signed(),
        context({ max_payload_bytes: RESULT_ENVELOPE_MAX_PAYLOAD_BYTES + 1 }),
      ),
    ).toEqual({ ok: false, code: "INVALID_VERIFICATION_CONTEXT" });
  });

  it.each([
    { schema_version: 2 },
    { job_id: "bad id" },
    { attempt_id: "" },
    { fence: 0 },
    { payload_digest: "sha256:ABC" },
    { payload_size: -1 },
    { payload: "not-bytes" },
  ])("rejects malformed envelope field %#", (change) => {
    const input = signed();
    Object.assign(input.envelope, change);
    expect(verifyAuthenticatedResultEnvelope(input, context())).toEqual({
      ok: false,
      code: "INVALID_RESULT_ENVELOPE",
    });
  });

  it("rejects unknown wrapper, envelope and authentication fields", () => {
    const wrapper = { ...signed(), extra: true };
    const envelope = signed();
    Object.assign(envelope.envelope, { extra: true });
    const authentication = signed();
    Object.assign(authentication.authentication, { extra: true });
    const symbol = signed() as AuthenticatedResultSubmission & {
      [key: symbol]: boolean;
    };
    symbol[Symbol("hidden")] = true;

    for (const input of [wrapper, envelope, authentication, symbol]) {
      expect(verifyAuthenticatedResultEnvelope(input, context())).toEqual({
        ok: false,
        code: "INVALID_RESULT_ENVELOPE",
      });
    }
  });

  it("snapshots hostile getters once and contains thrown getters", () => {
    const base = signed();
    let reads = 0;
    Object.defineProperty(base.envelope, "payload", {
      enumerable: true,
      get() {
        reads += 1;
        return scannerPayload();
      },
    });
    expect(verifyAuthenticatedResultEnvelope(base, context())).toMatchObject({
      ok: true,
    });
    expect(reads).toBe(1);

    const hostile = signed();
    Object.defineProperty(hostile, "envelope", {
      enumerable: true,
      get() {
        throw new Error("do not leak this");
      },
    });
    expect(verifyAuthenticatedResultEnvelope(hostile, context())).toEqual({
      ok: false,
      code: "INVALID_RESULT_ENVELOPE",
    });
  });
});
