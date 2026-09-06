import { timingSafeEqual } from "node:crypto";

import { ascii, u32be } from "../guest-crypto/binary.js";
import {
  SCANNER_IPC_MAX_PAYLOAD_BYTES,
  type ScannerIpcEncodeResult,
} from "./model.js";

export const SCANNER_IPC_MAGIC = ascii("OUTSCAN:SCANNER_RESULT:v1\0");
export const SCANNER_IPC_HEADER_BYTES = SCANNER_IPC_MAGIC.byteLength + 4;

function validLimit(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) <= SCANNER_IPC_MAX_PAYLOAD_BYTES
  );
}

export function hasScannerIpcMagic(header: Uint8Array): boolean {
  if (header.byteLength < SCANNER_IPC_MAGIC.byteLength) return false;
  return timingSafeEqual(
    Buffer.from(header.subarray(0, SCANNER_IPC_MAGIC.byteLength)),
    SCANNER_IPC_MAGIC,
  );
}

export function readScannerIpcPayloadLength(header: Uint8Array): number | null {
  if (
    header.byteLength !== SCANNER_IPC_HEADER_BYTES ||
    !hasScannerIpcMagic(header)
  ) {
    return null;
  }
  return Buffer.from(header).readUInt32BE(SCANNER_IPC_MAGIC.byteLength);
}

export function encodeScannerIpcFrame(
  payload: unknown,
  maximumBytes: unknown,
): ScannerIpcEncodeResult {
  if (!validLimit(maximumBytes) || !(payload instanceof Uint8Array)) {
    return { ok: false, code: "INVALID_IPC_CONTEXT" };
  }
  if (payload.byteLength === 0 || payload.byteLength > maximumBytes) {
    return { ok: false, code: "IPC_OUTPUT_TOO_LARGE" };
  }
  return {
    ok: true,
    frame: Buffer.concat([
      SCANNER_IPC_MAGIC,
      u32be(payload.byteLength),
      Buffer.from(payload),
    ]),
  };
}
