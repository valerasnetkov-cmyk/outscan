import {
  authorizeGuestResultAccess,
  type GuestResultAccessRequest,
  type GuestResultTokenKeyring,
} from "../guest-crypto/index.js";
import {
  createGuestResultView,
  type GuestResultView,
} from "../guest-result/index.js";
import type { GuestResultReadStore } from "./model.js";
import { snapshotGuestResultReadRecord } from "./snapshot.js";

const REQUEST_KEYS = [
  "authorization_header",
  "route_guest_scan_id",
  "query",
  "now_unix_seconds",
] as const;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;
const BEARER = /^Bearer [A-Za-z0-9_-]{43}$/iu;

export type ReadGuestResultDecision =
  | {
      ok: true;
      response_headers: Readonly<{
        "cache-control": "no-store";
        "referrer-policy": "no-referrer";
      }>;
      body: Readonly<GuestResultView>;
    }
  | { ok: false; code: "INVALID_RESULT_REQUEST" | "RESULT_ACCESS_DENIED" };

export interface ReadGuestResultDependencies {
  store: GuestResultReadStore;
  token_keyring: GuestResultTokenKeyring;
}

function exactRequest(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  try {
    const keys = Reflect.ownKeys(value);
    return (
      keys.length === REQUEST_KEYS.length &&
      REQUEST_KEYS.every((key) => keys.includes(key))
    );
  } catch {
    return false;
  }
}

function requestSnapshot(value: unknown): GuestResultAccessRequest | null {
  if (!exactRequest(value)) return null;
  try {
    const authorization = value.authorization_header;
    const guestScanId = value.route_guest_scan_id;
    const query = value.query;
    const now = value.now_unix_seconds;
    if (
      typeof guestScanId !== "string" ||
      Buffer.byteLength(guestScanId, "utf8") < 1 ||
      Buffer.byteLength(guestScanId, "utf8") > 512 ||
      typeof query !== "object" ||
      query === null ||
      Array.isArray(query) ||
      ![Object.prototype, null].includes(Reflect.getPrototypeOf(query)) ||
      Reflect.ownKeys(query).length !== 0 ||
      typeof now !== "bigint" ||
      now < 0n ||
      now > UINT64_MAX
    )
      return null;
    return Object.freeze({
      authorization_header: authorization,
      route_guest_scan_id: guestScanId,
      query: Object.freeze({}),
      now_unix_seconds: now,
    });
  } catch {
    return null;
  }
}

export async function readAuthorizedGuestResult(
  requestValue: unknown,
  dependencies: ReadGuestResultDependencies,
): Promise<ReadGuestResultDecision> {
  const request = requestSnapshot(requestValue);
  if (!request) return { ok: false, code: "INVALID_RESULT_REQUEST" };
  if (
    typeof request.authorization_header !== "string" ||
    request.authorization_header.length > 128 ||
    !BEARER.test(request.authorization_header)
  )
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  let rawRecord: unknown | null;
  let keyring: GuestResultTokenKeyring;
  try {
    const store = dependencies.store;
    keyring = dependencies.token_keyring;
    if (!store || typeof store.loadByGuestScanId !== "function" || !keyring)
      return { ok: false, code: "RESULT_ACCESS_DENIED" };
    rawRecord = await store.loadByGuestScanId(request.route_guest_scan_id);
  } catch {
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  }
  const record = snapshotGuestResultReadRecord(rawRecord);
  if (
    !record ||
    request.now_unix_seconds >= record.scan.deletion_deadline_unix_seconds
  )
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  const access = authorizeGuestResultAccess(
    request,
    record.scan.result_token_metadata,
    keyring,
  );
  if (!access.ok) return { ok: false, code: "RESULT_ACCESS_DENIED" };
  const view = createGuestResultView({
    access: access.access,
    completed_at_unix_seconds: record.result.completed_at_unix_seconds,
    projection: record.result.projection,
  });
  if (!view.ok || view.body.canonical_host !== record.scan.canonical_target)
    return { ok: false, code: "RESULT_ACCESS_DENIED" };
  return view;
}
