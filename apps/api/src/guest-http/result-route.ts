import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { GUEST_RESULT_SECURITY_HEADERS } from "../guest-crypto/index.js";
import type { ReadGuestResultDecision } from "../guest-scan/index.js";
import { projectGuestResultDecision } from "./result-projection.js";

const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const ROUTE = "/v1/public/scans/:scanId";

export type GuestResultRouteReader = (
  request: Readonly<{
    authorization_header: unknown;
    route_guest_scan_id: unknown;
    query: unknown;
    now_unix_seconds: bigint;
  }>,
) => Promise<ReadGuestResultDecision>;

export interface GuestResultRouteDependencies {
  read_result: GuestResultRouteReader;
  now_unix_seconds: () => bigint;
}

function dependenciesSnapshot(
  value: GuestResultRouteDependencies,
): Readonly<GuestResultRouteDependencies> | null {
  try {
    const readResult = value?.read_result;
    const now = value?.now_unix_seconds;
    return typeof readResult === "function" && typeof now === "function"
      ? Object.freeze({ read_result: readResult, now_unix_seconds: now })
      : null;
  } catch {
    return null;
  }
}

function authorizationHeader(request: FastifyRequest): string | undefined {
  try {
    const raw = request.raw.rawHeaders;
    let value: string | undefined;
    for (let index = 0; index < raw.length; index += 2) {
      if (raw[index]?.toLowerCase() !== "authorization") continue;
      if (value !== undefined || typeof raw[index + 1] !== "string") {
        return undefined;
      }
      value = raw[index + 1];
    }
    return value;
  } catch {
    return undefined;
  }
}

function hasQuery(value: unknown): boolean | null {
  try {
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? Reflect.ownKeys(value).length > 0
      : null;
  } catch {
    return null;
  }
}

function error(
  reply: FastifyReply,
  statusCode: 400 | 404 | 503,
  code:
    | "INVALID_RESULT_REQUEST"
    | "RESULT_ACCESS_DENIED"
    | "RESULT_SERVICE_UNAVAILABLE",
) {
  return reply
    .code(statusCode)
    .headers(GUEST_RESULT_SECURITY_HEADERS)
    .send({ error: { code } });
}

export function createGuestResultRoutePlugin(
  rawDependencies: GuestResultRouteDependencies,
): FastifyPluginAsync {
  const dependencies = dependenciesSnapshot(rawDependencies);
  if (!dependencies)
    throw new Error("INVALID_GUEST_RESULT_ROUTE_CONFIGURATION");

  return async function guestResultRoutePlugin(app) {
    app.route<{
      Params: { scanId: string };
      Querystring: Record<string, unknown>;
    }>({
      method: "GET",
      url: ROUTE,
      exposeHeadRoute: false,
      async handler(request, reply) {
        const queryPresent = hasQuery(request.query);
        if (queryPresent !== false) {
          return error(reply, 400, "INVALID_RESULT_REQUEST");
        }
        let now: bigint;
        try {
          now = dependencies.now_unix_seconds();
          if (typeof now !== "bigint" || now < 0n || now > UINT64_MAX)
            throw new Error();
        } catch {
          return error(reply, 503, "RESULT_SERVICE_UNAVAILABLE");
        }

        let decision: ReadGuestResultDecision;
        try {
          const rawDecision = await dependencies.read_result(
            Object.freeze({
              authorization_header: authorizationHeader(request),
              route_guest_scan_id: request.params.scanId,
              query: request.query,
              now_unix_seconds: now,
            }),
          );
          const projected = projectGuestResultDecision(
            rawDecision,
            request.params.scanId,
            now,
          );
          if (!projected)
            return error(reply, 503, "RESULT_SERVICE_UNAVAILABLE");
          decision = projected;
        } catch {
          return error(reply, 503, "RESULT_SERVICE_UNAVAILABLE");
        }
        if (!decision.ok) {
          return decision.code === "INVALID_RESULT_REQUEST"
            ? error(reply, 400, decision.code)
            : error(reply, 404, "RESULT_ACCESS_DENIED");
        }
        return reply.headers(GUEST_RESULT_SECURITY_HEADERS).send(decision.body);
      },
    });
  };
}

export const GUEST_RESULT_ROUTE = ROUTE;
