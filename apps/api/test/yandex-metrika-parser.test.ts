import { describe, expect, it } from "vitest";

import {
  parseYandexMetrikaCounterPage,
  YANDEX_METRIKA_PERMISSIONS,
  YandexMetrikaError,
} from "../src/integrations/yandex-metrika/index.js";

function record(permission = "own") {
  return {
    id: 42,
    name: "Production",
    owner_login: "owner",
    permission,
    status: "Active",
    source: "turbodirect",
    site2: { site: "example.ru", ignored: true },
    mirrors2: [{ site: "www.example.ru" }, null],
    ignored: "field",
  };
}

describe("Yandex Metrika counter parser", () => {
  it.each(YANDEX_METRIKA_PERMISSIONS)("accepts permission %s", (permission) => {
    const page = parseYandexMetrikaCounterPage(
      { counters: [record(permission)], rows: 1 },
      1_000,
    );
    expect(page).toEqual({
      counters: [
        {
          id: 42,
          name: "Production",
          ownerLogin: "owner",
          permission,
          status: "Active",
          source: "turbodirect",
          primarySite: "example.ru",
          mirrors: ["www.example.ru"],
        },
      ],
      rows: 1,
      receivedCount: 1,
      rejectedCount: 0,
    });
  });

  it("rejects a malformed record without discarding valid records", () => {
    const page = parseYandexMetrikaCounterPage(
      { counters: [record(), { ...record(), id: -1 }], rows: 2 },
      1_000,
    );
    expect(page.counters).toHaveLength(1);
    expect(page.receivedCount).toBe(2);
    expect(page.rejectedCount).toBe(1);
  });

  it.each([
    [null, 1_000],
    [{ counters: {}, rows: 0 }, 1_000],
    [{ counters: [], rows: -1 }, 1_000],
    [{ counters: [record(), record()], rows: 2 }, 1],
    [{ counters: [], rows: 0 }, 0],
  ])("fails closed on malformed page %#", (payload, perPage) => {
    expect(() => parseYandexMetrikaCounterPage(payload, perPage)).toThrowError(
      new YandexMetrikaError("INVALID_COUNTER_RESPONSE"),
    );
  });
});
