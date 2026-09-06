import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const YANDEX_METRIKA_OAUTH_SCOPE = "metrika:read";
export const YANDEX_METRIKA_CALLBACK_URL =
  "https://outscan.ru/api/integrations/yandex-metrika/callback";
const AUTHORIZATION_ENDPOINT = "https://oauth.yandex.ru/authorize";
const OAUTH_SESSION_SECONDS = 600;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const BASE64URL_256_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export interface YandexMetrikaOAuthSession {
  state: string;
  codeVerifier: string;
  expiresAtEpochSeconds: number;
}

export interface YandexMetrikaAuthorizationRequest {
  authorizationUrl: string;
  session: YandexMetrikaOAuthSession;
}

export type OAuthCallbackResult =
  { ok: true; code: string } | { ok: false; code: "OAUTH_CALLBACK_DENIED" };

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function validEpochSeconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function createYandexMetrikaAuthorizationRequest(
  clientId: string,
  nowEpochSeconds: number,
  randomBytesFn: (size: number) => Uint8Array = randomBytes,
): YandexMetrikaAuthorizationRequest {
  if (
    typeof clientId !== "string" ||
    !CLIENT_ID_PATTERN.test(clientId) ||
    !validEpochSeconds(nowEpochSeconds) ||
    typeof randomBytesFn !== "function"
  ) {
    throw new Error("INVALID_OAUTH_CONFIGURATION");
  }
  const stateBytes = randomBytesFn(32);
  const verifierBytes = randomBytesFn(32);
  if (stateBytes.length !== 32 || verifierBytes.length !== 32) {
    throw new Error("INVALID_OAUTH_ENTROPY_SOURCE");
  }
  const state = base64url(stateBytes);
  const codeVerifier = base64url(verifierBytes);
  const codeChallenge = createHash("sha256")
    .update(codeVerifier, "ascii")
    .digest("base64url");
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", YANDEX_METRIKA_CALLBACK_URL);
  url.searchParams.set("scope", YANDEX_METRIKA_OAUTH_SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return Object.freeze({
    authorizationUrl: url.toString(),
    session: Object.freeze({
      state,
      codeVerifier,
      expiresAtEpochSeconds: nowEpochSeconds + OAUTH_SESSION_SECONDS,
    }),
  });
}

export function verifyYandexMetrikaOAuthCallback(
  query: unknown,
  session: YandexMetrikaOAuthSession,
  nowEpochSeconds: number,
  consumed: boolean,
): OAuthCallbackResult {
  const denied: OAuthCallbackResult = Object.freeze({
    ok: false,
    code: "OAUTH_CALLBACK_DENIED",
  });
  if (
    typeof query !== "object" ||
    query === null ||
    Array.isArray(query) ||
    Reflect.ownKeys(query).length !== 2 ||
    typeof session !== "object" ||
    session === null ||
    consumed ||
    !validEpochSeconds(nowEpochSeconds) ||
    !validEpochSeconds(session.expiresAtEpochSeconds) ||
    nowEpochSeconds >= session.expiresAtEpochSeconds ||
    typeof session.state !== "string" ||
    !BASE64URL_256_PATTERN.test(session.state)
  ) {
    return denied;
  }
  const candidate = query as Record<string, unknown>;
  if (
    typeof candidate.code !== "string" ||
    candidate.code.length === 0 ||
    candidate.code.length > 2_048 ||
    /[\u0000-\u001f\u007f]/u.test(candidate.code) ||
    typeof candidate.state !== "string" ||
    !BASE64URL_256_PATTERN.test(candidate.state)
  ) {
    return denied;
  }
  const expected = Buffer.from(session.state, "ascii");
  const actual = Buffer.from(candidate.state, "ascii");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return denied;
  }
  return Object.freeze({ ok: true, code: candidate.code });
}
