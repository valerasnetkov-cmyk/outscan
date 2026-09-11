import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGuestSessionRoutePlugin,
  createGuestScanRoutePlugin,
} from "../src/guest-http/index.js";
import { createGuestSessionBootstrapService } from "../src/guest-session/index.js";
import { createGuestScanCreationService } from "../src/guest-scan/index.js";
import type { PersistGuestScanResult } from "../src/guest-persistence/index.js";

const ORIGIN = "https://outscan.example";
const NOW = 1_800_000_000;
const apps: ReturnType<typeof Fastify>[] = [];

async function harness() {
  let keyState: unknown = {
    active_key_version: 1,
    keys: new Map([[1, Buffer.alloc(32, 17)]]),
  };
  const keyProvider = { get_current_keys: async () => keyState };
  const revoked = vi.fn(async (scope: string): Promise<unknown> => {
    void scope;
    return false;
  });
  const persisted: PersistGuestScanResult = {
    ok: true,
    action: "CREATE",
    guest_scan_id: "guest_scan_01",
    result_token: "A".repeat(43),
    result_access_expires_at_unix_seconds: BigInt(NOW + 1800),
    result_token_expires_in_seconds: 1800,
  };
  const createOrReplay = vi.fn(
    async (value: unknown): Promise<PersistGuestScanResult> => {
      void value;
      return persisted;
    },
  );
  const enqueue = vi.fn(async (id: unknown): Promise<unknown> => ({
    schema_version: 1,
    guest_scan_id: id,
  }));
  const app = Fastify({ logger: false });
  apps.push(app);
  await app.register(
    createGuestSessionRoutePlugin({
      allowed_origin: ORIGIN,
      bootstrap_session: createGuestSessionBootstrapService({
        key_provider: keyProvider,
        revocation_provider: { is_revoked: revoked },
      }),
    }),
  );
  await app.register(
    createGuestScanRoutePlugin({
      allowed_origin: ORIGIN,
      create_scan: createGuestScanCreationService({
        guest_session_key_provider: keyProvider,
        is_guest_session_revoked: revoked,
        trusted_proxy_cidrs: [],
        network_hmac_keyring: new Map([[1, Buffer.alloc(32, 34)]]),
        active_network_hmac_key_version: 1,
        persistence: { createOrReplay },
        queue: { enqueue },
        now_unix_seconds: () => NOW,
      }),
    }),
  );
  const bootstrap = (cookie?: string) =>
    app.inject({
      method: "POST",
      url: "/v1/public/guest-session",
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    });
  const scan = (cookie?: string) =>
    app.inject({
      method: "POST",
      url: "/v1/public/scans",
      remoteAddress: "198.51.100.9",
      headers: {
        origin: ORIGIN,
        "idempotency-key": "request-01",
        ...(cookie ? { cookie } : {}),
      },
      payload: { domain: "EXAMPLE.com." },
    });
  async function issue() {
    const response = await bootstrap();
    expect(response.statusCode).toBe(204);
    const setCookie = response.headers["set-cookie"];
    if (typeof setCookie !== "string") throw new Error("Missing cookie");
    return setCookie.split(";")[0]!;
  }
  return {
    bootstrap,
    scan,
    issue,
    createOrReplay,
    enqueue,
    revoked,
    persisted,
    setKeys: (value: unknown) => {
      keyState = value;
    },
  };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("detached Guest HTTP with real bootstrap and creation services", () => {
  it("uses the issued cookie for canonicalized admission and reuses it without refresh", async () => {
    const test = await harness();
    const cookie = await test.issue();
    const reused = await test.bootstrap(cookie);
    expect(reused.statusCode).toBe(204);
    expect(reused.headers["set-cookie"]).toBeUndefined();
    const response = await test.scan(cookie);
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      scanId: "guest_scan_01",
      resultToken: "A".repeat(43),
    });
    expect(test.createOrReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        canonical_target: "example.com",
        idempotency_key: "request-01",
        guest_session_scope: expect.any(String),
      }),
    );
    expect(test.revoked.mock.calls[0]?.[0]).toBe(
      test.revoked.mock.calls[1]?.[0],
    );
    expect(test.enqueue).toHaveBeenCalledWith("guest_scan_01");
    expect(response.body).not.toContain(cookie);
  });

  it("rejects missing and tampered cookies before persistence", async () => {
    const test = await harness();
    const cookie = await test.issue();
    expect((await test.scan()).statusCode).toBe(401);
    expect((await test.scan(`${cookie}x`)).statusCode).toBe(401);
    expect(test.createOrReplay).not.toHaveBeenCalled();
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it("observes key removal across both services without restarting routes", async () => {
    const test = await harness();
    const old = await test.issue();
    test.setKeys({
      active_key_version: 2,
      keys: new Map([[2, Buffer.alloc(32, 51)]]),
    });
    expect((await test.scan(old)).statusCode).toBe(401);
    expect(test.createOrReplay).not.toHaveBeenCalled();
    const renewed = await test.bootstrap(old);
    expect(renewed.statusCode).toBe(204);
    const header = renewed.headers["set-cookie"];
    if (typeof header !== "string") throw new Error("Missing replacement");
    const replacement = header.split(";")[0]!;
    expect(replacement).not.toBe(old);
    expect((await test.scan(replacement)).statusCode).toBe(202);
  });

  it("fails closed on revocation and unavailable shared providers", async () => {
    const test = await harness();
    const cookie = await test.issue();
    test.revoked.mockResolvedValue(true);
    expect((await test.scan(cookie)).statusCode).toBe(401);
    test.revoked.mockResolvedValue(null);
    expect((await test.bootstrap(cookie)).statusCode).toBe(503);
    expect((await test.scan(cookie)).statusCode).toBe(503);
    test.setKeys(null);
    expect((await test.bootstrap()).statusCode).toBe(503);
    expect((await test.scan(cookie)).statusCode).toBe(503);
    expect(test.createOrReplay).not.toHaveBeenCalled();
    expect(test.enqueue).not.toHaveBeenCalled();
  });

  it("withholds result access on enqueue failure and accepts persisted replay recovery", async () => {
    const test = await harness();
    const cookie = await test.issue();
    test.enqueue.mockRejectedValueOnce(new Error("queue private-canary"));
    const failed = await test.scan(cookie);
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toMatch(/resultToken|private-canary/);
    test.createOrReplay.mockResolvedValueOnce({
      ...test.persisted,
      action: "REPLAY",
    });
    const replay = await test.scan(cookie);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({
      scanId: "guest_scan_01",
      resultAccessExpiresAt: new Date((NOW + 1800) * 1000).toISOString(),
    });
    expect(test.createOrReplay.mock.calls[0]?.[0]).toEqual(
      test.createOrReplay.mock.calls[1]?.[0],
    );
    expect(test.enqueue.mock.calls).toEqual([
      ["guest_scan_01"],
      ["guest_scan_01"],
    ]);
  });
});
