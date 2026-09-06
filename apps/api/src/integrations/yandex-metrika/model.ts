export const YANDEX_METRIKA_PERMISSIONS = [
  "own",
  "edit",
  "analyst",
  "view",
  "view_access_filter",
  "analyst_access_filter",
] as const;

export type YandexMetrikaPermission =
  (typeof YANDEX_METRIKA_PERMISSIONS)[number];

export interface YandexMetrikaCounter {
  id: number;
  name: string;
  ownerLogin: string;
  permission: YandexMetrikaPermission;
  status: string;
  source: string;
  primarySite?: string;
  mirrors: readonly string[];
}

export interface YandexMetrikaCounterPage {
  counters: readonly YandexMetrikaCounter[];
  rows: number;
  receivedCount: number;
  rejectedCount: number;
}

export interface YandexMetrikaCounterSnapshot {
  counters: readonly YandexMetrikaCounter[];
  rows: number;
  rejectedCount: number;
  pagesFetched: number;
}

export type YandexMetrikaErrorCode =
  | "INVALID_CONFIGURATION"
  | "INVALID_COUNTER_RESPONSE"
  | "RESPONSE_TOO_LARGE"
  | "TOKEN_REJECTED"
  | "ACCESS_DENIED"
  | "RATE_LIMITED"
  | "UPSTREAM_REJECTED"
  | "UPSTREAM_UNAVAILABLE"
  | "REQUEST_CANCELLED"
  | "PAGINATION_INCONSISTENT";

export class YandexMetrikaError extends Error {
  constructor(readonly code: YandexMetrikaErrorCode) {
    super(code);
    this.name = "YandexMetrikaError";
  }
}
