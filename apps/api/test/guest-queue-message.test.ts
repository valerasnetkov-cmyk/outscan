import { describe, expect, it } from "vitest";

import {
  createGuestQueueMessage,
  parseGuestQueueMessage,
} from "../src/guest-queue/index.js";

describe("Guest queue message", () => {
  it("contains only a version and server-created scan identifier", () => {
    const message = createGuestQueueMessage("scan_01HZX");
    expect(message).toEqual({
      schema_version: 1,
      guest_scan_id: "scan_01HZX",
    });
    expect(Object.isFrozen(message)).toBe(true);
    expect(JSON.stringify(message)).not.toMatch(
      /target|token|policy|fence|attempt|credential/iu,
    );
  });

  it.each([
    null,
    {},
    { schema_version: 2, guest_scan_id: "scan_01" },
    { schema_version: 1, guest_scan_id: "bad:id" },
    { schema_version: 1, guest_scan_id: "scan_01", target: "example.com" },
  ])("rejects unknown or malformed payloads", (value) => {
    expect(parseGuestQueueMessage(value)).toBeNull();
  });

  it("fails closed on hostile property access", () => {
    const value = Object.create(null, {
      schema_version: { enumerable: true, value: 1 },
      guest_scan_id: {
        enumerable: true,
        get() {
          throw new Error("hostile getter");
        },
      },
    });
    expect(parseGuestQueueMessage(value)).toBeNull();
  });
});
