import { isIP } from "node:net";
import { domainToASCII } from "node:url";

const MAX_RAW_TARGET_LENGTH = 1_024;
const MAX_HOSTNAME_LENGTH = 253;
const MAX_LABEL_LENGTH = 63;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const IP_LITERALISH =
  /^(?:0x[0-9a-f]+|[0-9]+)(?:\.(?:0x[0-9a-f]+|[0-9]+)){0,3}$/iu;

export type HostnameRejectionCode =
  | "INVALID_TYPE"
  | "EMPTY_TARGET"
  | "TARGET_TOO_LONG"
  | "URL_NOT_ALLOWED"
  | "USERINFO_NOT_ALLOWED"
  | "PATH_NOT_ALLOWED"
  | "PORT_NOT_ALLOWED"
  | "IP_LITERAL_NOT_ALLOWED"
  | "INVALID_IDNA"
  | "INVALID_HOSTNAME";

export type CanonicalHostnameResult =
  | { ok: true; canonical_host: string }
  | { ok: false; code: HostnameRejectionCode };

function rejected(code: HostnameRejectionCode): CanonicalHostnameResult {
  return { ok: false, code };
}

function isIpLiteral(value: string): boolean {
  const withoutTrailingDot = value.endsWith(".") ? value.slice(0, -1) : value;
  if (isIP(withoutTrailingDot) !== 0) return true;

  if (value.startsWith("[") && value.endsWith("]")) {
    return isIP(value.slice(1, -1)) !== 0;
  }

  return IP_LITERALISH.test(withoutTrailingDot);
}

function hasValidDnsShape(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > MAX_HOSTNAME_LENGTH) {
    return false;
  }

  return hostname.split(".").every((label) => {
    return (
      label.length > 0 &&
      label.length <= MAX_LABEL_LENGTH &&
      HOST_LABEL.test(label)
    );
  });
}

export function canonicalizeHostname(input: unknown): CanonicalHostnameResult {
  if (typeof input !== "string") return rejected("INVALID_TYPE");
  if (input.length > MAX_RAW_TARGET_LENGTH) return rejected("TARGET_TOO_LONG");

  const target = input.trim();
  if (target.length === 0) return rejected("EMPTY_TARGET");
  if (target.length > MAX_RAW_TARGET_LENGTH) return rejected("TARGET_TOO_LONG");

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(target)) {
    return rejected("URL_NOT_ALLOWED");
  }
  if (target.includes("@")) return rejected("USERINFO_NOT_ALLOWED");
  if (/[/?#\\]/u.test(target)) return rejected("PATH_NOT_ALLOWED");
  if (/\s/u.test(target)) return rejected("INVALID_HOSTNAME");
  if (isIpLiteral(target)) return rejected("IP_LITERAL_NOT_ALLOWED");
  if (target.includes(":")) return rejected("PORT_NOT_ALLOWED");

  let asciiHostname: string;
  try {
    asciiHostname = domainToASCII(target).toLowerCase();
  } catch {
    return rejected("INVALID_IDNA");
  }

  if (asciiHostname.length === 0) return rejected("INVALID_IDNA");

  const canonicalHost = asciiHostname.endsWith(".")
    ? asciiHostname.slice(0, -1)
    : asciiHostname;

  if (isIpLiteral(canonicalHost)) return rejected("IP_LITERAL_NOT_ALLOWED");
  if (!hasValidDnsShape(canonicalHost)) {
    return rejected("INVALID_HOSTNAME");
  }

  return { ok: true, canonical_host: canonicalHost };
}
