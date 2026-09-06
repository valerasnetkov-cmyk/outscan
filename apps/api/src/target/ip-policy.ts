import { isIP } from "node:net";

export const IP_DESTINATION_POLICY_VERSION =
  "iana-special-purpose-2025-10-09.v1";

const MAX_RESOLVED_ADDRESSES = 64;
const MAX_CONFIGURED_INTERNAL_RANGES = 128;

export type IpFamily = 4 | 6;

export type ForbiddenAddressReason =
  | "THIS_NETWORK"
  | "PRIVATE"
  | "SHARED"
  | "LOOPBACK"
  | "LINK_LOCAL"
  | "METADATA"
  | "SPECIAL_PURPOSE"
  | "DOCUMENTATION"
  | "BENCHMARK"
  | "MULTICAST"
  | "RESERVED"
  | "IPV4_MAPPED"
  | "TRANSLATION"
  | "UNIQUE_LOCAL"
  | "NON_GLOBAL_UNICAST"
  | "CONFIGURED_INTERNAL";

export interface ValidatedIpAddress {
  address: string;
  family: IpFamily;
}

export interface BlockedIpAddress extends ValidatedIpAddress {
  reason: ForbiddenAddressReason;
}

export type ResolvedAddressSetResult =
  | {
      ok: true;
      policy_version: string;
      addresses: readonly ValidatedIpAddress[];
    }
  | {
      ok: false;
      policy_version: string;
      code:
        | "INVALID_RESOLUTION"
        | "EMPTY_RESOLUTION"
        | "TOO_MANY_ADDRESSES"
        | "INVALID_ADDRESS"
        | "INVALID_INTERNAL_RANGE"
        | "FORBIDDEN_ADDRESS";
      blocked_addresses?: readonly BlockedIpAddress[];
    };

interface ParsedIp extends ValidatedIpAddress {
  bits: 32 | 128;
  value: bigint;
}

interface CidrRange {
  family: IpFamily;
  network: bigint;
  prefix: number;
}

interface BuiltInRange extends CidrRange {
  reason: ForbiddenAddressReason;
}

const BUILT_IN_CIDRS: ReadonlyArray<readonly [string, ForbiddenAddressReason]> =
  [
    ["0.0.0.0/8", "THIS_NETWORK"],
    ["10.0.0.0/8", "PRIVATE"],
    ["100.64.0.0/10", "SHARED"],
    ["127.0.0.0/8", "LOOPBACK"],
    ["168.63.129.16/32", "METADATA"],
    ["169.254.0.0/16", "LINK_LOCAL"],
    ["172.16.0.0/12", "PRIVATE"],
    ["192.0.0.0/24", "SPECIAL_PURPOSE"],
    ["192.0.2.0/24", "DOCUMENTATION"],
    ["192.31.196.0/24", "SPECIAL_PURPOSE"],
    ["192.52.193.0/24", "SPECIAL_PURPOSE"],
    ["192.88.99.0/24", "SPECIAL_PURPOSE"],
    ["192.168.0.0/16", "PRIVATE"],
    ["192.175.48.0/24", "SPECIAL_PURPOSE"],
    ["198.18.0.0/15", "BENCHMARK"],
    ["198.51.100.0/24", "DOCUMENTATION"],
    ["203.0.113.0/24", "DOCUMENTATION"],
    ["224.0.0.0/4", "MULTICAST"],
    ["240.0.0.0/4", "RESERVED"],
    ["::/128", "THIS_NETWORK"],
    ["::1/128", "LOOPBACK"],
    ["::ffff:0:0/96", "IPV4_MAPPED"],
    ["64:ff9b::/96", "TRANSLATION"],
    ["64:ff9b:1::/48", "TRANSLATION"],
    ["100::/64", "SPECIAL_PURPOSE"],
    ["100:0:0:1::/64", "SPECIAL_PURPOSE"],
    ["2001::/23", "SPECIAL_PURPOSE"],
    ["2001:db8::/32", "DOCUMENTATION"],
    ["2002::/16", "SPECIAL_PURPOSE"],
    ["2620:4f:8000::/48", "SPECIAL_PURPOSE"],
    ["3ffe::/16", "RESERVED"],
    ["3fff::/20", "DOCUMENTATION"],
    ["5f00::/16", "SPECIAL_PURPOSE"],
    ["fc00::/7", "UNIQUE_LOCAL"],
    ["fe80::/10", "LINK_LOCAL"],
    ["ff00::/8", "MULTICAST"],
  ];

function parseIpv4(address: string): ParsedIp | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  const value = octets.reduce(
    (current, octet) => (current << 8n) | BigInt(octet),
    0n,
  );
  return { address: octets.join("."), family: 4, bits: 32, value };
}

function formatIpv6(groups: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length;) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < groups.length && groups[end] === 0) end += 1;
    if (end - index > bestLength) {
      bestStart = index;
      bestLength = end - index;
    }
    index = end;
  }

  if (bestLength < 2)
    return groups.map((group) => group.toString(16)).join(":");
  const left = groups
    .slice(0, bestStart)
    .map((group) => group.toString(16))
    .join(":");
  const right = groups
    .slice(bestStart + bestLength)
    .map((group) => group.toString(16))
    .join(":");
  return `${left}::${right}`;
}

function parseIpv6(address: string): ParsedIp | null {
  if (address.includes("%") || isIP(address) !== 6) return null;
  let expandedInput = address.toLowerCase();
  if (expandedInput.includes(".")) {
    const separator = expandedInput.lastIndexOf(":");
    const ipv4 = parseIpv4(expandedInput.slice(separator + 1));
    if (!ipv4) return null;
    const high = Number((ipv4.value >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4.value & 0xffffn).toString(16);
    expandedInput = `${expandedInput.slice(0, separator)}:${high}:${low}`;
  }

  const halves = expandedInput.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ].map((group) => Number.parseInt(group, 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isFinite(group))) {
    return null;
  }

  const value = groups.reduce(
    (current, group) => (current << 16n) | BigInt(group),
    0n,
  );
  return { address: formatIpv6(groups), family: 6, bits: 128, value };
}

function parseIp(address: string): ParsedIp | null {
  if (address.length === 0 || address.length > 64) return null;
  return parseIpv4(address) ?? parseIpv6(address);
}

function parseCidr(value: string): CidrRange | null {
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const address = parseIp(parts[0] ?? "");
  const prefixText = parts[1] ?? "";
  if (!address || !/^(0|[1-9][0-9]{0,2})$/u.test(prefixText)) return null;
  const prefix = Number(prefixText);
  if (prefix > address.bits) return null;
  const hostBits = BigInt(address.bits - prefix);
  const network =
    hostBits === BigInt(address.bits)
      ? 0n
      : (address.value >> hostBits) << hostBits;
  return { family: address.family, network, prefix };
}

function contains(range: CidrRange, address: ParsedIp): boolean {
  if (range.family !== address.family) return false;
  const hostBits = BigInt(address.bits - range.prefix);
  return (address.value >> hostBits) << hostBits === range.network;
}

const BUILT_IN_RANGES: readonly BuiltInRange[] = BUILT_IN_CIDRS.map(
  ([cidr, reason]) => {
    const range = parseCidr(cidr);
    if (!range) throw new Error(`Invalid built-in IP range: ${cidr}`);
    return { ...range, reason };
  },
);

function blockReason(
  address: ParsedIp,
  configuredRanges: readonly CidrRange[],
): ForbiddenAddressReason | null {
  const builtIn = BUILT_IN_RANGES.find((range) => contains(range, address));
  if (builtIn) return builtIn.reason;
  if (configuredRanges.some((range) => contains(range, address))) {
    return "CONFIGURED_INTERNAL";
  }
  if (address.family === 6) {
    const globalUnicast = parseCidr("2000::/3");
    if (!globalUnicast || !contains(globalUnicast, address)) {
      return "NON_GLOBAL_UNICAST";
    }
  }
  return null;
}

export function classifyResolvedAddressSet(
  input: unknown,
  configuredInternalCidrs: unknown = [],
): ResolvedAddressSetResult {
  const base = { policy_version: IP_DESTINATION_POLICY_VERSION } as const;
  if (!Array.isArray(input))
    return { ...base, ok: false, code: "INVALID_RESOLUTION" };
  if (input.length === 0)
    return { ...base, ok: false, code: "EMPTY_RESOLUTION" };
  if (input.length > MAX_RESOLVED_ADDRESSES) {
    return { ...base, ok: false, code: "TOO_MANY_ADDRESSES" };
  }
  if (
    !Array.isArray(configuredInternalCidrs) ||
    configuredInternalCidrs.length > MAX_CONFIGURED_INTERNAL_RANGES
  ) {
    return { ...base, ok: false, code: "INVALID_INTERNAL_RANGE" };
  }

  const configuredRanges: CidrRange[] = [];
  for (let index = 0; index < configuredInternalCidrs.length; index += 1) {
    const value: unknown = configuredInternalCidrs[index];
    const range =
      typeof value === "string" && value.length <= 80 ? parseCidr(value) : null;
    if (!range) return { ...base, ok: false, code: "INVALID_INTERNAL_RANGE" };
    configuredRanges.push(range);
  }

  const parsed: ParsedIp[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const value: unknown = input[index];
    const address = typeof value === "string" ? parseIp(value) : null;
    if (!address) return { ...base, ok: false, code: "INVALID_ADDRESS" };
    parsed.push(address);
  }

  const unique = new Map<string, ParsedIp>();
  for (const address of parsed) {
    unique.set(`${address.family}:${address.value}`, address);
  }

  const blocked = [...unique.values()].flatMap((address) => {
    const reason = blockReason(address, configuredRanges);
    return reason
      ? [{ address: address.address, family: address.family, reason }]
      : [];
  });
  if (blocked.length > 0) {
    return {
      ...base,
      ok: false,
      code: "FORBIDDEN_ADDRESS",
      blocked_addresses: blocked,
    };
  }

  return {
    ...base,
    ok: true,
    addresses: [...unique.values()].map(({ address, family }) => ({
      address,
      family,
    })),
  };
}
