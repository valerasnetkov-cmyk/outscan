import { describe, expect, it } from "vitest";

import {
  RESULT_ENVELOPE_AUDIENCE,
  signResultEnvelope,
  verifyAuthenticatedResultEnvelope,
} from "../src/result-envelope/index.js";

const NOW = 1_800_000_000;
const KEY = Buffer.alloc(32, 0x51);

function input(overrides: Record<string, unknown> = {}) {
  return {
    job_id: "job_01",
    attempt_id: "attempt_01",
    fence: 9,
    payload: Buffer.from("canonical-payload"),
    ...overrides,
  };
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    now_unix_seconds: NOW,
    lifetime_seconds: 60,
    workload_identity: "supervisor:guest-safe:v1",
    audience: RESULT_ENVELOPE_AUDIENCE,
    max_payload_bytes: 1_024,
    key_version: 7,
    key: KEY,
    ...overrides,
  };
}

describe("ResultEnvelope supervisor signing", () => {
  it("creates an ingress-verifiable, copy-isolated submission", () => {
    const result = signResultEnvelope(input(), context());
    expect(result).toMatchObject({
      ok: true,
      signed: {
        header: {
          schema_version: 1,
          job_id: "job_01",
          attempt_id: "attempt_01",
          fence: 9,
          issued_at: NOW,
          expires_at: NOW + 60,
          payload_size: 17,
        },
        authentication: { scheme: "HMAC-SHA-256", key_version: 7 },
      },
    });
    if (!result.ok) throw new Error(result.code);

    const first = result.signed.read_submission();
    first.envelope.payload.fill(0);
    first.authentication.mac = "tampered";
    const second = result.signed.read_submission();
    expect(Buffer.from(second.envelope.payload).toString()).toBe(
      "canonical-payload",
    );
    expect(second.authentication.mac).not.toBe("tampered");
    expect(
      verifyAuthenticatedResultEnvelope(second, {
        now_unix_seconds: NOW,
        expected_workload_identity: "supervisor:guest-safe:v1",
        expected_audience: RESULT_ENVELOPE_AUDIENCE,
        max_payload_bytes: 1_024,
        keyring: new Map([[7, KEY]]),
      }),
    ).toMatchObject({ ok: true });
    expect(Object.isFrozen(result.signed)).toBe(true);
    expect(Object.isFrozen(result.signed.header)).toBe(true);
    expect(Object.isFrozen(result.signed.authentication)).toBe(true);
  });

  it("snapshots caller payload before signing", () => {
    const payload = Buffer.from("canonical-payload");
    const result = signResultEnvelope(input({ payload }), context());
    if (!result.ok) throw new Error(result.code);
    payload.fill(0);
    expect(Buffer.from(result.signed.read_payload()).toString()).toBe(
      "canonical-payload",
    );
  });

  it.each([
    { job_id: "bad id" },
    { attempt_id: "" },
    { fence: 0 },
    { fence: 1.5 },
    { payload: "not-bytes" },
    { extra: true },
  ])("rejects malformed signing input %#", (change) => {
    expect(signResultEnvelope(input(change), context())).toEqual({
      ok: false,
      code: "INVALID_RESULT_INPUT",
    });
  });

  it.each([
    { now_unix_seconds: 0 },
    { lifetime_seconds: 0 },
    { lifetime_seconds: 301 },
    { workload_identity: "bad identity" },
    { audience: "" },
    { max_payload_bytes: 0 },
    { max_payload_bytes: 32 * 1_024 * 1_024 + 1 },
    { key_version: -1 },
    { key_version: 0x1_0000_0000 },
    { key: Buffer.alloc(31) },
    { key: Buffer.alloc(65) },
    { extra: true },
  ])("rejects malformed signing context %#", (change) => {
    expect(signResultEnvelope(input(), context(change))).toEqual({
      ok: false,
      code: "INVALID_SIGNING_CONTEXT",
    });
  });

  it("rejects the payload before hashing when it exceeds the profile limit", () => {
    expect(
      signResultEnvelope(
        input({ payload: Buffer.alloc(17) }),
        context({ max_payload_bytes: 16 }),
      ),
    ).toEqual({ ok: false, code: "RESULT_PAYLOAD_TOO_LARGE" });
  });

  it("contains throwing getters and reads a valid getter once", () => {
    const valid = input();
    let reads = 0;
    Object.defineProperty(valid, "payload", {
      enumerable: true,
      get() {
        reads += 1;
        return Buffer.from("canonical-payload");
      },
    });
    expect(signResultEnvelope(valid, context())).toMatchObject({ ok: true });
    expect(reads).toBe(1);

    const hostile = context();
    Object.defineProperty(hostile, "key", {
      enumerable: true,
      get() {
        throw new Error("secret detail");
      },
    });
    expect(signResultEnvelope(input(), hostile)).toEqual({
      ok: false,
      code: "INVALID_SIGNING_CONTEXT",
    });
  });
});
