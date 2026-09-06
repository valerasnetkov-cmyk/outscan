import { ascii, lengthPrefix, u32be, u64be } from "../guest-crypto/binary.js";
import type { ResultEnvelopeHeader } from "./model.js";

const AUTHENTICATION_DOMAIN = ascii("OUTSCAN:RESULT_ENVELOPE:v1\0");

function utf8(value: string): Buffer {
  return Buffer.from(value, "utf8");
}

function digestBytes(value: string): Buffer {
  return Buffer.from(value.slice("sha256:".length), "hex");
}

export function encodeResultEnvelopeAuthenticationMessage(
  header: ResultEnvelopeHeader,
  keyVersion: number,
): Buffer {
  return Buffer.concat([
    AUTHENTICATION_DOMAIN,
    u32be(header.schema_version),
    u32be(keyVersion),
    lengthPrefix(utf8(header.job_id)),
    lengthPrefix(utf8(header.attempt_id)),
    u64be(BigInt(header.fence)),
    lengthPrefix(utf8(header.workload_identity)),
    lengthPrefix(utf8(header.audience)),
    u64be(BigInt(header.issued_at)),
    u64be(BigInt(header.expires_at)),
    digestBytes(header.payload_digest),
    u64be(BigInt(header.payload_size)),
  ]);
}
