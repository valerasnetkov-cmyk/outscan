import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { decodeCanonicalBase64Url } from "../guest-crypto/binary.js";
import { encodeResultEnvelopeAuthenticationMessage } from "./codec.js";
import {
  RESULT_ENVELOPE_MAX_CLOCK_SKEW_SECONDS,
  RESULT_ENVELOPE_MAX_LIFETIME_SECONDS,
  RESULT_ENVELOPE_MAX_PAYLOAD_BYTES,
  type ResultEnvelope,
  type ResultEnvelopeAuthentication,
  type ResultEnvelopeHeader,
  type ResultEnvelopeVerificationContext,
  type ResultEnvelopeVerificationResult,
} from "./model.js";

const SUBMISSION_KEYS = ["envelope", "authentication"] as const;
const ENVELOPE_KEYS = [
  "schema_version",
  "job_id",
  "attempt_id",
  "fence",
  "workload_identity",
  "audience",
  "issued_at",
  "expires_at",
  "payload_digest",
  "payload_size",
  "payload",
] as const;
const AUTHENTICATION_KEYS = ["scheme", "key_version", "mac"] as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const PRINCIPAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MAC_BYTES = 32;

function fail(
  code: Extract<ResultEnvelopeVerificationResult, { ok: false }>["code"],
): ResultEnvelopeVerificationResult {
  return { ok: false, code };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === expected.length &&
      actual.every((key) => typeof key === "string" && expected.includes(key))
    );
  } catch {
    return false;
  }
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isU32(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 0xffff_ffff
  );
}

function snapshotSubmission(input: unknown): {
  envelope: ResultEnvelope;
  authentication: ResultEnvelopeAuthentication;
} | null {
  if (!isRecord(input) || !hasExactKeys(input, SUBMISSION_KEYS)) return null;

  try {
    const rawEnvelope = input.envelope;
    const rawAuthentication = input.authentication;
    if (
      !isRecord(rawEnvelope) ||
      !hasExactKeys(rawEnvelope, ENVELOPE_KEYS) ||
      !isRecord(rawAuthentication) ||
      !hasExactKeys(rawAuthentication, AUTHENTICATION_KEYS)
    ) {
      return null;
    }

    const envelope: ResultEnvelope = {
      schema_version: rawEnvelope.schema_version as 1,
      job_id: rawEnvelope.job_id as string,
      attempt_id: rawEnvelope.attempt_id as string,
      fence: rawEnvelope.fence as number,
      workload_identity: rawEnvelope.workload_identity as string,
      audience: rawEnvelope.audience as string,
      issued_at: rawEnvelope.issued_at as number,
      expires_at: rawEnvelope.expires_at as number,
      payload_digest: rawEnvelope.payload_digest as string,
      payload_size: rawEnvelope.payload_size as number,
      payload: rawEnvelope.payload as Uint8Array,
    };
    const authentication: ResultEnvelopeAuthentication = {
      scheme: rawAuthentication.scheme as "HMAC-SHA-256",
      key_version: rawAuthentication.key_version as number,
      mac: rawAuthentication.mac as string,
    };
    return { envelope, authentication };
  } catch {
    return null;
  }
}

function validHeader(envelope: ResultEnvelope): boolean {
  return (
    envelope.schema_version === 1 &&
    typeof envelope.job_id === "string" &&
    ID_PATTERN.test(envelope.job_id) &&
    typeof envelope.attempt_id === "string" &&
    ID_PATTERN.test(envelope.attempt_id) &&
    isPositiveSafeInteger(envelope.fence) &&
    typeof envelope.workload_identity === "string" &&
    PRINCIPAL_PATTERN.test(envelope.workload_identity) &&
    typeof envelope.audience === "string" &&
    PRINCIPAL_PATTERN.test(envelope.audience) &&
    isPositiveSafeInteger(envelope.issued_at) &&
    isPositiveSafeInteger(envelope.expires_at) &&
    typeof envelope.payload_digest === "string" &&
    DIGEST_PATTERN.test(envelope.payload_digest) &&
    Number.isSafeInteger(envelope.payload_size) &&
    envelope.payload_size >= 0 &&
    envelope.payload instanceof Uint8Array
  );
}

function validAuthentication(
  authentication: ResultEnvelopeAuthentication,
): boolean {
  return (
    authentication.scheme === "HMAC-SHA-256" &&
    isU32(authentication.key_version) &&
    typeof authentication.mac === "string" &&
    authentication.mac.length === 43
  );
}

function snapshotContext(context: ResultEnvelopeVerificationContext): {
  now: number;
  workload: string;
  audience: string;
  maxPayload: number;
  keyring: ResultEnvelopeVerificationContext["keyring"];
} | null {
  try {
    const now = context.now_unix_seconds;
    const workload = context.expected_workload_identity;
    const audience = context.expected_audience;
    const maxPayload = context.max_payload_bytes;
    const keyring = context.keyring;
    if (
      !isPositiveSafeInteger(now) ||
      typeof workload !== "string" ||
      !PRINCIPAL_PATTERN.test(workload) ||
      typeof audience !== "string" ||
      !PRINCIPAL_PATTERN.test(audience) ||
      !isPositiveSafeInteger(maxPayload) ||
      maxPayload > RESULT_ENVELOPE_MAX_PAYLOAD_BYTES ||
      !keyring ||
      typeof keyring.get !== "function"
    ) {
      return null;
    }
    return { now, workload, audience, maxPayload, keyring };
  } catch {
    return null;
  }
}

function payloadDigest(payload: Uint8Array): string {
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`;
}

function equalDigest(left: string, right: string): boolean {
  return timingSafeEqual(
    Buffer.from(left, "ascii"),
    Buffer.from(right, "ascii"),
  );
}

export function verifyAuthenticatedResultEnvelope(
  input: unknown,
  context: ResultEnvelopeVerificationContext,
): ResultEnvelopeVerificationResult {
  const trusted = snapshotContext(context);
  if (!trusted) return fail("INVALID_VERIFICATION_CONTEXT");

  const submission = snapshotSubmission(input);
  if (!submission) return fail("INVALID_RESULT_ENVELOPE");
  const { envelope, authentication } = submission;
  if (!validHeader(envelope) || !validAuthentication(authentication)) {
    return fail("INVALID_RESULT_ENVELOPE");
  }
  if (
    envelope.payload_size > trusted.maxPayload ||
    envelope.payload.byteLength > trusted.maxPayload
  ) {
    return fail("RESULT_PAYLOAD_TOO_LARGE");
  }
  if (
    envelope.workload_identity !== trusted.workload ||
    envelope.audience !== trusted.audience ||
    envelope.expires_at <= envelope.issued_at ||
    envelope.expires_at - envelope.issued_at >
      RESULT_ENVELOPE_MAX_LIFETIME_SECONDS ||
    envelope.issued_at > trusted.now + RESULT_ENVELOPE_MAX_CLOCK_SKEW_SECONDS ||
    trusted.now >= envelope.expires_at
  ) {
    return fail("RESULT_AUTHENTICATION_FAILED");
  }

  const suppliedMac = decodeCanonicalBase64Url(authentication.mac);
  let key: Uint8Array | undefined;
  try {
    key = trusted.keyring.get(authentication.key_version);
  } catch {
    return fail("RESULT_AUTHENTICATION_FAILED");
  }
  if (
    !suppliedMac ||
    suppliedMac.byteLength !== MAC_BYTES ||
    !key ||
    key.byteLength < 32
  ) {
    return fail("RESULT_AUTHENTICATION_FAILED");
  }

  let expectedMac: Buffer;
  try {
    const message = encodeResultEnvelopeAuthenticationMessage(
      envelope,
      authentication.key_version,
    );
    expectedMac = createHmac("sha256", Buffer.from(key))
      .update(message)
      .digest();
  } catch {
    return fail("RESULT_AUTHENTICATION_FAILED");
  }
  if (!timingSafeEqual(suppliedMac, expectedMac)) {
    return fail("RESULT_AUTHENTICATION_FAILED");
  }

  const payload = Buffer.from(envelope.payload);
  if (
    payload.byteLength !== envelope.payload_size ||
    !equalDigest(payloadDigest(payload), envelope.payload_digest)
  ) {
    return fail("RESULT_PAYLOAD_MISMATCH");
  }

  const header = Object.freeze({
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
  } satisfies ResultEnvelopeHeader);
  const submissionIdentity = Object.freeze({
    attempt_id: header.attempt_id,
    fence: header.fence,
    payload_digest: header.payload_digest,
  });

  return {
    ok: true,
    verified: Object.freeze({
      header,
      submission_identity: submissionIdentity,
      read_payload: () => Buffer.from(payload),
    }),
  };
}
