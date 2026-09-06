import {
  YANDEX_METRIKA_PERMISSIONS,
  YandexMetrikaError,
  type YandexMetrikaCounter,
  type YandexMetrikaCounterPage,
  type YandexMetrikaPermission,
} from "./model.js";

const MAX_COUNTERS = 100_000;
const MAX_MIRRORS_PER_COUNTER = 1_000;

function invalid(): never {
  throw new YandexMetrikaError("INVALID_COUNTER_RESPONSE");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(
  value: unknown,
  maximum: number,
  allowEmpty = false,
): string {
  if (typeof value !== "string" || value.length > maximum) return invalid();
  const result = value.trim();
  if (!allowEmpty && result.length === 0) return invalid();
  return result;
}

function siteValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) return invalid();
  return stringValue(value.site, 2_048);
}

function mirrorValues(value: unknown): readonly string[] {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_MIRRORS_PER_COUNTER) {
    return invalid();
  }
  const mirrors: string[] = [];
  for (const mirror of value) {
    if (mirror === null) continue;
    if (!isRecord(mirror)) return invalid();
    mirrors.push(stringValue(mirror.site, 2_048));
  }
  return Object.freeze(mirrors);
}

function parseCounter(value: unknown): YandexMetrikaCounter {
  if (!isRecord(value)) return invalid();
  if (!Number.isSafeInteger(value.id) || (value.id as number) <= 0) {
    return invalid();
  }
  if (
    typeof value.permission !== "string" ||
    !YANDEX_METRIKA_PERMISSIONS.includes(
      value.permission as YandexMetrikaPermission,
    )
  ) {
    return invalid();
  }

  const primarySite = siteValue(value.site2);
  return Object.freeze({
    id: value.id as number,
    name: stringValue(value.name, 255, true),
    ownerLogin: stringValue(value.owner_login, 255),
    permission: value.permission as YandexMetrikaPermission,
    status: stringValue(value.status, 64),
    source: stringValue(value.source, 64, true),
    ...(primarySite === undefined ? {} : { primarySite }),
    mirrors: mirrorValues(value.mirrors2),
  });
}

export function parseYandexMetrikaCounterPage(
  input: unknown,
  perPage: number,
): YandexMetrikaCounterPage {
  if (
    !Number.isSafeInteger(perPage) ||
    perPage < 1 ||
    perPage > 10_000 ||
    !isRecord(input) ||
    !Array.isArray(input.counters) ||
    input.counters.length > perPage ||
    !Number.isSafeInteger(input.rows) ||
    (input.rows as number) < 0 ||
    (input.rows as number) > MAX_COUNTERS
  ) {
    return invalid();
  }

  const counters: YandexMetrikaCounter[] = [];
  let rejectedCount = 0;
  for (const counter of input.counters) {
    try {
      counters.push(parseCounter(counter));
    } catch (error) {
      if (!(error instanceof YandexMetrikaError)) throw error;
      rejectedCount += 1;
    }
  }

  return Object.freeze({
    counters: Object.freeze(counters),
    rows: input.rows as number,
    receivedCount: input.counters.length,
    rejectedCount,
  });
}
