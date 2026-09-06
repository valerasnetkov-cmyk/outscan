import { describe, expect, it } from "vitest";

import { canonicalizeHostname } from "../src/target/index.js";

describe("hostname canonicalization", () => {
  it.each([
    ["Example.COM", "example.com"],
    ["  Example.COM.  ", "example.com"],
    ["example.com", "example.com"],
    ["BÜCHER.example", "xn--bcher-kva.example"],
    ["пример.рф", "xn--e1afmkfd.xn--p1ai"],
    ["XN--BCHER-KVA.EXAMPLE", "xn--bcher-kva.example"],
    ["internal", "internal"],
  ])("canonicalizes %s", (input, expected) => {
    expect(canonicalizeHostname(input)).toEqual({
      ok: true,
      canonical_host: expected,
    });
  });

  it.each([
    [undefined, "INVALID_TYPE"],
    [null, "INVALID_TYPE"],
    [123, "INVALID_TYPE"],
    ["", "EMPTY_TARGET"],
    ["   ", "EMPTY_TARGET"],
    ["https://example.com", "URL_NOT_ALLOWED"],
    ["ftp://example.com", "URL_NOT_ALLOWED"],
    ["user@example.com", "USERINFO_NOT_ALLOWED"],
    ["example.com/path", "PATH_NOT_ALLOWED"],
    ["example.com?query", "PATH_NOT_ALLOWED"],
    ["example.com#fragment", "PATH_NOT_ALLOWED"],
    ["example.com\\path", "PATH_NOT_ALLOWED"],
    ["example.com:443", "PORT_NOT_ALLOWED"],
    ["127.0.0.1", "IP_LITERAL_NOT_ALLOWED"],
    ["127.0.0.1.", "IP_LITERAL_NOT_ALLOWED"],
    ["2130706433", "IP_LITERAL_NOT_ALLOWED"],
    ["0177.0.0.1", "IP_LITERAL_NOT_ALLOWED"],
    ["0x7f000001", "IP_LITERAL_NOT_ALLOWED"],
    ["::1", "IP_LITERAL_NOT_ALLOWED"],
    ["[::1]", "IP_LITERAL_NOT_ALLOWED"],
    ["a..example", "INVALID_HOSTNAME"],
    [".example.com", "INVALID_HOSTNAME"],
    ["example.com..", "INVALID_HOSTNAME"],
    ["-example.com", "INVALID_HOSTNAME"],
    ["example-.com", "INVALID_HOSTNAME"],
    ["under_score.example", "INVALID_HOSTNAME"],
    ["example .com", "INVALID_HOSTNAME"],
    ["*.example.com", "INVALID_HOSTNAME"],
    [`${"a".repeat(64)}.example`, "INVALID_HOSTNAME"],
    [`${"a.".repeat(127)}a`, "INVALID_HOSTNAME"],
    ["\u200d.example", "INVALID_IDNA"],
  ])("rejects %s with %s", (input, code) => {
    expect(canonicalizeHostname(input)).toEqual({ ok: false, code });
  });

  it("accepts the DNS label and hostname length boundaries", () => {
    const label63 = "a".repeat(63);
    const hostname253 = [label63, label63, label63, "a".repeat(61)].join(".");

    expect(hostname253).toHaveLength(253);
    expect(canonicalizeHostname(hostname253)).toEqual({
      ok: true,
      canonical_host: hostname253,
    });
  });

  it("bounds work before IDNA conversion", () => {
    expect(canonicalizeHostname("a".repeat(1_025))).toEqual({
      ok: false,
      code: "TARGET_TOO_LONG",
    });
  });
});
