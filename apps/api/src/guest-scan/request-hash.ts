import { createHash } from "node:crypto";

import { ascii, lengthPrefix } from "../guest-crypto/index.js";
import { canonicalizeHostname } from "../target/index.js";

const DOMAIN = ascii("OUTSCAN:GUEST_SCAN_REQUEST:v1\0");

export function deriveGuestScanRequestHash(
  canonicalHost: unknown,
): string | null {
  const canonical = canonicalizeHostname(canonicalHost);
  if (
    !canonical.ok ||
    canonical.canonical_host !== canonicalHost ||
    typeof canonicalHost !== "string"
  ) {
    return null;
  }
  const encoded = Buffer.from(canonicalHost, "ascii");
  const digest = createHash("sha256")
    .update(DOMAIN)
    .update(lengthPrefix(encoded))
    .digest("hex");
  return `sha256:${digest}`;
}
