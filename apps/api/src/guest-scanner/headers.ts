import type { SafeResponseHeader } from "../target/index.js";

export const GUEST_HTTP_HEADER_CHECKS = Object.freeze([
  "HTTP_HSTS",
  "HTTP_CSP",
  "HTTP_X_CONTENT_TYPE_OPTIONS",
  "HTTP_FRAME_PROTECTION",
  "HTTP_REFERRER_POLICY",
  "HTTP_PERMISSIONS_POLICY",
] as const);

export type GuestHttpHeaderCheck = (typeof GUEST_HTTP_HEADER_CHECKS)[number];

const SAFE_REFERRER_POLICIES = new Set([
  "no-referrer",
  "origin",
  "origin-when-cross-origin",
  "same-origin",
  "strict-origin",
  "strict-origin-when-cross-origin",
]);
const ENFORCING_CSP_DIRECTIVES = new Set([
  "base-uri",
  "child-src",
  "connect-src",
  "default-src",
  "font-src",
  "form-action",
  "frame-ancestors",
  "frame-src",
  "img-src",
  "manifest-src",
  "media-src",
  "object-src",
  "sandbox",
  "script-src",
  "script-src-attr",
  "script-src-elem",
  "style-src",
  "style-src-attr",
  "style-src-elem",
  "upgrade-insecure-requests",
  "worker-src",
]);

function single(
  headers: readonly SafeResponseHeader[],
  name: string,
): string | null {
  const matches = headers.filter((header) => header.name === name);
  return matches.length === 1 && matches[0]!.value.trim().length > 0
    ? matches[0]!.value.trim()
    : null;
}

function validHsts(value: string | null): boolean {
  if (!value) return false;
  const seen = new Set<string>();
  let maxAge: number | null = null;
  for (const raw of value.split(";")) {
    const directive = raw.trim();
    if (!directive) continue;
    const separator = directive.indexOf("=");
    const name = (separator < 0 ? directive : directive.slice(0, separator))
      .trim()
      .toLowerCase();
    if (!/^[a-z][a-z-]*$/u.test(name) || seen.has(name)) return false;
    seen.add(name);
    if (name === "max-age") {
      const rawSeconds = directive.slice(separator + 1).trim();
      const quoted = /^"([0-9]+)"$/u.exec(rawSeconds);
      const seconds = quoted?.[1] ?? rawSeconds;
      if (separator < 0 || !/^(0|[1-9][0-9]*)$/u.test(seconds)) return false;
      maxAge = Number(seconds);
      if (!Number.isSafeInteger(maxAge)) return false;
    }
  }
  return maxAge !== null && maxAge > 0;
}

function cspDirectives(value: string | null): ReadonlySet<string> | null {
  if (!value) return null;
  const names = new Set<string>();
  for (const raw of value.split(";")) {
    const directive = raw.trim();
    if (!directive) continue;
    const [name] = directive.split(/\s+/u);
    const normalized = name?.toLowerCase();
    if (!normalized || !/^[a-z][a-z0-9-]*$/u.test(normalized)) return null;
    if (names.has(normalized)) return null;
    names.add(normalized);
  }
  return names.size > 0 ? names : null;
}

function validPermissionsPolicy(value: string | null): boolean {
  if (!value) return false;
  const seen = new Set<string>();
  const directives = value.split(",");
  if (directives.length === 0 || directives.length > 64) return false;
  for (const raw of directives) {
    const match = /^\s*([a-z][a-z0-9-]*)=\(([^()]*)\)\s*$/iu.exec(raw);
    const feature = match?.[1]?.toLowerCase();
    if (!feature || seen.has(feature) || match?.[2]?.includes("*"))
      return false;
    seen.add(feature);
  }
  return true;
}

export function inspectGuestSecurityHeaders(
  headers: readonly SafeResponseHeader[],
): readonly Readonly<{
  check_id: GuestHttpHeaderCheck;
  outcome: "PASS" | "ATTENTION";
}>[] {
  const csp = cspDirectives(single(headers, "content-security-policy"));
  const xFrameOptions = single(headers, "x-frame-options")?.toLowerCase();
  const referrer = single(headers, "referrer-policy")
    ?.split(",")
    .at(-1)
    ?.trim()
    .toLowerCase();
  const decisions: Record<GuestHttpHeaderCheck, boolean> = {
    HTTP_HSTS: validHsts(single(headers, "strict-transport-security")),
    HTTP_CSP:
      csp !== null &&
      [...csp].some((name) => ENFORCING_CSP_DIRECTIVES.has(name)),
    HTTP_X_CONTENT_TYPE_OPTIONS:
      single(headers, "x-content-type-options")?.toLowerCase() === "nosniff",
    HTTP_FRAME_PROTECTION:
      xFrameOptions === "deny" ||
      xFrameOptions === "sameorigin" ||
      csp?.has("frame-ancestors") === true,
    HTTP_REFERRER_POLICY: !!referrer && SAFE_REFERRER_POLICIES.has(referrer),
    HTTP_PERMISSIONS_POLICY: validPermissionsPolicy(
      single(headers, "permissions-policy"),
    ),
  };
  return Object.freeze(
    GUEST_HTTP_HEADER_CHECKS.map((check_id) =>
      Object.freeze({
        check_id,
        outcome: decisions[check_id] ? "PASS" : "ATTENTION",
      }),
    ),
  );
}
