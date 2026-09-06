import { describe, expect, it } from "vitest";

import {
  fetchAllYandexMetrikaCounters,
  YandexMetrikaError,
} from "../src/integrations/yandex-metrika/index.js";

const ACCESS_TOKEN = "A".repeat(32);

function counter(id: number) {
  return {
    id,
    name: `Counter ${id}`,
    owner_login: "owner",
    permission: "view",
    status: "Active",
    source: "turbodirect",
    site2: { site: `host-${id}.ru` },
    mirrors2: [],
  };
}

function jsonResponse(payload: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), { status, headers });
}

describe("Yandex Metrika management client", () => {
  it("uses the fixed read endpoint and least-privilege token header", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return jsonResponse({ counters: [counter(1)], rows: 1 });
    };

    const snapshot = await fetchAllYandexMetrikaCounters({
      accessToken: ACCESS_TOKEN,
      fetch: fetchMock,
    });

    const url = new URL(calls[0]?.url ?? "");
    expect(url.origin + url.pathname).toBe(
      "https://api-metrika.yandex.net/management/v1/counters",
    );
    expect(url.searchParams.get("field")).toBe("mirrors");
    expect(url.searchParams.get("offset")).toBe("1");
    expect(url.searchParams.get("per_page")).toBe("1000");
    expect(calls[0]?.authorization).toBe(`OAuth ${ACCESS_TOKEN}`);
    expect(snapshot).toMatchObject({
      rows: 1,
      pagesFetched: 1,
      rejectedCount: 0,
    });
    expect(snapshot.counters[0]?.id).toBe(1);
  });

  it("paginates by received rows and rejects duplicate IDs", async () => {
    const offsets: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const offset = new URL(String(input)).searchParams.get("offset") ?? "";
      offsets.push(offset);
      return offset === "1"
        ? jsonResponse({ counters: [counter(1)], rows: 2 })
        : jsonResponse({ counters: [counter(2)], rows: 2 });
    };
    const snapshot = await fetchAllYandexMetrikaCounters({
      accessToken: ACCESS_TOKEN,
      fetch: fetchMock,
    });
    expect(offsets).toEqual(["1", "2"]);
    expect(snapshot.counters.map(({ id }) => id)).toEqual([1, 2]);

    const duplicateFetch: typeof fetch = async (input) => {
      const offset = new URL(String(input)).searchParams.get("offset");
      return jsonResponse({
        counters: [counter(1)],
        rows: offset === "1" ? 2 : 2,
      });
    };
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: duplicateFetch,
      }),
    ).rejects.toEqual(new YandexMetrikaError("PAGINATION_INCONSISTENT"));
  });

  it("counts malformed records without discarding valid records", async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({ counters: [counter(1), { id: -1 }], rows: 2 });
    const snapshot = await fetchAllYandexMetrikaCounters({
      accessToken: ACCESS_TOKEN,
      fetch: fetchMock,
    });
    expect(snapshot.counters).toHaveLength(1);
    expect(snapshot.rejectedCount).toBe(1);
  });

  it("retries bounded transient responses and respects Retry-After", async () => {
    let attempt = 0;
    const sleeps: number[] = [];
    const fetchMock: typeof fetch = async () => {
      attempt += 1;
      if (attempt === 1) {
        return jsonResponse({}, 429, { "retry-after": "2" });
      }
      return jsonResponse({ counters: [], rows: 0 });
    };
    const snapshot = await fetchAllYandexMetrikaCounters({
      accessToken: ACCESS_TOKEN,
      fetch: fetchMock,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      },
      random: () => 0,
    });
    expect(snapshot.rows).toBe(0);
    expect(attempt).toBe(2);
    expect(sleeps).toEqual([2_000]);
  });

  it.each([
    [401, "TOKEN_REJECTED"],
    [403, "ACCESS_DENIED"],
    [400, "UPSTREAM_REJECTED"],
  ])("maps terminal HTTP %s to %s", async (status, code) => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({}, status);
    };
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: fetchMock,
      }),
    ).rejects.toEqual(new YandexMetrikaError(code as never));
    expect(calls).toBe(1);
  });

  it("bounds retries for upstream failures", async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;
      return jsonResponse({}, 500);
    };
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: fetchMock,
        maxAttempts: 2,
        sleep: async () => undefined,
        random: () => 0,
      }),
    ).rejects.toEqual(new YandexMetrikaError("UPSTREAM_UNAVAILABLE"));
    expect(calls).toBe(2);
  });

  it("bounds and validates response bodies", async () => {
    const oversized: typeof fetch = async () =>
      new Response("{}", {
        status: 200,
        headers: { "content-length": String(5 * 1_024 * 1_024) },
      });
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: oversized,
      }),
    ).rejects.toEqual(new YandexMetrikaError("RESPONSE_TOO_LARGE"));

    const streamedOversized: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(4 * 1_024 * 1_024));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        }),
        { status: 200 },
      );
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: streamedOversized,
      }),
    ).rejects.toEqual(new YandexMetrikaError("RESPONSE_TOO_LARGE"));

    const malformed: typeof fetch = async () => new Response("not-json");
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: malformed,
      }),
    ).rejects.toEqual(new YandexMetrikaError("INVALID_COUNTER_RESPONSE"));

    const invalidUtf8: typeof fetch = async () =>
      new Response(Uint8Array.from([0xc3, 0x28]));
    await expect(
      fetchAllYandexMetrikaCounters({
        accessToken: ACCESS_TOKEN,
        fetch: invalidUtf8,
      }),
    ).rejects.toEqual(new YandexMetrikaError("INVALID_COUNTER_RESPONSE"));
  });
});
