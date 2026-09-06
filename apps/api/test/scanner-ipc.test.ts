import { describe, expect, it } from "vitest";

import {
  encodeScannerIpcFrame,
  readScannerIpcFrame,
  SCANNER_IPC_HEADER_BYTES,
  SCANNER_IPC_MAGIC,
  SCANNER_IPC_MAX_CHUNKS,
  SCANNER_IPC_MAX_PAYLOAD_BYTES,
  SCANNER_IPC_MAX_TIMEOUT_MS,
} from "../src/scanner-ipc/index.js";
import { produceCanonicalGuestScannerResult } from "../src/scanner-output/index.js";

function options(overrides: Record<string, unknown> = {}) {
  return {
    max_payload_bytes: 2 * 1_024 * 1_024,
    timeout_ms: 1_000,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function encoded(payload: Uint8Array = Buffer.from("payload")): Buffer {
  const result = encodeScannerIpcFrame(payload, 2 * 1_024 * 1_024);
  if (!result.ok) throw new Error(result.code);
  return Buffer.from(result.frame);
}

async function* chunks(...values: Uint8Array[]) {
  for (const value of values) yield value;
}

function guestScannerBytes(): Buffer {
  return Buffer.from(
    JSON.stringify({
      observations: [{ check_id: "DNS_CAA", outcome: "PASS" }],
      candidate_findings: [
        {
          fingerprint: `sha256:${"a".repeat(64)}`,
          severity: "LOW",
          confidence: 60,
          evidence: "internal evidence",
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
        duration_ms: 200,
        request_count: 2,
      },
      warnings: [],
    }),
  );
}

describe("scanner local IPC framing", () => {
  it("reads exactly one fragmented frame and returns isolated copies", async () => {
    const payload = Buffer.from("scanner-result");
    const frame = encoded(payload);
    const result = await readScannerIpcFrame(
      chunks(
        frame.subarray(0, 1),
        frame.subarray(1, SCANNER_IPC_HEADER_BYTES - 1),
        frame.subarray(
          SCANNER_IPC_HEADER_BYTES - 1,
          SCANNER_IPC_HEADER_BYTES + 2,
        ),
        frame.subarray(SCANNER_IPC_HEADER_BYTES + 2),
      ),
      options(),
    );

    expect(result).toMatchObject({ ok: true, result: { payload_size: 14 } });
    if (!result.ok) throw new Error(result.code);
    const first = result.result.read_payload();
    first.fill(0);
    expect(result.result.read_payload()).toEqual(payload);
    expect(Object.isFrozen(result.result)).toBe(true);
  });

  it("uses the fixed v1 magic and unsigned big-endian length", () => {
    const frame = encoded(Buffer.from([1, 2, 3]));
    expect(frame.subarray(0, SCANNER_IPC_MAGIC.byteLength)).toEqual(
      SCANNER_IPC_MAGIC,
    );
    expect(frame.readUInt32BE(SCANNER_IPC_MAGIC.byteLength)).toBe(3);
    expect(frame.byteLength).toBe(SCANNER_IPC_HEADER_BYTES + 3);
    expect(SCANNER_IPC_MAGIC.toString("ascii")).toBe(
      "OUTSCAN:SCANNER_RESULT:v1\0",
    );
  });

  it("copies encoder input before returning the frame", () => {
    const payload = Buffer.from("safe");
    const frame = encoded(payload);
    payload.fill(0);
    expect(frame.subarray(SCANNER_IPC_HEADER_BYTES).toString()).toBe("safe");
  });

  it.each([
    [Buffer.concat([encoded(), Buffer.from([0])])],
    [Buffer.concat([encoded(), encoded()])],
  ])("rejects trailing or multiple frames in one chunk", async (frame) => {
    await expect(
      readScannerIpcFrame(chunks(frame), options()),
    ).resolves.toEqual({
      ok: false,
      code: "IPC_INVALID_FRAME",
    });
  });

  it("rejects trailing bytes received after a complete frame", async () => {
    await expect(
      readScannerIpcFrame(chunks(encoded(), Buffer.from([0])), options()),
    ).resolves.toEqual({ ok: false, code: "IPC_INVALID_FRAME" });
  });

  it("rejects invalid magic, zero length and incomplete frames", async () => {
    const invalidMagic = encoded();
    invalidMagic[0] = (invalidMagic[0] ?? 0) ^ 1;
    const zeroLength = Buffer.concat([SCANNER_IPC_MAGIC, Buffer.alloc(4)]);
    const incomplete = encoded().subarray(0, -1);

    for (const frame of [invalidMagic, zeroLength, incomplete]) {
      await expect(
        readScannerIpcFrame(chunks(frame), options()),
      ).resolves.toEqual({
        ok: false,
        code: "IPC_INVALID_FRAME",
      });
    }
  });

  it("rejects a declared oversized payload before allocating it", async () => {
    const header = Buffer.alloc(SCANNER_IPC_HEADER_BYTES);
    SCANNER_IPC_MAGIC.copy(header);
    header.writeUInt32BE(1_025, SCANNER_IPC_MAGIC.byteLength);
    await expect(
      readScannerIpcFrame(
        chunks(header),
        options({ max_payload_bytes: 1_024 }),
      ),
    ).resolves.toEqual({ ok: false, code: "IPC_OUTPUT_TOO_LARGE" });
  });

  it("bounds chunk fragmentation including empty chunks", async () => {
    async function* fragmented() {
      for (let index = 0; index <= SCANNER_IPC_MAX_CHUNKS; index += 1) {
        yield Buffer.alloc(0);
      }
    }
    await expect(readScannerIpcFrame(fragmented(), options())).resolves.toEqual(
      {
        ok: false,
        code: "IPC_TOO_FRAGMENTED",
      },
    );
  });

  it("maps non-byte chunks and iterator failures to one stream error", async () => {
    async function* wrongType() {
      yield "not-bytes" as never;
    }
    async function* throwsDetail() {
      throw new Error("scanner secret");
    }
    for (const source of [wrongType(), throwsDetail()]) {
      await expect(readScannerIpcFrame(source, options())).resolves.toEqual({
        ok: false,
        code: "IPC_STREAM_ERROR",
      });
    }
  });

  it("cancels the iterator on an already-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let returns = 0;
    const iterator: AsyncIterator<Uint8Array> & AsyncIterable<Uint8Array> = {
      next: () => new Promise(() => undefined),
      return: async () => {
        returns += 1;
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    await expect(
      readScannerIpcFrame(iterator, options({ signal: controller.signal })),
    ).resolves.toEqual({ ok: false, code: "IPC_ABORTED" });
    await Promise.resolve();
    expect(returns).toBe(1);
  });

  it("uses one deadline and cancels a non-terminating iterator", async () => {
    let returns = 0;
    const iterator: AsyncIterator<Uint8Array> & AsyncIterable<Uint8Array> = {
      next: () => new Promise(() => undefined),
      return: async () => {
        returns += 1;
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
    await expect(
      readScannerIpcFrame(iterator, options({ timeout_ms: 20 })),
    ).resolves.toEqual({ ok: false, code: "IPC_TIMEOUT" });
    await Promise.resolve();
    expect(returns).toBe(1);
  });

  it.each([
    { max_payload_bytes: 0 },
    { max_payload_bytes: SCANNER_IPC_MAX_PAYLOAD_BYTES + 1 },
    { timeout_ms: 0 },
    { timeout_ms: SCANNER_IPC_MAX_TIMEOUT_MS + 1 },
    { signal: {} },
    { extra: true },
  ])("rejects invalid read context %#", async (change) => {
    await expect(
      readScannerIpcFrame(chunks(encoded()), options(change)),
    ).resolves.toEqual({ ok: false, code: "INVALID_IPC_CONTEXT" });
  });

  it("contains hostile option getters and reads valid getters once", async () => {
    const valid = options();
    let reads = 0;
    Object.defineProperty(valid, "max_payload_bytes", {
      enumerable: true,
      get() {
        reads += 1;
        return 1_024;
      },
    });
    await expect(
      readScannerIpcFrame(chunks(encoded()), valid),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(reads).toBe(1);

    const hostile = options();
    Object.defineProperty(hostile, "timeout_ms", {
      enumerable: true,
      get() {
        throw new Error("do not leak");
      },
    });
    await expect(
      readScannerIpcFrame(chunks(encoded()), hostile),
    ).resolves.toEqual({
      ok: false,
      code: "INVALID_IPC_CONTEXT",
    });
  });

  it.each([
    ["not-bytes", 1_024, "INVALID_IPC_CONTEXT"],
    [Buffer.alloc(0), 1_024, "IPC_OUTPUT_TOO_LARGE"],
    [Buffer.alloc(2), 1, "IPC_OUTPUT_TOO_LARGE"],
    [Buffer.alloc(2), 0, "INVALID_IPC_CONTEXT"],
  ])("rejects invalid encoder input %#", (payload, limit, code) => {
    expect(encodeScannerIpcFrame(payload, limit)).toEqual({ ok: false, code });
  });

  it("feeds one bounded scanner frame into canonical Guest production", async () => {
    const raw = guestScannerBytes();
    const frame = encoded(raw);
    const read = await readScannerIpcFrame(
      chunks(frame.subarray(0, 7), frame.subarray(7)),
      options(),
    );
    if (!read.ok) throw new Error(read.code);
    const canonical = produceCanonicalGuestScannerResult(
      read.result.read_payload(),
      2 * 1_024 * 1_024,
    );
    expect(canonical).toMatchObject({
      ok: true,
      result: {
        projection: { canonical_host: "example.com", potential_risk_count: 1 },
      },
    });
  });
});
