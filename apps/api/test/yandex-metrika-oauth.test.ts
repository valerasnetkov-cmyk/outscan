import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createYandexMetrikaAuthorizationRequest,
  verifyYandexMetrikaOAuthCallback,
  YANDEX_METRIKA_CALLBACK_URL,
} from "../src/integrations/yandex-metrika/index.js";

describe("Yandex Metrika OAuth contract", () => {
  it("creates a least-privilege PKCE authorization request", () => {
    const values = [new Uint8Array(32).fill(1), new Uint8Array(32).fill(2)];
    const request = createYandexMetrikaAuthorizationRequest(
      "outscan_client",
      1_000,
      () => values.shift() ?? new Uint8Array(),
    );
    const url = new URL(request.authorizationUrl);
    const expectedChallenge = createHash("sha256")
      .update(request.session.codeVerifier, "ascii")
      .digest("base64url");

    expect(url.origin + url.pathname).toBe("https://oauth.yandex.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("metrika:read");
    expect(url.searchParams.get("scope")).not.toContain("metrika:write");
    expect(url.searchParams.get("redirect_uri")).toBe(
      YANDEX_METRIKA_CALLBACK_URL,
    );
    expect(url.searchParams.get("state")).toBe(request.session.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(expectedChallenge);
    expect(request.session.state).toHaveLength(43);
    expect(request.session.codeVerifier).toHaveLength(43);
    expect(request.session.expiresAtEpochSeconds).toBe(1_600);
  });

  it("accepts one exact, unexpired callback", () => {
    const request = createYandexMetrikaAuthorizationRequest(
      "outscan_client",
      1_000,
    );
    expect(
      verifyYandexMetrikaOAuthCallback(
        { code: "authorization-code", state: request.session.state },
        request.session,
        1_599,
        false,
      ),
    ).toEqual({ ok: true, code: "authorization-code" });
  });

  it.each([
    ["tampered", 1_599, false],
    ["valid", 1_600, false],
    ["valid", 1_599, true],
  ])(
    "denies tampered, expired or consumed state %#",
    (state, now, consumed) => {
      const request = createYandexMetrikaAuthorizationRequest(
        "outscan_client",
        1_000,
      );
      expect(
        verifyYandexMetrikaOAuthCallback(
          {
            code: "authorization-code",
            state: state === "valid" ? request.session.state : state,
          },
          request.session,
          now,
          consumed,
        ),
      ).toEqual({ ok: false, code: "OAUTH_CALLBACK_DENIED" });
    },
  );

  it("denies ambiguous callback fields", () => {
    const request = createYandexMetrikaAuthorizationRequest(
      "outscan_client",
      1_000,
    );
    expect(
      verifyYandexMetrikaOAuthCallback(
        { code: "code", state: request.session.state, extra: "field" },
        request.session,
        1_001,
        false,
      ),
    ).toEqual({ ok: false, code: "OAUTH_CALLBACK_DENIED" });
  });
});
