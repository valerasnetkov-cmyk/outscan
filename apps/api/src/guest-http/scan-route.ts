import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import type {
  GuestScanCreationErrorCode,
  GuestScanCreationResult,
  GuestScanCreationSuccessBody,
} from "../guest-scan/index.js";

const ROUTE = "/v1/public/scans";
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const JSON_MEDIA_TYPE = /^application\/json(?:;\s*charset=utf-8)?$/iu;
const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

export type GuestScanRouteCreator = (
  value: unknown,
) => Promise<GuestScanCreationResult>;

export interface GuestScanRouteDependencies {
  allowed_origin: string;
  create_scan: GuestScanRouteCreator;
}

type RouteDecision =
  | Readonly<{
      ok: true;
      status_code: 200 | 202;
      body: Readonly<GuestScanCreationSuccessBody>;
    }>
  | Readonly<{
      ok: false;
      status_code: 400 | 401 | 409 | 429 | 503;
      code: GuestScanCreationErrorCode;
      retry_after: string | null;
    }>;

function exactRecord(value: unknown, keys: readonly string[]): boolean {
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

function canonicalHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" &&
      parsed.origin === value &&
      parsed.pathname === "/" &&
      parsed.search === "" &&
      parsed.hash === "" &&
      parsed.username === "" &&
      parsed.password === ""
      ? value
      : null;
  } catch {
    return null;
  }
}

function dependenciesSnapshot(
  value: GuestScanRouteDependencies,
): Readonly<GuestScanRouteDependencies> | null {
  try {
    const allowedOrigin = canonicalHttpsOrigin(value?.allowed_origin);
    const createScan = value?.create_scan;
    return allowedOrigin && typeof createScan === "function"
      ? Object.freeze({
          allowed_origin: allowedOrigin,
          create_scan: createScan,
        })
      : null;
  } catch {
    return null;
  }
}

function singleRawHeader(
  request: FastifyRequest,
  name:
    | "content-type"
    | "cookie"
    | "idempotency-key"
    | "origin"
    | "x-forwarded-for",
): { ok: true; value: string | undefined } | { ok: false } {
  try {
    const raw = request.raw.rawHeaders;
    let value: string | undefined;
    for (let index = 0; index < raw.length; index += 2) {
      if (raw[index]?.toLowerCase() !== name) continue;
      if (value !== undefined || typeof raw[index + 1] !== "string") {
        return { ok: false };
      }
      value = raw[index + 1];
    }
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

function emptyQuery(value: unknown): boolean {
  return exactRecord(value, []);
}

function validServiceHeaders(
  value: unknown,
  allowRetryAfter: boolean,
): { ok: true; retry_after: string | null } | { ok: false } {
  const base = ["cache-control", "referrer-policy"];
  const hasRetryAfter = exactRecord(value, [...base, "retry-after"]);
  if (!exactRecord(value, base) && !(allowRetryAfter && hasRetryAfter)) {
    return { ok: false };
  }
  try {
    if (
      Reflect.get(value as object, "cache-control") !== "no-store" ||
      Reflect.get(value as object, "referrer-policy") !== "no-referrer"
    ) {
      return { ok: false };
    }
    if (!hasRetryAfter) return { ok: true, retry_after: null };
    const retry = Reflect.get(value as object, "retry-after");
    if (typeof retry !== "string" || !/^[1-9][0-9]{0,4}$/u.test(retry)) {
      return { ok: false };
    }
    const seconds = Number(retry);
    return seconds <= 86_400 ? { ok: true, retry_after: retry } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function successBody(
  value: unknown,
): Readonly<GuestScanCreationSuccessBody> | null {
  if (
    !exactRecord(value, [
      "scanId",
      "resultToken",
      "status",
      "resultAccessExpiresAt",
      "resultTokenExpiresInSeconds",
    ])
  ) {
    return null;
  }
  try {
    const scanId = Reflect.get(value as object, "scanId");
    const resultToken = Reflect.get(value as object, "resultToken");
    const status = Reflect.get(value as object, "status");
    const expiresAt = Reflect.get(value as object, "resultAccessExpiresAt");
    const expiresIn = Reflect.get(
      value as object,
      "resultTokenExpiresInSeconds",
    );
    if (
      typeof scanId !== "string" ||
      !ID.test(scanId) ||
      typeof resultToken !== "string" ||
      !TOKEN.test(resultToken) ||
      status !== "QUEUED" ||
      typeof expiresAt !== "string" ||
      expiresAt.length !== 24 ||
      new Date(expiresAt).toISOString() !== expiresAt ||
      !Number.isSafeInteger(expiresIn) ||
      (expiresIn as number) < 1 ||
      (expiresIn as number) > 1_800
    ) {
      return null;
    }
    return Object.freeze({
      scanId,
      resultToken,
      status,
      resultAccessExpiresAt: expiresAt,
      resultTokenExpiresInSeconds: expiresIn as number,
    });
  } catch {
    return null;
  }
}

const ERROR_STATUS = Object.freeze({
  INVALID_SCAN_REQUEST: 400,
  GUEST_SESSION_REQUIRED: 401,
  GUEST_SESSION_INVALID: 401,
  IDEMPOTENCY_KEY_REUSED: 409,
  GUEST_SCAN_LIMIT_EXCEEDED: 429,
  GUEST_SCANNING_UNAVAILABLE: 503,
  GUEST_SCAN_UNAVAILABLE: 503,
} satisfies Record<GuestScanCreationErrorCode, number>);

function decisionSnapshot(value: unknown): RouteDecision | null {
  if (!exactRecord(value, ["ok", "status_code", "headers", "body"])) {
    return null;
  }
  try {
    const ok = Reflect.get(value as object, "ok");
    const statusCode = Reflect.get(value as object, "status_code");
    const headers = Reflect.get(value as object, "headers");
    const body = Reflect.get(value as object, "body");
    if (ok === true) {
      const projected = successBody(body);
      const checkedHeaders = validServiceHeaders(headers, false);
      return (statusCode === 200 || statusCode === 202) &&
        checkedHeaders.ok &&
        projected
        ? Object.freeze({ ok: true, status_code: statusCode, body: projected })
        : null;
    }
    if (ok !== false || !exactRecord(body, ["error"])) return null;
    const errorBody = Reflect.get(body as object, "error");
    if (!exactRecord(errorBody, ["code"])) return null;
    const code = Reflect.get(errorBody as object, "code");
    if (
      typeof code !== "string" ||
      !Object.prototype.hasOwnProperty.call(ERROR_STATUS, code)
    ) {
      return null;
    }
    const expectedStatus = ERROR_STATUS[code as GuestScanCreationErrorCode];
    if (statusCode !== expectedStatus) return null;
    const checkedHeaders = validServiceHeaders(headers, statusCode === 429);
    return checkedHeaders.ok
      ? Object.freeze({
          ok: false,
          status_code: statusCode,
          code: code as GuestScanCreationErrorCode,
          retry_after: checkedHeaders.retry_after,
        })
      : null;
  } catch {
    return null;
  }
}

function error(
  reply: FastifyReply,
  statusCode: 400 | 401 | 409 | 429 | 503,
  code: GuestScanCreationErrorCode,
  retryAfter: string | null = null,
) {
  reply.code(statusCode).headers(SECURITY_HEADERS);
  if (retryAfter !== null) reply.header("retry-after", retryAfter);
  return reply.send({ error: { code } });
}

export function createGuestScanRoutePlugin(
  rawDependencies: GuestScanRouteDependencies,
): FastifyPluginAsync {
  const dependencies = dependenciesSnapshot(rawDependencies);
  if (!dependencies) throw new Error("INVALID_GUEST_SCAN_ROUTE_CONFIGURATION");

  return async function guestScanRoutePlugin(app) {
    app.route<{ Body: unknown; Querystring: Record<string, unknown> }>({
      method: "POST",
      url: ROUTE,
      bodyLimit: 1_024,
      errorHandler(_cause, _request, reply) {
        return error(reply, 400, "INVALID_SCAN_REQUEST");
      },
      async handler(request, reply) {
        const origin = singleRawHeader(request, "origin");
        const cookie = singleRawHeader(request, "cookie");
        const idempotency = singleRawHeader(request, "idempotency-key");
        const forwardedFor = singleRawHeader(request, "x-forwarded-for");
        const contentType = singleRawHeader(request, "content-type");
        if (
          !origin.ok ||
          origin.value !== dependencies.allowed_origin ||
          !cookie.ok ||
          !idempotency.ok ||
          !forwardedFor.ok ||
          !contentType.ok ||
          typeof contentType.value !== "string" ||
          !JSON_MEDIA_TYPE.test(contentType.value) ||
          !emptyQuery(request.query)
        ) {
          return error(reply, 400, "INVALID_SCAN_REQUEST");
        }

        let result: unknown;
        try {
          result = await dependencies.create_scan(
            Object.freeze({
              body: request.body,
              cookie_header: cookie.value,
              idempotency_key_header: idempotency.value,
              socket_remote_address: request.socket.remoteAddress,
              x_forwarded_for: forwardedFor.value,
            }),
          );
        } catch {
          return error(reply, 503, "GUEST_SCAN_UNAVAILABLE");
        }
        const decision = decisionSnapshot(result);
        if (!decision) return error(reply, 503, "GUEST_SCAN_UNAVAILABLE");
        if (!decision.ok) {
          return error(
            reply,
            decision.status_code,
            decision.code,
            decision.retry_after,
          );
        }
        return reply
          .code(decision.status_code)
          .headers(SECURITY_HEADERS)
          .send(decision.body);
      },
    });
  };
}

export const GUEST_SCAN_ROUTE = ROUTE;
