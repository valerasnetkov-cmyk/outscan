import {
  hasScannerIpcMagic,
  readScannerIpcPayloadLength,
  SCANNER_IPC_HEADER_BYTES,
} from "./frame.js";
import {
  SCANNER_IPC_MAX_CHUNKS,
  SCANNER_IPC_MAX_PAYLOAD_BYTES,
  SCANNER_IPC_MAX_TIMEOUT_MS,
  type ScannerIpcReadOptions,
  type ScannerIpcReadResult,
} from "./model.js";

const OPTION_KEYS = ["max_payload_bytes", "timeout_ms", "signal"] as const;

type NextResult =
  | { kind: "NEXT"; value: IteratorResult<Uint8Array> }
  | { kind: "ABORTED" }
  | { kind: "TIMEOUT" }
  | { kind: "ERROR" };

function fail(
  code: Extract<ScannerIpcReadResult, { ok: false }>["code"],
): ScannerIpcReadResult {
  return { ok: false, code };
}

function snapshotOptions(value: unknown): ScannerIpcReadOptions | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== OPTION_KEYS.length ||
      !keys.every(
        (key) =>
          typeof key === "string" && OPTION_KEYS.some((item) => item === key),
      )
    ) {
      return null;
    }
    const input = value as Record<string, unknown>;
    const maxPayloadBytes = input.max_payload_bytes;
    const timeoutMs = input.timeout_ms;
    const signal = input.signal;
    if (
      !Number.isSafeInteger(maxPayloadBytes) ||
      (maxPayloadBytes as number) <= 0 ||
      (maxPayloadBytes as number) > SCANNER_IPC_MAX_PAYLOAD_BYTES ||
      !Number.isSafeInteger(timeoutMs) ||
      (timeoutMs as number) <= 0 ||
      (timeoutMs as number) > SCANNER_IPC_MAX_TIMEOUT_MS ||
      !(signal instanceof AbortSignal)
    ) {
      return null;
    }
    return {
      max_payload_bytes: maxPayloadBytes as number,
      timeout_ms: timeoutMs as number,
      signal,
    };
  } catch {
    return null;
  }
}

function cancelIterator(iterator: AsyncIterator<Uint8Array>): void {
  try {
    if (typeof iterator.return === "function") {
      void Promise.resolve(iterator.return()).catch(() => undefined);
    }
  } catch {
    // Cancellation is best-effort; the stable read failure remains authoritative.
  }
}

function nextWithDeadline(
  iterator: AsyncIterator<Uint8Array>,
  signal: AbortSignal,
  deadlineUnixMs: number,
): Promise<NextResult> {
  if (signal.aborted) return Promise.resolve({ kind: "ABORTED" });
  const remainingMs = deadlineUnixMs - Date.now();
  if (remainingMs <= 0) return Promise.resolve({ kind: "TIMEOUT" });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: NextResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => finish({ kind: "ABORTED" });
    const timer = setTimeout(() => finish({ kind: "TIMEOUT" }), remainingMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    Promise.resolve()
      .then(() => iterator.next())
      .then(
        (value) => finish({ kind: "NEXT", value }),
        () => finish({ kind: "ERROR" }),
      );
  });
}

function getIterator(source: unknown): AsyncIterator<Uint8Array> | null {
  try {
    if (
      typeof source !== "object" ||
      source === null ||
      !(Symbol.asyncIterator in source)
    ) {
      return null;
    }
    const factory = (source as AsyncIterable<Uint8Array>)[Symbol.asyncIterator];
    if (typeof factory !== "function") return null;
    const iterator = factory.call(source);
    return iterator && typeof iterator.next === "function" ? iterator : null;
  } catch {
    return null;
  }
}

export async function readScannerIpcFrame(
  source: unknown,
  options: unknown,
): Promise<ScannerIpcReadResult> {
  const context = snapshotOptions(options);
  if (!context) return fail("INVALID_IPC_CONTEXT");
  const maxPayloadBytes = context.max_payload_bytes;
  const timeoutMs = context.timeout_ms;
  const signal = context.signal;
  const iterator = getIterator(source);
  if (!iterator) return fail("INVALID_IPC_CONTEXT");

  const deadlineUnixMs = Date.now() + timeoutMs;
  const header = Buffer.alloc(SCANNER_IPC_HEADER_BYTES);
  let headerOffset = 0;
  let payload: Buffer | null = null;
  let payloadOffset = 0;
  let chunks = 0;

  while (true) {
    const next = await nextWithDeadline(iterator, signal, deadlineUnixMs);
    if (next.kind !== "NEXT") {
      cancelIterator(iterator);
      if (next.kind === "ABORTED") return fail("IPC_ABORTED");
      if (next.kind === "TIMEOUT") return fail("IPC_TIMEOUT");
      return fail("IPC_STREAM_ERROR");
    }
    if (next.value.done) {
      if (!payload || payloadOffset !== payload.byteLength) {
        return fail("IPC_INVALID_FRAME");
      }
      const snapshot = Buffer.from(payload);
      return {
        ok: true,
        result: Object.freeze({
          payload_size: snapshot.byteLength,
          read_payload: () => Buffer.from(snapshot),
        }),
      };
    }

    chunks += 1;
    if (chunks > SCANNER_IPC_MAX_CHUNKS) {
      cancelIterator(iterator);
      return fail("IPC_TOO_FRAGMENTED");
    }
    const value: unknown = next.value.value;
    if (!(value instanceof Uint8Array)) {
      cancelIterator(iterator);
      return fail("IPC_STREAM_ERROR");
    }
    const chunk = Buffer.from(value);
    let offset = 0;

    if (headerOffset < header.byteLength) {
      const count = Math.min(
        header.byteLength - headerOffset,
        chunk.byteLength,
      );
      chunk.copy(header, headerOffset, offset, offset + count);
      headerOffset += count;
      offset += count;
      if (headerOffset === header.byteLength) {
        if (!hasScannerIpcMagic(header)) {
          cancelIterator(iterator);
          return fail("IPC_INVALID_FRAME");
        }
        const length = readScannerIpcPayloadLength(header);
        if (length === null || length === 0) {
          cancelIterator(iterator);
          return fail("IPC_INVALID_FRAME");
        }
        if (length > maxPayloadBytes) {
          cancelIterator(iterator);
          return fail("IPC_OUTPUT_TOO_LARGE");
        }
        payload = Buffer.alloc(length);
      }
    }

    if (payload && offset < chunk.byteLength) {
      const count = Math.min(
        payload.byteLength - payloadOffset,
        chunk.byteLength - offset,
      );
      chunk.copy(payload, payloadOffset, offset, offset + count);
      payloadOffset += count;
      offset += count;
    }
    if (offset !== chunk.byteLength) {
      cancelIterator(iterator);
      return fail("IPC_INVALID_FRAME");
    }
  }
}
