import { request as httpRequest } from "node:http";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";

import { classifyResolvedAddressSet } from "./ip-policy.js";
import {
  createPinnedRequestOptions,
  type PinnedRequestResult,
} from "./pinned-request.js";

const MAX_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 2 * 1_024 * 1_024;
const MAX_HEADER_PAIRS = 100;
const MAX_HEADER_BYTES = 64 * 1_024;
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9a-z-]+$/u;

export interface PinnedTransportLimits {
  timeout_ms: number;
  max_response_bytes: number;
  max_header_pairs: number;
  max_header_bytes: number;
}

export interface SafeResponseHeader {
  name: string;
  value: string;
}

export interface PinnedTransportResponse {
  status_code: number;
  headers: readonly SafeResponseHeader[];
  body: Buffer;
  connected_address: string;
}

export type PinnedTransportResult =
  | { ok: true; response: PinnedTransportResponse }
  | {
      ok: false;
      code:
        | "INVALID_LIMITS"
        | "TRANSPORT_INIT_FAILED"
        | "TRANSPORT_ERROR"
        | "TIMEOUT"
        | "PIN_MISMATCH"
        | "INVALID_RESPONSE"
        | "RESPONSE_HEADERS_REJECTED"
        | "RESPONSE_TOO_LARGE"
        | Extract<PinnedRequestResult, { ok: false }>["code"];
    };

export type RequestDispatcher = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest;

export interface PinnedDispatchers {
  http: RequestDispatcher;
  https: RequestDispatcher;
}

const NODE_DISPATCHERS: PinnedDispatchers = Object.freeze({
  http: httpRequest,
  https: httpsRequest,
});

function exactObject(value: unknown, keys: readonly string[]): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

export function parsePinnedTransportLimits(
  input: unknown,
): Readonly<PinnedTransportLimits> | null {
  const keys = [
    "timeout_ms",
    "max_response_bytes",
    "max_header_pairs",
    "max_header_bytes",
  ];
  if (!exactObject(input, keys)) return null;
  const value = input as Record<string, unknown>;
  const timeoutMs = value.timeout_ms;
  const maxResponseBytes = value.max_response_bytes;
  const maxHeaderPairs = value.max_header_pairs;
  const maxHeaderBytes = value.max_header_bytes;
  if (
    !boundedInteger(timeoutMs, 100, MAX_TIMEOUT_MS) ||
    !boundedInteger(maxResponseBytes, 1, MAX_RESPONSE_BYTES) ||
    !boundedInteger(maxHeaderPairs, 1, MAX_HEADER_PAIRS) ||
    !boundedInteger(maxHeaderBytes, 1, MAX_HEADER_BYTES)
  ) {
    return null;
  }
  return Object.freeze({
    timeout_ms: timeoutMs as number,
    max_response_bytes: maxResponseBytes as number,
    max_header_pairs: maxHeaderPairs as number,
    max_header_bytes: maxHeaderBytes as number,
  });
}

function normalizedAddress(address: unknown): string | null {
  if (typeof address !== "string") return null;
  const decision = classifyResolvedAddressSet([address]);
  return decision.ok ? (decision.addresses[0]?.address ?? null) : null;
}

function parseHeaders(
  rawHeaders: unknown,
  limits: PinnedTransportLimits,
): readonly SafeResponseHeader[] | null {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) return null;
  if (rawHeaders.length / 2 > limits.max_header_pairs) return null;

  let totalBytes = 0;
  const headers: SafeResponseHeader[] = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const rawName: unknown = rawHeaders[index];
    const rawValue: unknown = rawHeaders[index + 1];
    if (typeof rawName !== "string" || typeof rawValue !== "string") {
      return null;
    }
    const name = rawName.toLowerCase();
    if (
      name.length === 0 ||
      name.length > 256 ||
      !HEADER_NAME.test(name) ||
      rawValue.length > 8_192 ||
      /[\0\r\n]/u.test(rawValue)
    ) {
      return null;
    }
    totalBytes += Buffer.byteLength(name) + Buffer.byteLength(rawValue);
    if (totalBytes > limits.max_header_bytes) return null;
    headers.push(Object.freeze({ name, value: rawValue }));
  }
  return Object.freeze(headers);
}

function declaredLength(
  headers: readonly SafeResponseHeader[],
): { present: boolean; value: number } | null {
  const lengths = headers.filter((header) => header.name === "content-length");
  if (lengths.length === 0) return { present: false, value: 0 };
  if (lengths.length !== 1 || !/^(0|[1-9][0-9]*)$/u.test(lengths[0]!.value)) {
    return null;
  }
  const value = Number(lengths[0]!.value);
  return Number.isSafeInteger(value) ? { present: true, value } : null;
}

function hasTransferEncoding(headers: readonly SafeResponseHeader[]): boolean {
  return headers.some((header) => header.name === "transfer-encoding");
}

function safeResponse(
  statusCode: number,
  headers: readonly SafeResponseHeader[],
  body: Buffer,
  connectedAddress: string,
): PinnedTransportResponse {
  return Object.freeze({
    status_code: statusCode,
    headers,
    body,
    connected_address: connectedAddress,
  });
}

export async function executePinnedRequest(
  targetInput: unknown,
  requestInput: unknown,
  limitsInput: unknown,
  configuredInternalCidrs: unknown = [],
  dispatchers: PinnedDispatchers = NODE_DISPATCHERS,
): Promise<PinnedTransportResult> {
  let limits: PinnedTransportLimits | null;
  try {
    limits = parsePinnedTransportLimits(limitsInput);
  } catch {
    return { ok: false, code: "INVALID_LIMITS" };
  }
  if (!limits) return { ok: false, code: "INVALID_LIMITS" };
  const plan = createPinnedRequestOptions(
    targetInput,
    requestInput,
    configuredInternalCidrs,
  );
  if (!plan.ok) return plan;

  const options = plan.options;
  const protocol = options.protocol;
  let dispatcher: RequestDispatcher;
  try {
    dispatcher = protocol === "https:" ? dispatchers.https : dispatchers.http;
  } catch {
    return { ok: false, code: "TRANSPORT_INIT_FAILED" };
  }
  if (typeof dispatcher !== "function") {
    return { ok: false, code: "TRANSPORT_INIT_FAILED" };
  }
  const pinnedAddress = (requestInput as { pinned_address: string })
    .pinned_address;

  return await new Promise<PinnedTransportResult>((resolve) => {
    let settled = false;
    let connectedAddress: string | null = null;
    let request: ClientRequest | null = null;
    let response: IncomingMessage | null = null;
    const settle = (result: PinnedTransportResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(result);
    };
    const fail = (
      code: Extract<PinnedTransportResult, { ok: false }>["code"],
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      response?.destroy();
      request?.destroy();
      resolve({ ok: false, code });
    };
    const deadline = setTimeout(() => fail("TIMEOUT"), limits.timeout_ms);

    try {
      request = dispatcher(
        { ...options, maxHeaderSize: limits.max_header_bytes },
        (incoming) => {
          response = incoming;
          const responseAddress = connectedAddress;
          if (!responseAddress) return fail("PIN_MISMATCH");
          const statusCode = incoming.statusCode;
          if (
            !Number.isInteger(statusCode) ||
            (statusCode as number) < 100 ||
            (statusCode as number) > 599
          ) {
            return fail("INVALID_RESPONSE");
          }
          const headers = parseHeaders(incoming.rawHeaders, limits);
          if (!headers) return fail("RESPONSE_HEADERS_REJECTED");
          const length = declaredLength(headers);
          if (
            length === null ||
            (length.present && hasTransferEncoding(headers))
          ) {
            return fail("INVALID_RESPONSE");
          }
          if (length.value > limits.max_response_bytes) {
            return fail("RESPONSE_TOO_LARGE");
          }

          const chunks: Buffer[] = [];
          let received = 0;
          incoming.on("data", (chunk: unknown) => {
            if (settled) return;
            if (!(typeof chunk === "string" || chunk instanceof Uint8Array)) {
              return fail("INVALID_RESPONSE");
            }
            const buffer = Buffer.from(chunk);
            received += buffer.byteLength;
            if (received > limits.max_response_bytes) {
              return fail("RESPONSE_TOO_LARGE");
            }
            chunks.push(buffer);
          });
          incoming.once("aborted", () => fail("TRANSPORT_ERROR"));
          incoming.once("error", () => fail("TRANSPORT_ERROR"));
          incoming.once("end", () => {
            if (settled) return;
            if (
              !incoming.complete ||
              (length.present && length.value !== received)
            ) {
              return fail("INVALID_RESPONSE");
            }
            settle({
              ok: true,
              response: safeResponse(
                statusCode as number,
                headers,
                Buffer.concat(chunks, received),
                responseAddress,
              ),
            });
          });
        },
      );
      request.once("socket", (socket) => {
        const connected = () => {
          const actual = normalizedAddress(socket.remoteAddress);
          const expected = normalizedAddress(pinnedAddress);
          if (!actual || !expected || actual !== expected) {
            fail("PIN_MISMATCH");
            return;
          }
          connectedAddress = actual;
        };
        socket.once(
          protocol === "https:" ? "secureConnect" : "connect",
          connected,
        );
      });
      request.once("error", () => fail("TRANSPORT_ERROR"));
      request.end();
    } catch {
      fail("TRANSPORT_INIT_FAILED");
    }
  });
}
