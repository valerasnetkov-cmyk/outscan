import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const GUEST_NETWORK_SIGNAL_POLICY_ID = "outscan-guest-network-signal-v1";

const DOMAIN = Buffer.from("OUTSCAN:GUEST_ABUSE_NETWORK_SIGNAL:v1\0", "ascii");
const REQUEST_KEYS = ["trusted_ingress_address", "hmac_key"] as const;
const IPV4_PREFIX = 32;
const IPV6_PREFIX = 64;

export type GuestNetworkSignalResult =
  | {
      ok: true;
      policy_id: typeof GUEST_NETWORK_SIGNAL_POLICY_ID;
      network_signal_digest: string;
    }
  | { ok: false; code: "INVALID_NETWORK_SIGNAL_CONTEXT" };

function exactRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
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

function parseIpv4(address: string): Buffer | null {
  if (isIP(address) !== 4) return null;
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return Buffer.from(octets);
}

function parseIpv6(address: string): Buffer | null {
  if (address.includes("%") || isIP(address) !== 6) return null;
  let input = address.toLowerCase();
  if (input.includes(".")) {
    const separator = input.lastIndexOf(":");
    const ipv4 = parseIpv4(input.slice(separator + 1));
    if (!ipv4) return null;
    const high = ipv4.readUInt16BE(0).toString(16);
    const low = ipv4.readUInt16BE(2).toString(16);
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
  ) {
    return null;
  }

  const bytes = Buffer.alloc(16);
  textGroups.forEach((group, index) => {
    bytes.writeUInt16BE(Number.parseInt(group, 16), index * 2);
  });
  return bytes;
}

function bucketAddress(
  address: string,
): { family: 4 | 6; bytes: Buffer } | null {
  const ipv4 = parseIpv4(address);
  if (ipv4) return { family: 4, bytes: ipv4 };
  const ipv6 = parseIpv6(address);
  if (!ipv6) return null;

  const mappedPrefix = Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]);
  if (ipv6.subarray(0, 12).equals(mappedPrefix)) {
    return { family: 4, bytes: Buffer.from(ipv6.subarray(12)) };
  }
  const bucket = Buffer.alloc(16);
  ipv6.copy(bucket, 0, 0, IPV6_PREFIX / 8);
  return { family: 6, bytes: bucket };
}

export function deriveGuestNetworkSignal(
  value: unknown,
): GuestNetworkSignalResult {
  if (!exactRecord(value)) {
    return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
  }
  try {
    const address = value.trusted_ingress_address;
    const keyValue = value.hmac_key;
    if (
      typeof address !== "string" ||
      address.length === 0 ||
      address.length > 64 ||
      !(keyValue instanceof Uint8Array)
    ) {
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    }
    const key = Buffer.from(keyValue);
    if (key.length !== 32) {
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    }
    const bucket = bucketAddress(address);
    if (!bucket) {
      return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
    }
    const prefix = bucket.family === 4 ? IPV4_PREFIX : IPV6_PREFIX;
    const message = Buffer.concat([
      DOMAIN,
      Buffer.from([bucket.family, prefix]),
      bucket.bytes,
    ]);
    const digest = createHmac("sha256", key).update(message).digest("hex");
    return Object.freeze({
      ok: true,
      policy_id: GUEST_NETWORK_SIGNAL_POLICY_ID,
      network_signal_digest: `hmac-sha256:${digest}`,
    });
  } catch {
    return { ok: false, code: "INVALID_NETWORK_SIGNAL_CONTEXT" };
  }
}
