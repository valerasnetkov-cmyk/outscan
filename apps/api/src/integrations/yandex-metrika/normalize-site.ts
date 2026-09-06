import { parse as parseDomain } from "tldts";
import { canonicalizeHostname } from "../../target/index.js";

const MAX_SOURCE_LENGTH = 2_048;

export type MetrikaSiteRejectionCode =
  | "INVALID_TYPE"
  | "EMPTY_SITE"
  | "SITE_TOO_LONG"
  | "INVALID_URL"
  | "UNSUPPORTED_SCHEME"
  | "CREDENTIALS_NOT_ALLOWED"
  | "INVALID_HOSTNAME"
  | "NON_PUBLIC_SUFFIX";

export type NormalizedMetrikaSite =
  | { ok: true; canonicalHostname: string }
  | { ok: false; code: MetrikaSiteRejectionCode };

function rejected(code: MetrikaSiteRejectionCode): NormalizedMetrikaSite {
  return Object.freeze({ ok: false, code });
}

export function normalizeMetrikaSite(input: unknown): NormalizedMetrikaSite {
  if (typeof input !== "string") return rejected("INVALID_TYPE");
  if (input.length > MAX_SOURCE_LENGTH) return rejected("SITE_TOO_LONG");
  const source = input.trim();
  if (source.length === 0) return rejected("EMPTY_SITE");
  if (source.length > MAX_SOURCE_LENGTH) return rejected("SITE_TOO_LONG");
  if (source.includes("\\")) return rejected("INVALID_URL");

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//iu.test(source);
  if (hasScheme && !/^https?:\/\//iu.test(source)) {
    return rejected("UNSUPPORTED_SCHEME");
  }

  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? source : `https://${source}`);
  } catch {
    return rejected("INVALID_URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return rejected("UNSUPPORTED_SCHEME");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    return rejected("CREDENTIALS_NOT_ALLOWED");
  }

  const hostname = canonicalizeHostname(parsed.hostname);
  if (!hostname.ok) return rejected("INVALID_HOSTNAME");

  const suffix = parseDomain(hostname.canonical_host, {
    allowPrivateDomains: false,
    detectSpecialUse: true,
    extractHostname: false,
  });
  if (
    suffix.domain === null ||
    suffix.isIcann !== true ||
    suffix.isIp === true ||
    suffix.isSpecialUse === true
  ) {
    return rejected("NON_PUBLIC_SUFFIX");
  }

  return Object.freeze({
    ok: true,
    canonicalHostname: hostname.canonical_host,
  });
}
