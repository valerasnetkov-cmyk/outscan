import {
  authenticateGuestSessionCookieHeader,
  issueGuestSessionCookieHeader,
} from "../guest-crypto/index.js";

const MAX_KEY_VERSION = 0xffff_ffff;
const MAX_KEYS = 3;

export type GuestSessionBootstrapDecision =
  | Readonly<{ ok: true; action: "REUSED" }>
  | Readonly<{ ok: true; action: "ISSUED"; set_cookie: string }>
  | Readonly<{ ok: false; code: "GUEST_SESSION_UNAVAILABLE" }>;

export type GuestSessionBootstrapper = (
  request: Readonly<{ cookie_header: string | undefined }>,
) => Promise<GuestSessionBootstrapDecision>;

export interface GuestSessionKeyProvider {
  get_current_keys(): Promise<unknown>;
}

export interface GuestSessionRevocationProvider {
  is_revoked(guestSessionScope: string): Promise<unknown>;
}

export interface GuestSessionBootstrapDependencies {
  key_provider: GuestSessionKeyProvider;
  revocation_provider: GuestSessionRevocationProvider;
}

export interface GuestSessionKeyState {
  active_key_version: number;
  keys: ReadonlyMap<number, Uint8Array>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length && keys.every((key) => actual.includes(key))
    );
  } catch {
    return false;
  }
}

function validVersion(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= MAX_KEY_VERSION
  );
}

export function snapshotGuestSessionKeyState(
  value: unknown,
): GuestSessionKeyState | null {
  if (!exact(value, ["active_key_version", "keys"])) return null;
  try {
    const activeVersion = Reflect.get(value as object, "active_key_version");
    const suppliedKeys = Reflect.get(value as object, "keys");
    if (
      !validVersion(activeVersion) ||
      !(suppliedKeys instanceof Map) ||
      suppliedKeys.size < 1 ||
      suppliedKeys.size > MAX_KEYS
    ) {
      return null;
    }

    const keys = new Map<number, Uint8Array>();
    for (const [version, key] of suppliedKeys) {
      if (
        !validVersion(version) ||
        keys.has(version) ||
        !(key instanceof Uint8Array) ||
        key.byteLength !== 32
      ) {
        return null;
      }
      keys.set(version, Buffer.from(key));
    }
    if (!keys.has(activeVersion)) return null;
    return Object.freeze({ active_key_version: activeVersion, keys });
  } catch {
    return null;
  }
}

function snapshotRequest(
  value: unknown,
): Readonly<{ cookie_header: string | undefined }> | null {
  if (!exact(value, ["cookie_header"])) return null;
  try {
    const cookieHeader = Reflect.get(value as object, "cookie_header");
    return cookieHeader === undefined || typeof cookieHeader === "string"
      ? Object.freeze({ cookie_header: cookieHeader })
      : null;
  } catch {
    return null;
  }
}

function unavailable(): GuestSessionBootstrapDecision {
  return Object.freeze({ ok: false, code: "GUEST_SESSION_UNAVAILABLE" });
}

function dependenciesSnapshot(value: GuestSessionBootstrapDependencies): {
  readKeys: () => Promise<unknown>;
  isRevoked: (scope: string) => Promise<unknown>;
} | null {
  try {
    const keyProvider = value?.key_provider;
    const revocationProvider = value?.revocation_provider;
    const readKeys = keyProvider?.get_current_keys;
    const isRevoked = revocationProvider?.is_revoked;
    return typeof readKeys === "function" && typeof isRevoked === "function"
      ? Object.freeze({
          readKeys: () =>
            Promise.resolve().then(() => readKeys.call(keyProvider)),
          isRevoked: (scope: string) =>
            Promise.resolve().then(() =>
              isRevoked.call(revocationProvider, scope),
            ),
        })
      : null;
  } catch {
    return null;
  }
}

export function createGuestSessionBootstrapService(
  rawDependencies: GuestSessionBootstrapDependencies,
): GuestSessionBootstrapper {
  const dependencies = dependenciesSnapshot(rawDependencies);
  if (!dependencies)
    throw new Error("INVALID_GUEST_SESSION_BOOTSTRAP_CONFIGURATION");

  return async function bootstrapGuestSession(rawRequest) {
    const request = snapshotRequest(rawRequest);
    if (!request) return unavailable();

    let state: GuestSessionKeyState | null;
    try {
      state = snapshotGuestSessionKeyState(await dependencies.readKeys());
    } catch {
      state = null;
    }
    if (!state) return unavailable();

    const authenticated = authenticateGuestSessionCookieHeader(
      request.cookie_header,
      state.keys,
    );
    if (authenticated.ok) {
      let revoked: unknown;
      try {
        revoked = await dependencies.isRevoked(
          authenticated.session.guest_session_scope,
        );
      } catch {
        return unavailable();
      }
      if (typeof revoked !== "boolean") return unavailable();
      if (!revoked) return Object.freeze({ ok: true, action: "REUSED" });
    }

    const activeKey = state.keys.get(state.active_key_version);
    if (!activeKey) return unavailable();
    const issued = issueGuestSessionCookieHeader(
      state.active_key_version,
      activeKey,
    );
    return issued.ok
      ? Object.freeze({
          ok: true,
          action: "ISSUED",
          set_cookie: issued.set_cookie,
        })
      : unavailable();
  };
}
