import type { PinnedTransportResponse } from "../target/index.js";

const SECURITY_TXT_PATH = "/.well-known/security.txt";
const MAX_SECURITY_TXT_BYTES = 32 * 1_024;
const MAX_SECURITY_TXT_LINES = 1_000;
const MAX_SECURITY_TXT_LINE_BYTES = 2_048;
const FIELD_NAME = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$/u;
const UTC_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/u;

function singleHeader(
  response: PinnedTransportResponse,
  name: string,
): string | null {
  const matches = response.headers.filter((header) => header.name === name);
  return matches.length === 1 ? matches[0]!.value.trim() : null;
}

function validContentType(value: string | null): boolean {
  if (!value) return false;
  const parts = value.split(";").map((part) => part.trim().toLowerCase());
  if (parts.shift() !== "text/plain") return false;
  const charsets = parts
    .map((part) => /^charset=(?:utf-8|"utf-8")$/u.test(part))
    .filter(Boolean);
  return parts.length === 1 && charsets.length === 1;
}

function validContact(value: string): boolean {
  if (value.length === 0 || value.length > MAX_SECURITY_TXT_LINE_BYTES) {
    return false;
  }
  try {
    const uri = new URL(value);
    if (!new Set(["https:", "mailto:", "tel:"]).has(uri.protocol)) {
      return false;
    }
    return (
      uri.protocol !== "https:" ||
      (!uri.username && !uri.password && uri.hostname.length > 0)
    );
  } catch {
    return false;
  }
}

function validExpires(value: string, nowUnixMs: number): boolean {
  const match = UTC_DATE_TIME.exec(value);
  if (!match) return false;
  const timestamp = Date.parse(value);
  if (!Number.isSafeInteger(timestamp) || timestamp <= nowUnixMs) return false;
  const parsed = new Date(timestamp);
  return (
    parsed.getUTCFullYear() === Number(match[1]) &&
    parsed.getUTCMonth() + 1 === Number(match[2]) &&
    parsed.getUTCDate() === Number(match[3]) &&
    parsed.getUTCHours() === Number(match[4]) &&
    parsed.getUTCMinutes() === Number(match[5]) &&
    parsed.getUTCSeconds() === Number(match[6])
  );
}

function canonicalMatch(value: string, canonicalHost: string): boolean | null {
  try {
    const uri = new URL(value);
    if (
      uri.protocol !== "https:" ||
      uri.username !== "" ||
      uri.password !== "" ||
      uri.hostname.length === 0
    ) {
      return null;
    }
    return (
      uri.hostname === canonicalHost &&
      uri.port === "" &&
      uri.pathname === SECURITY_TXT_PATH &&
      uri.search === "" &&
      uri.hash === ""
    );
  } catch {
    return null;
  }
}

function parseBody(
  body: Buffer,
  canonicalHost: string,
  nowUnixMs: number,
): boolean {
  if (body.byteLength === 0 || body.byteLength > MAX_SECURITY_TXT_BYTES) {
    return false;
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      body,
    );
  } catch {
    return false;
  }
  if (
    text.charCodeAt(0) === 0xfeff ||
    !text.endsWith("\n") ||
    /\r(?!\n)/u.test(text) ||
    /[\0\v\f\u007f]/u.test(text)
  ) {
    return false;
  }
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  lines.pop();
  if (lines.length === 0 || lines.length > MAX_SECURITY_TXT_LINES) return false;

  let contacts = 0;
  let expires = 0;
  let canonicalSeen = false;
  for (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > MAX_SECURITY_TXT_LINE_BYTES) {
      return false;
    }
    if (line.trim().length === 0 || line.startsWith("#")) continue;
    const separator = line.indexOf(": ");
    if (separator < 1) return false;
    const name = line.slice(0, separator);
    const value = line.slice(separator + 2);
    if (!FIELD_NAME.test(name) || value.length === 0) return false;
    switch (name.toLowerCase()) {
      case "contact":
        if (!validContact(value)) return false;
        contacts += 1;
        break;
      case "expires":
        expires += 1;
        if (expires > 1 || !validExpires(value, nowUnixMs)) return false;
        break;
      case "canonical": {
        const match = canonicalMatch(value, canonicalHost);
        if (match === null) return false;
        if (match) canonicalSeen = true;
        break;
      }
    }
  }
  const hasCanonical = lines.some((line) => /^Canonical: /iu.test(line));
  return contacts > 0 && expires === 1 && (!hasCanonical || canonicalSeen);
}

export function inspectGuestSecurityTxt(
  response: PinnedTransportResponse,
  canonicalHost: string,
  nowUnixMs: number,
): "PASS" | "ATTENTION" {
  try {
    return response.status_code === 200 &&
      validContentType(singleHeader(response, "content-type")) &&
      parseBody(response.body, canonicalHost, nowUnixMs)
      ? "PASS"
      : "ATTENTION";
  } catch {
    return "ATTENTION";
  }
}

export const GUEST_SECURITY_TXT_PATH = SECURITY_TXT_PATH;
export const GUEST_SECURITY_TXT_MAX_BYTES = MAX_SECURITY_TXT_BYTES;
