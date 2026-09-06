export const SCANNER_IPC_MAX_PAYLOAD_BYTES = 32 * 1_024 * 1_024;
export const SCANNER_IPC_MAX_TIMEOUT_MS = 300_000;
export const SCANNER_IPC_MAX_CHUNKS = 4_096;

export interface ScannerIpcReadOptions {
  max_payload_bytes: number;
  timeout_ms: number;
  signal: AbortSignal;
}

export interface ScannerIpcPayload {
  payload_size: number;
  read_payload: () => Uint8Array;
}

export type ScannerIpcReadResult =
  | { ok: true; result: Readonly<ScannerIpcPayload> }
  | {
      ok: false;
      code:
        | "INVALID_IPC_CONTEXT"
        | "IPC_ABORTED"
        | "IPC_TIMEOUT"
        | "IPC_STREAM_ERROR"
        | "IPC_INVALID_FRAME"
        | "IPC_OUTPUT_TOO_LARGE"
        | "IPC_TOO_FRAGMENTED";
    };

export type ScannerIpcEncodeResult =
  | { ok: true; frame: Uint8Array }
  | {
      ok: false;
      code: "INVALID_IPC_CONTEXT" | "IPC_OUTPUT_TOO_LARGE";
    };
