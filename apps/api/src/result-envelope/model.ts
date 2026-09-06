export const RESULT_ENVELOPE_AUDIENCE = "outscan-result-ingress:v1";
export const RESULT_ENVELOPE_MAX_LIFETIME_SECONDS = 300;
export const RESULT_ENVELOPE_MAX_CLOCK_SKEW_SECONDS = 30;
export const RESULT_ENVELOPE_MAX_PAYLOAD_BYTES = 32 * 1_024 * 1_024;

export type ResultEnvelopeKeyring = ReadonlyMap<number, Uint8Array>;

export interface ResultEnvelopeHeader {
  schema_version: 1;
  job_id: string;
  attempt_id: string;
  fence: number;
  workload_identity: string;
  audience: string;
  issued_at: number;
  expires_at: number;
  payload_digest: string;
  payload_size: number;
}

export interface ResultEnvelope extends ResultEnvelopeHeader {
  payload: Uint8Array;
}

export interface ResultEnvelopeAuthentication {
  scheme: "HMAC-SHA-256";
  key_version: number;
  mac: string;
}

export interface AuthenticatedResultSubmission {
  envelope: ResultEnvelope;
  authentication: ResultEnvelopeAuthentication;
}

export interface ResultEnvelopeSigningInput {
  job_id: string;
  attempt_id: string;
  fence: number;
  payload: Uint8Array;
}

export interface ResultEnvelopeSigningContext {
  now_unix_seconds: number;
  lifetime_seconds: number;
  workload_identity: string;
  audience: string;
  max_payload_bytes: number;
  key_version: number;
  key: Uint8Array;
}

export interface SignedResultEnvelope {
  header: Readonly<ResultEnvelopeHeader>;
  authentication: Readonly<ResultEnvelopeAuthentication>;
  read_payload: () => Uint8Array;
  read_submission: () => AuthenticatedResultSubmission;
}

export type ResultEnvelopeSigningResult =
  | { ok: true; signed: Readonly<SignedResultEnvelope> }
  | {
      ok: false;
      code:
        | "INVALID_SIGNING_CONTEXT"
        | "INVALID_RESULT_INPUT"
        | "RESULT_PAYLOAD_TOO_LARGE"
        | "RESULT_SIGNING_FAILED";
    };

export interface ResultEnvelopeVerificationContext {
  now_unix_seconds: number;
  expected_workload_identity: string;
  expected_audience: string;
  max_payload_bytes: number;
  keyring: ResultEnvelopeKeyring;
}

export interface VerifiedResultEnvelope {
  header: Readonly<ResultEnvelopeHeader>;
  submission_identity: Readonly<{
    attempt_id: string;
    fence: number;
    payload_digest: string;
  }>;
  read_payload: () => Uint8Array;
}

export type ResultEnvelopeVerificationResult =
  | { ok: true; verified: Readonly<VerifiedResultEnvelope> }
  | {
      ok: false;
      code:
        | "INVALID_VERIFICATION_CONTEXT"
        | "INVALID_RESULT_ENVELOPE"
        | "RESULT_PAYLOAD_TOO_LARGE"
        | "RESULT_AUTHENTICATION_FAILED"
        | "RESULT_PAYLOAD_MISMATCH";
    };
