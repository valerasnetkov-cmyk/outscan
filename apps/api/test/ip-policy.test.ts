import { describe, expect, it } from "vitest";

import {
  classifyResolvedAddressSet,
  IP_DESTINATION_POLICY_VERSION,
  snapshotConfiguredInternalCidrs,
} from "../src/target/index.js";

describe("resolved address-set policy", () => {
  it("normalizes and deduplicates an entirely public A/AAAA set", () => {
    expect(
      classifyResolvedAddressSet([
        "8.8.8.8",
        "2001:4860:4860:0:0:0:0:8888",
        "2001:4860:4860::8888",
        "1.1.1.1",
      ]),
    ).toEqual({
      ok: true,
      policy_version: IP_DESTINATION_POLICY_VERSION,
      addresses: [
        { address: "8.8.8.8", family: 4 },
        { address: "2001:4860:4860::8888", family: 6 },
        { address: "1.1.1.1", family: 4 },
      ],
    });
  });

  it.each([
    ["0.1.2.3", "THIS_NETWORK"],
    ["10.0.0.1", "PRIVATE"],
    ["100.64.0.1", "SHARED"],
    ["127.0.0.1", "LOOPBACK"],
    ["168.63.129.16", "METADATA"],
    ["169.254.169.254", "LINK_LOCAL"],
    ["172.31.255.255", "PRIVATE"],
    ["192.0.0.9", "SPECIAL_PURPOSE"],
    ["192.0.2.1", "DOCUMENTATION"],
    ["192.31.196.1", "SPECIAL_PURPOSE"],
    ["192.52.193.1", "SPECIAL_PURPOSE"],
    ["192.88.99.1", "SPECIAL_PURPOSE"],
    ["192.168.1.1", "PRIVATE"],
    ["192.175.48.1", "SPECIAL_PURPOSE"],
    ["198.18.0.1", "BENCHMARK"],
    ["198.51.100.1", "DOCUMENTATION"],
    ["203.0.113.1", "DOCUMENTATION"],
    ["224.0.0.1", "MULTICAST"],
    ["255.255.255.255", "RESERVED"],
    ["::", "THIS_NETWORK"],
    ["::1", "LOOPBACK"],
    ["::ffff:8.8.8.8", "IPV4_MAPPED"],
    ["64:ff9b::808:808", "TRANSLATION"],
    ["64:ff9b:1::1", "TRANSLATION"],
    ["100::1", "SPECIAL_PURPOSE"],
    ["100:0:0:1::1", "SPECIAL_PURPOSE"],
    ["2001::1", "SPECIAL_PURPOSE"],
    ["2001:db8::1", "DOCUMENTATION"],
    ["2002::1", "SPECIAL_PURPOSE"],
    ["2620:4f:8000::1", "SPECIAL_PURPOSE"],
    ["3ffe::1", "RESERVED"],
    ["3fff::1", "DOCUMENTATION"],
    ["5f00::1", "SPECIAL_PURPOSE"],
    ["fc00::1", "UNIQUE_LOCAL"],
    ["fe80::1", "LINK_LOCAL"],
    ["ff02::1", "MULTICAST"],
    ["400::1", "NON_GLOBAL_UNICAST"],
  ])("blocks %s as %s", (address, reason) => {
    const canonicalAddress =
      address === "::ffff:8.8.8.8" ? "::ffff:808:808" : address;
    expect(classifyResolvedAddressSet([address])).toEqual({
      ok: false,
      policy_version: IP_DESTINATION_POLICY_VERSION,
      code: "FORBIDDEN_ADDRESS",
      blocked_addresses: [
        {
          address: canonicalAddress,
          family: address.includes(":") ? 6 : 4,
          reason,
        },
      ],
    });
  });

  it("fails the entire mixed set when one candidate is forbidden", () => {
    const result = classifyResolvedAddressSet([
      "8.8.8.8",
      "10.0.0.1",
      "2001:4860:4860::8888",
    ]);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      code: "FORBIDDEN_ADDRESS",
      blocked_addresses: [
        { address: "10.0.0.1", family: 4, reason: "PRIVATE" },
      ],
    });
  });

  it("adds configured internal ranges without allow overrides", () => {
    expect(
      classifyResolvedAddressSet(["8.8.8.8"], ["8.8.8.0/24"]),
    ).toMatchObject({
      ok: false,
      code: "FORBIDDEN_ADDRESS",
      blocked_addresses: [{ reason: "CONFIGURED_INTERNAL" }],
    });
    expect(
      classifyResolvedAddressSet(["10.0.0.1"], ["0.0.0.0/0"]),
    ).toMatchObject({
      blocked_addresses: [{ reason: "PRIVATE" }],
    });
  });

  it("snapshots a strict deployment-specific deny list", () => {
    const input = ["8.8.8.0/24", "2001:4860::/32"];
    const snapshot = snapshotConfiguredInternalCidrs(input);
    input[0] = "1.1.1.0/24";
    expect(snapshot).toEqual(["8.8.8.0/24", "2001:4860::/32"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    for (const invalid of [
      null,
      ["8.8.8.8"],
      ["8.8.8.0/24", "8.8.8.0/24"],
      new Array(1),
      Array(129).fill("10.0.0.0/8"),
      new Proxy([], {
        get: () => {
          throw new Error("hostile detail");
        },
      }),
    ]) {
      expect(snapshotConfiguredInternalCidrs(invalid)).toBeNull();
    }
  });

  it.each([null, {}, "8.8.8.8"])(
    "rejects a non-array resolution value",
    (input) => {
      expect(classifyResolvedAddressSet(input)).toMatchObject({
        ok: false,
        code: "INVALID_RESOLUTION",
      });
    },
  );

  it("rejects empty, oversized and malformed resolution sets", () => {
    expect(classifyResolvedAddressSet([])).toMatchObject({
      code: "EMPTY_RESOLUTION",
    });
    expect(classifyResolvedAddressSet(Array(65).fill("8.8.8.8"))).toMatchObject(
      {
        code: "TOO_MANY_ADDRESSES",
      },
    );
    for (const input of [
      ["example.com"],
      ["999.1.1.1"],
      ["fe80::1%eth0"],
      [8],
    ]) {
      expect(classifyResolvedAddressSet(input)).toMatchObject({
        code: "INVALID_ADDRESS",
      });
    }
  });

  it("fails closed for malformed or excessive configured ranges", () => {
    for (const range of ["8.8.8.8", "8.8.8.8/33", "2001:db8::/129", "bad/24"]) {
      expect(classifyResolvedAddressSet(["8.8.8.8"], [range])).toMatchObject({
        code: "INVALID_INTERNAL_RANGE",
      });
    }
    expect(
      classifyResolvedAddressSet(["8.8.8.8"], Array(129).fill("10.0.0.0/8")),
    ).toMatchObject({ code: "INVALID_INTERNAL_RANGE" });
    for (const ranges of [null, "10.0.0.0/8", [8], new Array(1)]) {
      expect(classifyResolvedAddressSet(["8.8.8.8"], ranges)).toMatchObject({
        code: "INVALID_INTERNAL_RANGE",
      });
    }
  });

  it("rejects sparse and oversized address entries without throwing", () => {
    expect(classifyResolvedAddressSet(new Array(1))).toMatchObject({
      code: "INVALID_ADDRESS",
    });
    expect(classifyResolvedAddressSet(["1".repeat(65)])).toMatchObject({
      code: "INVALID_ADDRESS",
    });
  });
});
