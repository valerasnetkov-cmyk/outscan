import { describe, expect, it } from "vitest";

import { normalizeMetrikaSite } from "../src/integrations/yandex-metrika/index.js";

describe("Yandex Metrika site normalization", () => {
  it.each([
    ["HTTPS://EXAMPLE.RU/catalog?from=metrika#top", "example.ru"],
    ["пример.рф", "xn--e1afmkfd.xn--p1ai"],
    ["www.example.ru:443/path", "www.example.ru"],
    ["example.ru.", "example.ru"],
  ])("normalizes %s", (source, canonicalHostname) => {
    expect(normalizeMetrikaSite(source)).toEqual({
      ok: true,
      canonicalHostname,
    });
  });

  it("keeps the registrable domain and its subdomain distinct", () => {
    expect(normalizeMetrikaSite("example.ru")).not.toEqual(
      normalizeMetrikaSite("www.example.ru"),
    );
  });

  it.each([
    [undefined, "INVALID_TYPE"],
    ["", "EMPTY_SITE"],
    ["ftp://example.ru", "UNSUPPORTED_SCHEME"],
    ["https://user:password@example.ru", "CREDENTIALS_NOT_ALLOWED"],
    ["https://127.0.0.1/path", "INVALID_HOSTNAME"],
    ["internal", "NON_PUBLIC_SUFFIX"],
    ["test.invalid", "NON_PUBLIC_SUFFIX"],
    ["example.ru\\path", "INVALID_URL"],
    ["x".repeat(2_049), "SITE_TOO_LONG"],
  ])("rejects unsafe value with %s", (source, code) => {
    expect(normalizeMetrikaSite(source)).toEqual({ ok: false, code });
  });
});
