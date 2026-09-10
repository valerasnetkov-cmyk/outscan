import { validId } from "../guest-persistence/index.js";
import type { GuestQueueMessage } from "./model.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseGuestQueueMessage(
  value: unknown,
): Readonly<GuestQueueMessage> | null {
  if (!isRecord(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    const version = Reflect.get(value, "schema_version");
    const guestScanId = Reflect.get(value, "guest_scan_id");
    if (
      keys.length !== 2 ||
      !keys.includes("schema_version") ||
      !keys.includes("guest_scan_id") ||
      version !== 1 ||
      !validId(guestScanId)
    ) {
      return null;
    }
    return Object.freeze({ schema_version: 1, guest_scan_id: guestScanId });
  } catch {
    return null;
  }
}

export function createGuestQueueMessage(
  guestScanId: unknown,
): Readonly<GuestQueueMessage> {
  if (!validId(guestScanId)) throw new Error("INVALID_GUEST_SCAN_ID");
  return Object.freeze({ schema_version: 1, guest_scan_id: guestScanId });
}
