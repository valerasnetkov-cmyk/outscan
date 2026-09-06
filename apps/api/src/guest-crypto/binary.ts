const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export function ascii(value: string): Buffer {
  if (!/^[\x00-\x7f]*$/u.test(value)) {
    throw new TypeError("ASCII input contains non-ASCII characters.");
  }
  return Buffer.from(value, "ascii");
}

export function u32be(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError("U32 value is outside the unsigned 32-bit range.");
  }

  const output = Buffer.allocUnsafe(4);
  output.writeUInt32BE(value);
  return output;
}

export function u64be(value: bigint): Buffer {
  if (value < 0n || value > UINT64_MAX) {
    throw new RangeError("U64 value is outside the unsigned 64-bit range.");
  }

  const output = Buffer.allocUnsafe(8);
  output.writeBigUInt64BE(value);
  return output;
}

export function lengthPrefix(value: Uint8Array): Buffer {
  if (value.byteLength > UINT32_MAX) {
    throw new RangeError("Length-prefixed value exceeds the U32 limit.");
  }
  return Buffer.concat([u32be(value.byteLength), Buffer.from(value)]);
}

export function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

export function decodeCanonicalBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.includes("=")) return null;

  const decoded = Buffer.from(value, "base64url");
  return encodeBase64Url(decoded) === value ? decoded : null;
}
