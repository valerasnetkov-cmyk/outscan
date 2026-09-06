export const CAPABILITIES = [
  "DNS_READ",
  "RDAP_READ",
  "PASSIVE_CT_READ",
  "TLS_HANDSHAKE",
  "HTTP_GET_HEAD",
  "SAME_HOST_REDIRECT",
  "HTTP_HEADER_OBSERVE",
  "TECH_FINGERPRINT_SAFE",
  "NUCLEI_SAFE_HTTP",
  "BOUNDED_SAME_ORIGIN_CRAWL",
  "HEADLESS_BROWSER",
  "HTTP_STATE_CHANGE",
  "AUTHENTICATED_REQUEST",
  "OOB_CALLBACK",
  "JAVASCRIPT_TEMPLATE",
  "CODE_EXECUTION",
  "FUZZING",
  "BRUTE_FORCE",
  "RAW_TCP",
  "PORT_ENUMERATION",
  "PAYLOAD_GENERATION",
  "DESTRUCTIVE",
  "UNKNOWN",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const PROFILES = [
  "GUEST_SAFE",
  "VERIFIED_BASELINE",
  "CONTROLLED_DEEP",
  "ACTIVE",
] as const;

export type Profile = (typeof PROFILES)[number];
export type ExecutableProfile = Exclude<Profile, "ACTIVE">;

export const BUDGET_KEYS = [
  "hard_duration_seconds",
  "max_requests",
  "max_concurrency",
  "max_redirects",
  "max_response_bytes",
  "max_total_response_bytes",
  "max_output_bytes",
  "max_crawl_urls",
] as const;

export type BudgetKey = (typeof BUDGET_KEYS)[number];
export type ScannerBudgets = Record<BudgetKey, number>;

export interface ScannerExecutionRequest {
  schema_version: 1;
  policy_id: "outscan-v1";
  policy_version: "1.0.0";
  profile: ExecutableProfile;
  requested_capabilities: readonly Capability[];
  budgets: Readonly<ScannerBudgets>;
}

export type PolicyDenyCode =
  | "INVALID_REQUEST"
  | "POLICY_IDENTITY_MISMATCH"
  | "PROFILE_DISABLED"
  | "UNKNOWN_CAPABILITY"
  | "CAPABILITY_DENIED"
  | "BUDGET_EXCEEDED";

export type PolicyDecision =
  | {
      allowed: true;
      request: ScannerExecutionRequest;
    }
  | {
      allowed: false;
      code: PolicyDenyCode;
      message: string;
    };
