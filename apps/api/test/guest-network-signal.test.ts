import { describe, expect, it } from "vitest";

import {
  deriveGuestNetworkSignal,
  GUEST_NETWORK_SIGNAL_POLICY_ID,
} from "../src/guest-abuse/index.js";

const KEY = Buffer.from(
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  "hex",
);

function derive(address: string, key: Uint8Array = KEY) {
  return deriveGuestNetworkSignal({
    trusted_ingress_address: address,
    hmac_key: key,
  });
}

describe("trusted ingress Guest network signal", () => {
  it("derives a versioned pseudonymous IPv4 signal without returning the IP", () => {
    const result = derive("203.0.113.9");
    expect(result).toEqual({
      ok: true,
      policy_id: GUEST_NETWORK_SIGNAL_POLICY_ID,
      network_signal_digest:
        "hmac-sha256:6c59ebcbdf39dda58551f034354df59559c152c6ead91a285d231f42011baff4",
    });
    expect(JSON.stringify(result)).not.toContain("203.0.113.9");
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("normalizes IPv4-mapped IPv6 to the same IPv4 identity", () => {
    expect(derive("::ffff:203.0.113.9")).toEqual(derive("203.0.113.9"));
  });

  it("uses a canonical IPv6 /64 bucket", () => {
    expect(derive("2001:db8:abcd:12::1")).toEqual(
      derive("2001:0db8:abcd:0012:ffff::99"),
    );
    expect(derive("2001:db8:abcd:13::1")).not.toEqual(
      derive("2001:db8:abcd:12::1"),
    );
  });

  it("separates HMAC keys", () => {
    expect(derive("203.0.113.9", Buffer.alloc(32, 0xaa))).not.toEqual(
      derive("203.0.113.9", Buffer.alloc(32, 0xbb)),
    );
  });

  it.each([
    {
      trusted_ingress_address: "203.0.113.9",
      hmac_key: KEY,
      x_forwarded_for: "198.51.100.1",
    },
    { trusted_ingress_address: "203.0.113.9:443", hmac_key: KEY },
    { trusted_ingress_address: " 203.0.113.9", hmac_key: KEY },
    { trusted_ingress_address: "fe80::1%eth0", hmac_key: KEY },
    { trusted_ingress_address: "not-an-ip", hmac_key: KEY },
    { trusted_ingress_address: "203.0.113.9", hmac_key: Buffer.alloc(31) },
    { trusted_ingress_address: "203.0.113.9", hmac_key: "secret" },
  ])("rejects untrusted or malformed context %#", (value) => {
    expect(deriveGuestNetworkSignal(value)).toEqual({
      ok: false,
      code: "INVALID_NETWORK_SIGNAL_CONTEXT",
    });
  });

  it("contains hostile and changing request properties", () => {
    const hostile = { hmac_key: KEY } as Record<string, unknown>;
    Object.defineProperty(hostile, "trusted_ingress_address", {
      enumerable: true,
      get: () => {
        throw new Error("proxy detail");
      },
    });
    expect(deriveGuestNetworkSignal(hostile)).toEqual({
      ok: false,
      code: "INVALID_NETWORK_SIGNAL_CONTEXT",
    });

    const changing = { hmac_key: KEY } as Record<string, unknown>;
    let reads = 0;
    Object.defineProperty(changing, "trusted_ingress_address", {
      enumerable: true,
      get: () => (++reads === 1 ? "203.0.113.9" : "198.51.100.1"),
    });
    expect(deriveGuestNetworkSignal(changing)).toMatchObject({ ok: true });
    expect(reads).toBe(1);
  });
});
