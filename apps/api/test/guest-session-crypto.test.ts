import { describe, expect, it } from "vitest";

import {
  createGuestSessionCookie,
  deriveGuestSessionScope,
  encodeGuestSessionMessage,
  verifyGuestSessionCookie,
} from "../src/guest-crypto/index.js";

const KEY = Buffer.alloc(32, 0x11);
const SESSION_ID = Buffer.from(Array.from({ length: 32 }, (_, index) => index));

describe("Guest session cookie crypto", () => {
  it("uses the canonical domain-separated binary message", () => {
    expect(encodeGuestSessionMessage(7, SESSION_ID).toString("hex")).toBe(
      "4f55545343414e3a47554553545f53455353494f4e5f434f4f4b49453a76310000000007000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
  });

  it("matches fixed cookie and scope vectors", () => {
    expect(createGuestSessionCookie(7, KEY, SESSION_ID)).toBe(
      "v1.7.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8.UvemuTpX0QA_AewdB1_zIgacG7LmfcZeC_CiIM1XbS8",
    );
    expect(deriveGuestSessionScope(SESSION_ID)).toBe(
      "sha256:16f3a5c1dfadc226726090a0baeba6bdb8bd99ca412af908f5fd07a98e883ecf",
    );
  });

  it("verifies a cookie and returns only the authenticated principal", () => {
    const cookie = createGuestSessionCookie(7, KEY, SESSION_ID);
    const principal = verifyGuestSessionCookie(cookie, new Map([[7, KEY]]));

    expect(principal).toEqual({
      key_version: 7,
      guest_session_id: SESSION_ID,
      guest_session_scope: deriveGuestSessionScope(SESSION_ID),
    });
  });

  it.each(["v1.07", "v2.7", "v1.4294967296", "v1.-1"])(
    "rejects non-canonical version prefix %s",
    (prefix) => {
      const valid = createGuestSessionCookie(7, KEY, SESSION_ID).split(".");
      expect(
        verifyGuestSessionCookie(
          `${prefix}.${valid[2]}.${valid[3]}`,
          new Map([[7, KEY]]),
        ),
      ).toBeNull();
    },
  );

  it("rejects tampering, unknown key versions and short keys", () => {
    const cookie = createGuestSessionCookie(7, KEY, SESSION_ID);
    const parts = cookie.split(".");
    const tampered = [
      parts[0],
      parts[1],
      parts[2],
      `${parts[3]!.slice(0, -1)}A`,
    ].join(".");

    expect(verifyGuestSessionCookie(tampered, new Map([[7, KEY]]))).toBeNull();
    expect(verifyGuestSessionCookie(cookie, new Map([[8, KEY]]))).toBeNull();
    expect(
      verifyGuestSessionCookie(cookie, new Map([[7, Buffer.alloc(16)]])),
    ).toBeNull();
  });

  it("supports normal key rotation while the retired key remains present", () => {
    const cookie = createGuestSessionCookie(7, KEY, SESSION_ID);
    const rotatedKeyring = new Map([
      [7, KEY],
      [8, Buffer.alloc(32, 0x22)],
    ]);

    expect(verifyGuestSessionCookie(cookie, rotatedKeyring)).not.toBeNull();
    expect(
      verifyGuestSessionCookie(cookie, new Map([[8, Buffer.alloc(32, 0x22)]])),
    ).toBeNull();
  });

  it("rejects padded or malformed base64url", () => {
    const cookie = createGuestSessionCookie(7, KEY, SESSION_ID);
    const parts = cookie.split(".");

    expect(
      verifyGuestSessionCookie(
        [parts[0], parts[1], `${parts[2]}=`, parts[3]].join("."),
        new Map([[7, KEY]]),
      ),
    ).toBeNull();
  });

  it("requires 32-byte session IDs and at least 32-byte keys", () => {
    expect(() => createGuestSessionCookie(7, KEY, Buffer.alloc(31))).toThrow(
      RangeError,
    );
    expect(() =>
      createGuestSessionCookie(7, Buffer.alloc(31), SESSION_ID),
    ).toThrow(RangeError);
  });

  it("rejects an oversized cookie before decoding", () => {
    expect(verifyGuestSessionCookie("A".repeat(257), new Map())).toBeNull();
  });
});
