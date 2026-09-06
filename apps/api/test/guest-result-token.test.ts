import { describe, expect, it } from "vitest";

import {
  deriveGuestResultToken,
  encodeGuestResultTokenMessage,
  verifyGuestResultToken,
  type GuestResultTokenMetadata,
} from "../src/guest-crypto/index.js";

const KEY = Buffer.alloc(32, 0x22);
const NONCE = Buffer.from(
  Array.from({ length: 32 }, (_, index) => 0x20 + index),
);

function metadata(): GuestResultTokenMetadata {
  return {
    guest_scan_id: "guest_scan_01",
    token_version: 3n,
    token_nonce: NONCE,
    key_version: 9,
    result_access_expires_at_unix_seconds: 1_800_000_000n,
    result_access_revoked_at_unix_seconds: null,
  };
}

describe("Guest result token crypto", () => {
  it("matches fixed canonical message and token vectors", () => {
    expect(encodeGuestResultTokenMessage(metadata()).toString("hex")).toBe(
      "4f55545343414e3a47554553545f524553554c545f544f4b454e3a7631000000000d67756573745f7363616e5f3031000000000000000300000020202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f000000006b49d200",
    );
    expect(deriveGuestResultToken(metadata(), KEY)).toBe(
      "r4hEp2CXZaZepxH_qaN8r-eixz43kz7DoInrxrP0c2k",
    );
  });

  it("is replay-stable for unchanged persisted metadata", () => {
    expect(deriveGuestResultToken(metadata(), KEY)).toBe(
      deriveGuestResultToken(metadata(), KEY),
    );
  });

  it("verifies before expiry using the persisted key version", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    expect(
      verifyGuestResultToken(
        token,
        metadata(),
        new Map([[9, KEY]]),
        1_799_999_999n,
      ),
    ).toBe(true);
  });

  it("fails closed at expiry or after explicit revocation", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    expect(
      verifyGuestResultToken(
        token,
        metadata(),
        new Map([[9, KEY]]),
        1_800_000_000n,
      ),
    ).toBe(false);
    expect(
      verifyGuestResultToken(
        token,
        {
          ...metadata(),
          result_access_revoked_at_unix_seconds: 1_700_000_000n,
        },
        new Map([[9, KEY]]),
        1_700_000_001n,
      ),
    ).toBe(false);
  });

  it("supports normal key rotation and fails closed after key invalidation", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    const rotatedKeyring = new Map([
      [9, KEY],
      [10, Buffer.alloc(32, 0x33)],
    ]);

    expect(
      verifyGuestResultToken(token, metadata(), rotatedKeyring, 1_700_000_000n),
    ).toBe(true);
    expect(
      verifyGuestResultToken(
        token,
        metadata(),
        new Map([[10, Buffer.alloc(32, 0x33)]]),
        1_700_000_000n,
      ),
    ).toBe(false);
  });

  it.each([
    ["guest_scan_id", "guest_scan_02"],
    ["token_version", 4n],
    ["result_access_expires_at_unix_seconds", 1_800_000_001n],
  ])("binds the token to %s", (field, value) => {
    const token = deriveGuestResultToken(metadata(), KEY);
    const changed = { ...metadata(), [field]: value };

    expect(
      verifyGuestResultToken(
        token,
        changed,
        new Map([[9, KEY]]),
        1_700_000_000n,
      ),
    ).toBe(false);
  });

  it("binds the token to the exact nonce without concatenation ambiguity", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    const changed = metadata();
    changed.token_nonce = Buffer.from(changed.token_nonce);
    changed.token_nonce[31] = (changed.token_nonce[31] ?? 0) ^ 1;

    expect(
      verifyGuestResultToken(
        token,
        changed,
        new Map([[9, KEY]]),
        1_700_000_000n,
      ),
    ).toBe(false);
  });

  it("rejects malformed, padded and wrong-length tokens", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    const keyring = new Map([[9, KEY]]);

    expect(verifyGuestResultToken(`${token}=`, metadata(), keyring, 1n)).toBe(
      false,
    );
    expect(
      verifyGuestResultToken("not*base64url", metadata(), keyring, 1n),
    ).toBe(false);
    expect(
      verifyGuestResultToken(
        Buffer.alloc(31).toString("base64url"),
        metadata(),
        keyring,
        1n,
      ),
    ).toBe(false);
    expect(
      verifyGuestResultToken("A".repeat(10_000), metadata(), keyring, 1n),
    ).toBe(false);
    expect(verifyGuestResultToken(undefined, metadata(), keyring, 1n)).toBe(
      false,
    );
  });

  it("rejects invalid nonce length, identifiers and key size", () => {
    expect(() =>
      deriveGuestResultToken(
        { ...metadata(), token_nonce: Buffer.alloc(31) },
        KEY,
      ),
    ).toThrow(RangeError);
    expect(() =>
      deriveGuestResultToken({ ...metadata(), guest_scan_id: "" }, KEY),
    ).toThrow(RangeError);
    expect(() => deriveGuestResultToken(metadata(), Buffer.alloc(31))).toThrow(
      RangeError,
    );
    expect(() =>
      deriveGuestResultToken({ ...metadata(), key_version: -1 }, KEY),
    ).toThrow(RangeError);
  });

  it("contains malformed metadata and throwing keyrings", () => {
    const token = deriveGuestResultToken(metadata(), KEY);
    expect(
      verifyGuestResultToken(
        token,
        { ...metadata(), extra: true },
        new Map([[9, KEY]]),
        1n,
      ),
    ).toBe(false);
    expect(
      verifyGuestResultToken(
        token,
        { ...metadata(), token_version: -1n },
        new Map([[9, KEY]]),
        1n,
      ),
    ).toBe(false);
    const hostile = metadata();
    Object.defineProperty(hostile, "token_nonce", {
      enumerable: true,
      get: () => {
        throw new Error("stored secret");
      },
    });
    expect(
      verifyGuestResultToken(token, hostile, new Map([[9, KEY]]), 1n),
    ).toBe(false);
    const keyring = {
      get: () => {
        throw new Error("key detail");
      },
    } as unknown as ReadonlyMap<number, Uint8Array>;
    expect(verifyGuestResultToken(token, metadata(), keyring, 1n)).toBe(false);
  });
});
