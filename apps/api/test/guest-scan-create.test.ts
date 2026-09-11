import { describe, expect, it, vi } from "vitest";

import {
  createGuestSessionCookie,
  deriveGuestSessionScope,
  GUEST_SESSION_COOKIE_NAME,
} from "../src/guest-crypto/index.js";
import type { PersistGuestScanResult } from "../src/guest-persistence/index.js";
import {
  createGuestScanCreationService,
  deriveGuestScanRequestHash,
  type GuestScanCreationDependencies,
} from "../src/guest-scan/index.js";

const NOW = 1_800_000_000;
const SESSION_KEY = Buffer.alloc(32, 0x11);
const NETWORK_KEY = Buffer.alloc(32, 0x22);
const SESSION_ID = Buffer.alloc(32, 0x33);
const SESSION_SCOPE = deriveGuestSessionScope(SESSION_ID);
const RESULT_TOKEN = "A".repeat(43);

function successful(
  action: "CREATE" | "REPLACE_EXPIRED" | "REPLAY" = "CREATE",
): PersistGuestScanResult {
  return {
    ok: true,
    action,
    guest_scan_id: "guest_scan_01",
    result_token: RESULT_TOKEN,
    result_access_expires_at_unix_seconds: BigInt(NOW + 1_800),
    result_token_expires_in_seconds: 1_800,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  const cookie = createGuestSessionCookie(7, SESSION_KEY, SESSION_ID);
  return {
    body: { domain: "EXAMPLE.com." },
    cookie_header: `${GUEST_SESSION_COOKIE_NAME}=${cookie}`,
    idempotency_key_header: "request-01",
    socket_remote_address: "198.51.100.9",
    x_forwarded_for: undefined,
    ...overrides,
  };
}

function harness(result: PersistGuestScanResult = successful()) {
  const createOrReplay = vi.fn(
    async (value: unknown): Promise<PersistGuestScanResult> => {
      void value;
      return result;
    },
  );
  const enqueue = vi.fn(async (guestScanId: unknown) => ({
    schema_version: 1,
    guest_scan_id: guestScanId,
  }));
  const dependencies: GuestScanCreationDependencies = {
    guest_session_key_provider: {
      get_current_keys: async () => ({
        active_key_version: 7,
        keys: new Map([[7, SESSION_KEY]]),
      }),
    },
    is_guest_session_revoked: () => false,
    trusted_proxy_cidrs: [],
    network_hmac_keyring: new Map([[4, NETWORK_KEY]]),
    active_network_hmac_key_version: 4,
    persistence: { createOrReplay },
    queue: { enqueue },
    now_unix_seconds: () => NOW,
  };
  return { dependencies, createOrReplay, enqueue };
}

describe("Guest scan creation composition", () => {
  it("authenticates, canonicalizes, pseudonymizes, persists and enqueues", async () => {
    const test = harness();
    const service = createGuestScanCreationService(test.dependencies);
    const result = await service(input());

    expect(result).toEqual({
      ok: true,
      status_code: 202,
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
      body: {
        scanId: "guest_scan_01",
        resultToken: RESULT_TOKEN,
        status: "QUEUED",
        resultAccessExpiresAt: new Date((NOW + 1_800) * 1_000).toISOString(),
        resultTokenExpiresInSeconds: 1_800,
      },
    });
    expect(test.createOrReplay).toHaveBeenCalledWith({
      guest_session_scope: SESSION_SCOPE,
      idempotency_key: "request-01",
      request_hash: deriveGuestScanRequestHash("example.com"),
      canonical_target: "example.com",
      network_signal_digests: [expect.stringMatching(/^hmac-sha256:/u)],
      trusted_now_unix_seconds: BigInt(NOW),
    });
    expect(test.enqueue).toHaveBeenCalledWith("guest_scan_01");
    expect(JSON.stringify(result)).not.toContain("198.51.100.9");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.body)).toBe(true);
  });

  it("re-enqueues stable replay for crash-window recovery", async () => {
    const test = harness(successful("REPLAY"));
    const result = await createGuestScanCreationService(test.dependencies)(
      input({ socket_remote_address: "203.0.113.40" }),
    );
    expect(result).toMatchObject({ ok: true, status_code: 200 });
    expect(test.enqueue).toHaveBeenCalledWith("guest_scan_01");
  });

  it("rejects malformed input and session state before persistence", async () => {
    const test = harness();
    const service = createGuestScanCreationService(test.dependencies);
    await expect(
      service(input({ body: { domain: "https://example.com" } })),
    ).resolves.toMatchObject({
      ok: false,
      status_code: 400,
      body: { error: { code: "INVALID_SCAN_REQUEST" } },
    });
    await expect(
      service(input({ cookie_header: undefined })),
    ).resolves.toMatchObject({
      ok: false,
      status_code: 401,
      body: { error: { code: "GUEST_SESSION_REQUIRED" } },
    });
    expect(test.createOrReplay).not.toHaveBeenCalled();
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it("separates confirmed revocation from revocation-store failure", async () => {
    const revoked = harness();
    revoked.dependencies.is_guest_session_revoked = vi.fn(async () => true);
    await expect(
      createGuestScanCreationService(revoked.dependencies)(input()),
    ).resolves.toMatchObject({
      ok: false,
      status_code: 401,
      body: { error: { code: "GUEST_SESSION_INVALID" } },
    });
    expect(revoked.createOrReplay).not.toHaveBeenCalled();

    for (const unavailable of [
      vi.fn(async () => null),
      vi.fn(async () => {
        throw new Error("database detail");
      }),
    ]) {
      const test = harness();
      test.dependencies.is_guest_session_revoked = unavailable;
      await expect(
        createGuestScanCreationService(test.dependencies)(input()),
      ).resolves.toMatchObject({
        ok: false,
        status_code: 503,
        body: { error: { code: "GUEST_SCAN_UNAVAILABLE" } },
      });
      expect(test.createOrReplay).not.toHaveBeenCalled();
      expect(test.enqueue).not.toHaveBeenCalled();
    }
  });

  it("freshly applies Guest-session key rotation and provider failure", async () => {
    const test = harness();
    const getKeys = vi
      .fn()
      .mockResolvedValueOnce({
        active_key_version: 7,
        keys: new Map([[7, SESSION_KEY]]),
      })
      .mockResolvedValueOnce({
        active_key_version: 8,
        keys: new Map([[8, Buffer.alloc(32, 0x55)]]),
      });
    test.dependencies.guest_session_key_provider = {
      get_current_keys: getKeys,
    };
    const service = createGuestScanCreationService(test.dependencies);
    await expect(service(input())).resolves.toMatchObject({ ok: true });
    await expect(service(input())).resolves.toMatchObject({
      ok: false,
      status_code: 401,
      body: { error: { code: "GUEST_SESSION_INVALID" } },
    });
    expect(getKeys).toHaveBeenCalledTimes(2);

    for (const unavailable of [
      async () => null,
      async () => {
        throw new Error("secret provider detail");
      },
    ]) {
      const failed = harness();
      failed.dependencies.guest_session_key_provider = {
        get_current_keys: unavailable,
      };
      await expect(
        createGuestScanCreationService(failed.dependencies)(input()),
      ).resolves.toMatchObject({
        status_code: 503,
        body: { error: { code: "GUEST_SCAN_UNAVAILABLE" } },
      });
      expect(failed.createOrReplay).not.toHaveBeenCalled();
      expect(failed.enqueue).not.toHaveBeenCalled();
    }
  });

  it("maps idempotency conflict without enqueue or internal detail", async () => {
    const test = harness({ ok: false, code: "IDEMPOTENCY_KEY_REUSED" });
    const result = await createGuestScanCreationService(test.dependencies)(
      input(),
    );
    expect(result).toMatchObject({
      ok: false,
      status_code: 409,
      body: { error: { code: "IDEMPOTENCY_KEY_REUSED" } },
    });
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it("maps bounded quota delay without revealing the denied dimension", async () => {
    const test = harness({
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: "NETWORK_DAILY_LIMIT",
      retry_after_seconds: 900,
    });
    const result = await createGuestScanCreationService(test.dependencies)(
      input(),
    );
    expect(result).toEqual({
      ok: false,
      status_code: 429,
      headers: { ...result.headers, "retry-after": "900" },
      body: { error: { code: "GUEST_SCAN_LIMIT_EXCEEDED" } },
    });
    expect(JSON.stringify(result)).not.toContain("NETWORK_DAILY_LIMIT");
  });

  it("keeps server pause distinct from a customer quota denial", async () => {
    const test = harness({
      ok: false,
      code: "ABUSE_LIMIT_EXCEEDED",
      abuse_code: "GUEST_SCANNING_PAUSED",
    });
    await expect(
      createGuestScanCreationService(test.dependencies)(input()),
    ).resolves.toMatchObject({
      status_code: 503,
      body: { error: { code: "GUEST_SCANNING_UNAVAILABLE" } },
    });
  });

  it("returns no result token when enqueue is unavailable or inconsistent", async () => {
    for (const enqueue of [
      vi.fn(async () => Promise.reject(new Error("redis credential detail"))),
      vi.fn(async () => ({ schema_version: 1, guest_scan_id: "other_scan" })),
    ]) {
      const test = harness();
      test.dependencies.queue = { enqueue };
      const result = await createGuestScanCreationService(test.dependencies)(
        input(),
      );
      expect(result).toMatchObject({
        ok: false,
        status_code: 503,
        body: { error: { code: "GUEST_SCAN_UNAVAILABLE" } },
      });
      expect(JSON.stringify(result)).not.toContain(RESULT_TOKEN);
    }
  });

  it("contains malformed persistence output and hostile input", async () => {
    const test = harness();
    test.dependencies.persistence = {
      createOrReplay: async () =>
        ({
          ...successful(),
          extra: "unsafe",
        }) as unknown as PersistGuestScanResult,
    };
    await expect(
      createGuestScanCreationService(test.dependencies)(input()),
    ).resolves.toMatchObject({
      ok: false,
      status_code: 503,
      body: { error: { code: "GUEST_SCAN_UNAVAILABLE" } },
    });

    const hostile = input();
    Object.defineProperty(hostile, "body", {
      enumerable: true,
      get: () => {
        throw new Error("hostile request detail");
      },
    });
    await expect(
      createGuestScanCreationService(harness().dependencies)(hostile),
    ).resolves.toMatchObject({ status_code: 400 });
  });

  it("rejects invalid configuration and snapshots network key bytes", async () => {
    const test = harness();
    const mutableKey = Buffer.alloc(32, 0x44);
    test.dependencies.network_hmac_keyring = new Map([[4, mutableKey]]);
    const service = createGuestScanCreationService(test.dependencies);
    mutableKey.fill(0x55);
    await service(input());
    const firstRequest = test.createOrReplay.mock.calls[0]?.[0] as {
      network_signal_digests: string[];
    };
    expect(firstRequest.network_signal_digests).toEqual([
      "hmac-sha256:75bf46ea8ad9d55565b5a82682ede99804d7b13a9cf8c45a61f79a6bb97b0c00",
    ]);

    expect(() =>
      createGuestScanCreationService({
        ...harness().dependencies,
        active_network_hmac_key_version: 5,
      }),
    ).toThrow("INVALID_GUEST_SCAN_CREATION_CONFIGURATION");
  });

  it("uses a stable domain-separated canonical request hash", () => {
    expect(deriveGuestScanRequestHash("example.com")).toBe(
      "sha256:6415c8fd2ec0628c717f60882e4d570de0c771c65afc0ac3af30bc9e52e901fb",
    );
    expect(deriveGuestScanRequestHash("EXAMPLE.com")).toBeNull();
    expect(deriveGuestScanRequestHash("example.com\0other")).toBeNull();
  });
});
