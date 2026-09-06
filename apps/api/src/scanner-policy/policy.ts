import type { Capability, ExecutableProfile, ScannerBudgets } from "./model.js";

export const SCANNER_POLICY_IDENTITY = {
  schema_version: 1,
  policy_id: "outscan-v1",
  policy_version: "1.0.0",
} as const;

const baselineCapabilities = [
  "DNS_READ",
  "RDAP_READ",
  "PASSIVE_CT_READ",
  "TLS_HANDSHAKE",
  "HTTP_GET_HEAD",
  "SAME_HOST_REDIRECT",
  "HTTP_HEADER_OBSERVE",
  "TECH_FINGERPRINT_SAFE",
] as const satisfies readonly Capability[];

const verifiedCapabilities = [
  ...baselineCapabilities,
  "NUCLEI_SAFE_HTTP",
  "BOUNDED_SAME_ORIGIN_CRAWL",
] as const satisfies readonly Capability[];

export const ALLOWED_CAPABILITIES = {
  GUEST_SAFE: baselineCapabilities,
  VERIFIED_BASELINE: verifiedCapabilities,
  CONTROLLED_DEEP: verifiedCapabilities,
  ACTIVE: [],
} as const satisfies Record<
  ExecutableProfile | "ACTIVE",
  readonly Capability[]
>;

export const BUDGET_CEILINGS = {
  GUEST_SAFE: {
    hard_duration_seconds: 30,
    max_requests: 40,
    max_concurrency: 4,
    max_redirects: 5,
    max_response_bytes: 1_048_576,
    max_total_response_bytes: 8_388_608,
    max_output_bytes: 2_097_152,
    max_crawl_urls: 0,
  },
  VERIFIED_BASELINE: {
    hard_duration_seconds: 120,
    max_requests: 300,
    max_concurrency: 8,
    max_redirects: 5,
    max_response_bytes: 2_097_152,
    max_total_response_bytes: 67_108_864,
    max_output_bytes: 12_582_912,
    max_crawl_urls: 100,
  },
  CONTROLLED_DEEP: {
    hard_duration_seconds: 300,
    max_requests: 1_200,
    max_concurrency: 10,
    max_redirects: 5,
    max_response_bytes: 2_097_152,
    max_total_response_bytes: 201_326_592,
    max_output_bytes: 33_554_432,
    max_crawl_urls: 500,
  },
} as const satisfies Record<ExecutableProfile, ScannerBudgets>;
