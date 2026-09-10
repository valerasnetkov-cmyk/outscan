import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

import { isGuestSessionSetCookieHeader } from "../guest-crypto/index.js";

const ROUTE = "/v1/public/guest-session";
const SECURITY_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
});

export type GuestSessionBootstrapDecision =
  | Readonly<{ ok: true; action: "REUSED" }>
  | Readonly<{ ok: true; action: "ISSUED"; set_cookie: string }>;

export type GuestSessionBootstrapper = (
  request: Readonly<{ cookie_header: string | undefined }>,
) => Promise<GuestSessionBootstrapDecision>;

export interface GuestSessionRouteDependencies {
  allowed_origin: string;
  bootstrap_session: GuestSessionBootstrapper;
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
  value: GuestSessionRouteDependencies,
): Readonly<GuestSessionRouteDependencies> | null {
  try {
    const allowedOrigin = canonicalHttpsOrigin(value?.allowed_origin);
    const bootstrapSession = value?.bootstrap_session;
    return allowedOrigin && typeof bootstrapSession === "function"
      ? Object.freeze({
          allowed_origin: allowedOrigin,
          bootstrap_session: bootstrapSession,
        })
      : null;
  } catch {
    return null;
  }
}

function singleRawHeader(
  request: FastifyRequest,
  name: "cookie" | "origin",
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

function emptyObject(value: unknown): boolean {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      Reflect.ownKeys(value).length === 0
    );
  } catch {
    return false;
  }
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === expected.length &&
      keys.every((key) => typeof key === "string" && expected.includes(key))
    );
  } catch {
    return false;
  }
}

function validDecision(value: unknown): value is GuestSessionBootstrapDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    if (Reflect.get(value, "ok") !== true) return false;
    const action = Reflect.get(value, "action");
    if (action === "REUSED") return exactKeys(value, ["ok", "action"]);
    return (
      action === "ISSUED" &&
      exactKeys(value, ["ok", "action", "set_cookie"]) &&
      isGuestSessionSetCookieHeader(Reflect.get(value, "set_cookie"))
    );
  } catch {
    return false;
  }
}

function error(reply: FastifyReply, statusCode: 400 | 503) {
  const code =
    statusCode === 400
      ? "INVALID_GUEST_SESSION_REQUEST"
      : "GUEST_SESSION_UNAVAILABLE";
  return reply
    .code(statusCode)
    .headers(SECURITY_HEADERS)
    .send({ error: { code } });
}

export function createGuestSessionRoutePlugin(
  rawDependencies: GuestSessionRouteDependencies,
): FastifyPluginAsync {
  const dependencies = dependenciesSnapshot(rawDependencies);
  if (!dependencies)
    throw new Error("INVALID_GUEST_SESSION_ROUTE_CONFIGURATION");

  return async function guestSessionRoutePlugin(app) {
    app.route<{ Querystring: Record<string, unknown> }>({
      method: "POST",
      url: ROUTE,
      async handler(request, reply) {
        const origin = singleRawHeader(request, "origin");
        const cookie = singleRawHeader(request, "cookie");
        if (
          !origin.ok ||
          origin.value !== dependencies.allowed_origin ||
          !cookie.ok ||
          !emptyObject(request.query) ||
          request.body !== undefined
        ) {
          return error(reply, 400);
        }

        let decision: GuestSessionBootstrapDecision;
        try {
          decision = await dependencies.bootstrap_session(
            Object.freeze({ cookie_header: cookie.value }),
          );
        } catch {
          return error(reply, 503);
        }
        if (!validDecision(decision)) return error(reply, 503);

        if (decision.action === "ISSUED") {
          reply.header("set-cookie", decision.set_cookie);
        }
        return reply.code(204).headers(SECURITY_HEADERS).send();
      },
    });
  };
}

export const GUEST_SESSION_ROUTE = ROUTE;
