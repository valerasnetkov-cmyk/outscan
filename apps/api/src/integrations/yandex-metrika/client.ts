import {
  YandexMetrikaError,
  type YandexMetrikaCounter,
  type YandexMetrikaCounterPage,
  type YandexMetrikaCounterSnapshot,
} from "./model.js";
import { parseYandexMetrikaCounterPage } from "./parse-counters.js";

const COUNTERS_ENDPOINT =
  "https://api-metrika.yandex.net/management/v1/counters";
const PER_PAGE = 1_000;
const MAX_PAGES = 100;
const MAX_RESPONSE_BYTES = 4 * 1_024 * 1_024;
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{20,4096}$/u;

export interface YandexMetrikaClientOptions {
  accessToken: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  requestTimeoutMs?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
}

interface ClientDependencies {
  accessToken: string;
  fetch: typeof globalThis.fetch;
  sleep: (milliseconds: number) => Promise<void>;
  random: () => number;
  requestTimeoutMs: number;
  maxAttempts: number;
  signal?: AbortSignal;
}

function configurationError(): never {
  throw new YandexMetrikaError("INVALID_CONFIGURATION");
}

function snapshotOptions(
  options: YandexMetrikaClientOptions,
): ClientDependencies {
  if (
    typeof options !== "object" ||
    options === null ||
    typeof options.accessToken !== "string" ||
    !ACCESS_TOKEN_PATTERN.test(options.accessToken) ||
    (options.fetch !== undefined && typeof options.fetch !== "function") ||
    (options.sleep !== undefined && typeof options.sleep !== "function") ||
    (options.random !== undefined && typeof options.random !== "function")
  ) {
    return configurationError();
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  const maxAttempts = options.maxAttempts ?? 3;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 100 ||
    requestTimeoutMs > 60_000 ||
    !Number.isSafeInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 5
  ) {
    return configurationError();
  }
  return {
    accessToken: options.accessToken,
    fetch: options.fetch ?? globalThis.fetch,
    sleep:
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds))),
    random: options.random ?? Math.random,
    requestTimeoutMs,
    maxAttempts,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  };
}

function retryDelay(
  response: Response | undefined,
  attempt: number,
  random: () => number,
): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter && /^\d{1,3}$/u.test(retryAfter)) {
    return Math.min(Number(retryAfter) * 1_000, 60_000);
  }
  const jitter = random();
  if (!Number.isFinite(jitter) || jitter < 0 || jitter >= 1) {
    return configurationError();
  }
  return Math.min(250 * 2 ** (attempt - 1) + Math.floor(jitter * 250), 5_000);
}

async function readPageResponse(
  response: Response,
  perPage: number,
): Promise<YandexMetrikaCounterPage> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength &&
    (/^\d+$/u.test(declaredLength) === false ||
      Number(declaredLength) > MAX_RESPONSE_BYTES)
  ) {
    throw new YandexMetrikaError("RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new YandexMetrikaError("INVALID_COUNTER_RESPONSE");
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new YandexMetrikaError("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof YandexMetrikaError) throw error;
    throw new YandexMetrikaError("INVALID_COUNTER_RESPONSE");
  } finally {
    reader.releaseLock();
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.concat(chunks, receivedBytes),
    );
  } catch {
    throw new YandexMetrikaError("INVALID_COUNTER_RESPONSE");
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new YandexMetrikaError("INVALID_COUNTER_RESPONSE");
  }
  return parseYandexMetrikaCounterPage(payload, perPage);
}

async function fetchPage(
  dependencies: ClientDependencies,
  offset: number,
): Promise<YandexMetrikaCounterPage> {
  const url = new URL(COUNTERS_ENDPOINT);
  url.searchParams.set("field", "mirrors");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("per_page", String(PER_PAGE));

  for (let attempt = 1; attempt <= dependencies.maxAttempts; attempt += 1) {
    if (dependencies.signal?.aborted) {
      throw new YandexMetrikaError("REQUEST_CANCELLED");
    }
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(),
      dependencies.requestTimeoutMs,
    );
    const signal = dependencies.signal
      ? AbortSignal.any([dependencies.signal, timeout.signal])
      : timeout.signal;
    let response: Response | undefined;
    try {
      response = await dependencies.fetch(url, {
        method: "GET",
        headers: Object.freeze({
          accept: "application/json",
          authorization: `OAuth ${dependencies.accessToken}`,
        }),
        redirect: "error",
        signal,
      });
    } catch {
      clearTimeout(timer);
      if (dependencies.signal?.aborted) {
        throw new YandexMetrikaError("REQUEST_CANCELLED");
      }
      if (attempt === dependencies.maxAttempts) {
        throw new YandexMetrikaError("UPSTREAM_UNAVAILABLE");
      }
      await dependencies.sleep(
        retryDelay(undefined, attempt, dependencies.random),
      );
      continue;
    }
    clearTimeout(timer);

    if (response.status === 200) return readPageResponse(response, PER_PAGE);
    if (response.status === 401) throw new YandexMetrikaError("TOKEN_REJECTED");
    if (response.status === 403) throw new YandexMetrikaError("ACCESS_DENIED");
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) throw new YandexMetrikaError("UPSTREAM_REJECTED");
    if (attempt === dependencies.maxAttempts) {
      throw new YandexMetrikaError(
        response.status === 429 ? "RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
      );
    }
    await dependencies.sleep(
      retryDelay(response, attempt, dependencies.random),
    );
  }
  throw new YandexMetrikaError("UPSTREAM_UNAVAILABLE");
}

export async function fetchAllYandexMetrikaCounters(
  options: YandexMetrikaClientOptions,
): Promise<YandexMetrikaCounterSnapshot> {
  const dependencies = snapshotOptions(options);
  const counters: YandexMetrikaCounter[] = [];
  const ids = new Set<number>();
  let expectedRows: number | undefined;
  let rejectedCount = 0;
  let receivedCount = 0;
  let pagesFetched = 0;

  while (expectedRows === undefined || receivedCount < expectedRows) {
    if (pagesFetched >= MAX_PAGES) {
      throw new YandexMetrikaError("PAGINATION_INCONSISTENT");
    }
    const page = await fetchPage(dependencies, receivedCount + 1);
    pagesFetched += 1;
    if (expectedRows === undefined) expectedRows = page.rows;
    if (page.rows !== expectedRows || page.receivedCount === 0) {
      if (expectedRows === 0 && page.receivedCount === 0) break;
      throw new YandexMetrikaError("PAGINATION_INCONSISTENT");
    }
    if (receivedCount + page.receivedCount > expectedRows) {
      throw new YandexMetrikaError("PAGINATION_INCONSISTENT");
    }
    for (const counter of page.counters) {
      if (ids.has(counter.id)) {
        throw new YandexMetrikaError("PAGINATION_INCONSISTENT");
      }
      ids.add(counter.id);
      counters.push(counter);
    }
    receivedCount += page.receivedCount;
    rejectedCount += page.rejectedCount;
  }

  return Object.freeze({
    counters: Object.freeze(counters),
    rows: expectedRows ?? 0,
    rejectedCount,
    pagesFetched,
  });
}
