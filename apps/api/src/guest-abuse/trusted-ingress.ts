import {
  networkCidrContains,
  parseNetworkAddress,
  parseNetworkCidr,
  type ParsedNetworkAddress,
} from "./network-address.js";

export const TRUSTED_INGRESS_POLICY_ID = "outscan-trusted-ingress-v1";

const REQUEST_KEYS = [
  "socket_remote_address",
  "x_forwarded_for",
  "trusted_proxy_cidrs",
] as const;
const MAX_FORWARDED_HOPS = 8;
const MAX_FORWARDED_LENGTH = 512;
const MAX_TRUSTED_PROXY_CIDRS = 64;

export type TrustedIngressAddressResult =
  | {
      ok: true;
      policy_id: typeof TRUSTED_INGRESS_POLICY_ID;
      trusted_ingress_address: string;
      source: "DIRECT_SOCKET" | "TRUSTED_PROXY_CHAIN";
    }
  | { ok: false; code: "INVALID_INGRESS_CONTEXT" };

function exactRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === REQUEST_KEYS.length &&
      keys.every(
        (key) =>
          typeof key === "string" && REQUEST_KEYS.some((item) => item === key),
      )
    );
  } catch {
    return false;
  }
}

function parseForwardedFor(value: unknown): ParsedNetworkAddress[] | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length > MAX_FORWARDED_LENGTH) return null;
  const parts = value.split(",");
  if (parts.length === 0 || parts.length > MAX_FORWARDED_HOPS) return null;
  const addresses: ParsedNetworkAddress[] = [];
  for (const part of parts) {
    const address = parseNetworkAddress(part.trim());
    if (!address) return null;
    addresses.push(address);
  }
  return addresses;
}

export function resolveTrustedIngressAddress(
  value: unknown,
): TrustedIngressAddressResult {
  if (!exactRecord(value))
    return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
  try {
    const peer = parseNetworkAddress(value.socket_remote_address);
    const cidrValues = value.trusted_proxy_cidrs;
    if (
      !peer ||
      !Array.isArray(cidrValues) ||
      cidrValues.length > MAX_TRUSTED_PROXY_CIDRS
    )
      return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
    const trustedCidrs = cidrValues.map(parseNetworkCidr);
    if (trustedCidrs.some((cidr) => cidr === null))
      return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
    const trusted = (address: ParsedNetworkAddress) =>
      trustedCidrs.some(
        (cidr) => cidr !== null && networkCidrContains(cidr, address),
      );
    if (!trusted(peer)) {
      return Object.freeze({
        ok: true,
        policy_id: TRUSTED_INGRESS_POLICY_ID,
        trusted_ingress_address: peer.canonical_address,
        source: "DIRECT_SOCKET",
      });
    }
    const chain = parseForwardedFor(value.x_forwarded_for);
    if (!chain) return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
    let selected = peer;
    for (
      let index = chain.length - 1;
      index >= 0 && trusted(selected);
      index -= 1
    ) {
      const candidate = chain[index];
      if (!candidate) return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
      selected = candidate;
    }
    if (trusted(selected))
      return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
    return Object.freeze({
      ok: true,
      policy_id: TRUSTED_INGRESS_POLICY_ID,
      trusted_ingress_address: selected.canonical_address,
      source: "TRUSTED_PROXY_CHAIN",
    });
  } catch {
    return { ok: false, code: "INVALID_INGRESS_CONTEXT" };
  }
}
