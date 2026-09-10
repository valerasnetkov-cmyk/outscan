import { isIP } from "node:net";

export interface ParsedNetworkAddress {
  canonical_address: string;
  family: 4 | 6;
  bits: 32 | 128;
  bytes: Buffer;
  value: bigint;
}

export interface ParsedNetworkCidr {
  family: 4 | 6;
  network: bigint;
  prefix: number;
}

function parseIpv4(address: string): ParsedNetworkAddress | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  if (octets.length !== 4) return null;
  const bytes = Buffer.from(octets);
  const value = octets.reduce(
    (current, octet) => (current << 8n) | BigInt(octet),
    0n,
  );
  return {
    canonical_address: octets.join("."),
    family: 4,
    bits: 32,
    bytes,
    value,
  };
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

function parseIpv6(address: string): ParsedNetworkAddress | null {
  if (address.includes("%") || isIP(address) !== 6) return null;
  let input = address.toLowerCase();
  if (input.includes(".")) {
    const separator = input.lastIndexOf(":");
    const ipv4 = parseIpv4(input.slice(separator + 1));
    if (!ipv4) return null;
    const high = Number((ipv4.value >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4.value & 0xffffn).toString(16);
    input = `${input.slice(0, separator)}:${high}:${low}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const textGroups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  if (
    textGroups.length !== 8 ||
    textGroups.some((group) => !/^[0-9a-f]{1,4}$/u.test(group))
  )
    return null;
  const groups = textGroups.map((group) => Number.parseInt(group, 16));
  const bytes = Buffer.alloc(16);
  groups.forEach((group, index) => bytes.writeUInt16BE(group, index * 2));
  const mapped = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]);
  if (bytes.subarray(0, 12).equals(mapped)) {
    return parseIpv4([...bytes.subarray(12)].join("."));
  }
  const value = groups.reduce(
    (current, group) => (current << 16n) | BigInt(group),
    0n,
  );
  return {
    canonical_address: formatIpv6(groups),
    family: 6,
    bits: 128,
    bytes,
    value,
  };
}

export function parseNetworkAddress(
  address: unknown,
): ParsedNetworkAddress | null {
  if (
    typeof address !== "string" ||
    address.length === 0 ||
    address.length > 64
  )
    return null;
  return parseIpv4(address) ?? parseIpv6(address);
}

export function parseNetworkCidr(value: unknown): ParsedNetworkCidr | null {
  if (typeof value !== "string" || value.length > 80) return null;
  const parts = value.split("/");
  if (parts.length !== 2) return null;
  const address = parseNetworkAddress(parts[0]);
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

export function networkCidrContains(
  range: ParsedNetworkCidr,
  address: ParsedNetworkAddress,
): boolean {
  if (range.family !== address.family) return false;
  const hostBits = BigInt(address.bits - range.prefix);
  return (address.value >> hostBits) << hostBits === range.network;
}
