import { canonicalizeHostname } from "../target/index.js";
import { NotificationError } from "./model.js";
import { isExactRecord } from "./validation.js";

const HEADLINES = [
  "ACCOUNT_ACTION_REQUIRED",
  "SECURITY_RISK_DETECTED",
  "MONITORING_ATTENTION_REQUIRED",
  "PLATFORM_ATTENTION_REQUIRED",
] as const;
const ACTIONS = ["OPEN_OUTSCAN", "VERIFY_EMAIL", "REVIEW_SECURITY"] as const;
const RISK_LEVELS = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "NONE"] as const;
const STATUS_CODES = [
  "NEW",
  "REOPENED",
  "DEGRADED",
  "FAILED",
  "PENDING",
] as const;
const SAFE_PATH = /^\/(?:[a-z0-9_-]+\/?){1,12}$/u;

export interface ExternalNotificationContent {
  headline: (typeof HEADLINES)[number];
  assetHostname?: string;
  risk: (typeof RISK_LEVELS)[number];
  status: (typeof STATUS_CODES)[number];
  action: (typeof ACTIONS)[number];
  actionUrl: string;
}

function invalid(): never {
  throw new NotificationError("INVALID_CONTENT");
}

export function createExternalNotificationContent(
  input: unknown,
): ExternalNotificationContent {
  const required = ["headline", "risk", "status", "action", "path"];
  const keys =
    typeof input === "object" &&
    input !== null &&
    Object.hasOwn(input, "assetHostname")
      ? [...required, "assetHostname"]
      : required;
  if (!isExactRecord(input, keys)) return invalid();
  if (
    typeof input.headline !== "string" ||
    !HEADLINES.includes(input.headline as (typeof HEADLINES)[number]) ||
    typeof input.risk !== "string" ||
    !RISK_LEVELS.includes(input.risk as (typeof RISK_LEVELS)[number]) ||
    typeof input.status !== "string" ||
    !STATUS_CODES.includes(input.status as (typeof STATUS_CODES)[number]) ||
    typeof input.action !== "string" ||
    !ACTIONS.includes(input.action as (typeof ACTIONS)[number]) ||
    typeof input.path !== "string" ||
    !SAFE_PATH.test(input.path)
  ) {
    return invalid();
  }
  let assetHostname: string | undefined;
  if (Object.hasOwn(input, "assetHostname")) {
    const normalized = canonicalizeHostname(input.assetHostname);
    if (!normalized.ok || normalized.canonical_host !== input.assetHostname) {
      return invalid();
    }
    assetHostname = normalized.canonical_host;
  }
  return Object.freeze({
    headline: input.headline as ExternalNotificationContent["headline"],
    ...(assetHostname === undefined ? {} : { assetHostname }),
    risk: input.risk as ExternalNotificationContent["risk"],
    status: input.status as ExternalNotificationContent["status"],
    action: input.action as ExternalNotificationContent["action"],
    actionUrl: new URL(input.path, "https://outscan.ru").toString(),
  });
}
