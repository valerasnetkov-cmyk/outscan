import { createHash, createHmac } from "node:crypto";

import { encodeResultEnvelopeAuthenticationMessage } from "./codec.js";
import {
  RESULT_ENVELOPE_MAX_LIFETIME_SECONDS,
  RESULT_ENVELOPE_MAX_PAYLOAD_BYTES,
  type AuthenticatedResultSubmission,
  type ResultEnvelopeAuthentication,
  type ResultEnvelopeHeader,
  type ResultEnvelopeSigningContext,
  type ResultEnvelopeSigningInput,
  type ResultEnvelopeSigningResult,
} from "./model.js";

const INPUT_KEYS = ["job_id", "attempt_id", "fence", "payload"] as const;
const CONTEXT_KEYS = [
  "now_unix_seconds",
  "lifetime_seconds",
  "workload_identity",
  "audience",
  "max_payload_bytes",
  "key_version",
  "key",
] as const;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const PRINCIPAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

function exactRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
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

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function u32(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= 0xffff_ffff
  );
}

function snapshotInput(value: unknown): ResultEnvelopeSigningInput | null {
  if (!exactRecord(value, INPUT_KEYS)) return null;
  try {
    const jobId = value.job_id;
    const attemptId = value.attempt_id;
    const fence = value.fence;
    const payload = value.payload;
    if (
      typeof jobId !== "string" ||
      !ID_PATTERN.test(jobId) ||
      typeof attemptId !== "string" ||
      !ID_PATTERN.test(attemptId) ||
      !positiveInteger(fence) ||
      !(payload instanceof Uint8Array)
    ) {
      return null;
    }
    return {
      job_id: jobId,
      attempt_id: attemptId,
      fence,
      payload: Buffer.from(payload),
    };
  } catch {
    return null;
  }
}

function snapshotContext(value: unknown): ResultEnvelopeSigningContext | null {
  if (!exactRecord(value, CONTEXT_KEYS)) return null;
  try {
    const now = value.now_unix_seconds;
    const lifetime = value.lifetime_seconds;
    const workload = value.workload_identity;
    const audience = value.audience;
    const maximum = value.max_payload_bytes;
    const keyVersion = value.key_version;
    const key = value.key;
    if (
      !positiveInteger(now) ||
      !positiveInteger(lifetime) ||
      lifetime > RESULT_ENVELOPE_MAX_LIFETIME_SECONDS ||
      typeof workload !== "string" ||
      !PRINCIPAL_PATTERN.test(workload) ||
      typeof audience !== "string" ||
      !PRINCIPAL_PATTERN.test(audience) ||
      !positiveInteger(maximum) ||
      maximum > RESULT_ENVELOPE_MAX_PAYLOAD_BYTES ||
      !u32(keyVersion) ||
      !(key instanceof Uint8Array) ||
      key.byteLength < 32 ||
      key.byteLength > 64 ||
      now > Number.MAX_SAFE_INTEGER - lifetime
    ) {
      return null;
    }
    return {
      now_unix_seconds: now,
      lifetime_seconds: lifetime,
      workload_identity: workload,
      audience,
      max_payload_bytes: maximum,
      key_version: keyVersion,
      key: Buffer.from(key),
    };
  } catch {
    return null;
  }
}

export function signResultEnvelope(
  rawInput: unknown,
  rawContext: unknown,
): ResultEnvelopeSigningResult {
  const input = snapshotInput(rawInput);
  if (!input) return { ok: false, code: "INVALID_RESULT_INPUT" };
  const context = snapshotContext(rawContext);
  if (!context) return { ok: false, code: "INVALID_SIGNING_CONTEXT" };
  if (input.payload.byteLength > context.max_payload_bytes) {
    return { ok: false, code: "RESULT_PAYLOAD_TOO_LARGE" };
  }

  const payload = Buffer.from(input.payload);
  const header = Object.freeze({
    schema_version: 1,
    job_id: input.job_id,
    attempt_id: input.attempt_id,
    fence: input.fence,
    workload_identity: context.workload_identity,
    audience: context.audience,
    issued_at: context.now_unix_seconds,
    expires_at: context.now_unix_seconds + context.lifetime_seconds,
    payload_digest: `sha256:${createHash("sha256").update(payload).digest("hex")}`,
    payload_size: payload.byteLength,
  } satisfies ResultEnvelopeHeader);

  let mac: string;
  try {
    mac = createHmac("sha256", context.key)
      .update(
        encodeResultEnvelopeAuthenticationMessage(header, context.key_version),
      )
      .digest("base64url");
  } catch {
    return { ok: false, code: "RESULT_SIGNING_FAILED" };
  }
  const authentication = Object.freeze({
    scheme: "HMAC-SHA-256",
    key_version: context.key_version,
    mac,
  } satisfies ResultEnvelopeAuthentication);
  const readSubmission = (): AuthenticatedResultSubmission => ({
    envelope: { ...header, payload: Buffer.from(payload) },
    authentication: { ...authentication },
  });

  return {
    ok: true,
    signed: Object.freeze({
      header,
      authentication,
      read_payload: () => Buffer.from(payload),
      read_submission: readSubmission,
    }),
  };
}
