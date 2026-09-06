import {
  BUDGET_KEYS,
  CAPABILITIES,
  PROFILES,
  type Capability,
  type ExecutableProfile,
  type PolicyDecision,
  type Profile,
  type ScannerBudgets,
  type ScannerExecutionRequest,
} from "./model.js";
import {
  ALLOWED_CAPABILITIES,
  BUDGET_CEILINGS,
  SCANNER_POLICY_IDENTITY,
} from "./policy.js";

const REQUEST_KEYS = [
  "schema_version",
  "policy_id",
  "policy_version",
  "profile",
  "requested_capabilities",
  "budgets",
] as const;

const capabilitySet = new Set<string>(CAPABILITIES);
const profileSet = new Set<string>(PROFILES);

function deny(
  code: Exclude<PolicyDecision, { allowed: true }>["code"],
  message: string,
): PolicyDecision {
  return { allowed: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === expected.length &&
      actual.every((key) => typeof key === "string" && expected.includes(key))
    );
  } catch {
    return false;
  }
}

function isProfile(value: unknown): value is Profile {
  return typeof value === "string" && profileSet.has(value);
}

function parseCapabilities(
  value: unknown,
): { capabilities: readonly Capability[] } | PolicyDecision {
  if (!Array.isArray(value)) {
    return deny("INVALID_REQUEST", "Capability list must contain strings.");
  }
  const snapshot: string[] = [];
  try {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        return deny("INVALID_REQUEST", "Capability list must be dense.");
      }
      const item: unknown = value[index];
      if (typeof item !== "string") {
        return deny("INVALID_REQUEST", "Capability list must contain strings.");
      }
      snapshot.push(item);
    }
  } catch {
    return deny("INVALID_REQUEST", "Capability list is invalid.");
  }
  if (new Set(snapshot).size !== snapshot.length) {
    return deny("INVALID_REQUEST", "Capability list contains duplicates.");
  }
  if (!snapshot.every((item) => capabilitySet.has(item))) {
    return deny("UNKNOWN_CAPABILITY", "Unknown capability is denied.");
  }
  return { capabilities: Object.freeze(snapshot as Capability[]) };
}

function parseBudgets(
  value: unknown,
): { budgets: Readonly<ScannerBudgets> } | PolicyDecision {
  if (!isRecord(value) || !hasExactKeys(value, BUDGET_KEYS)) {
    return deny(
      "INVALID_REQUEST",
      "Budget object must use the V1 fields only.",
    );
  }

  const snapshot = {} as ScannerBudgets;
  try {
    for (const key of BUDGET_KEYS) {
      const budget = value[key];
      if (!Number.isSafeInteger(budget) || (budget as number) < 0) {
        return deny(
          "INVALID_REQUEST",
          "Budget values must be non-negative integers.",
        );
      }
      snapshot[key] = budget as number;
    }
  } catch {
    return deny("INVALID_REQUEST", "Budget object is invalid.");
  }

  return { budgets: Object.freeze(snapshot) };
}

export function isCapabilityAllowed(
  profile: Profile,
  capability: string,
): boolean {
  return (
    capabilitySet.has(capability) &&
    ALLOWED_CAPABILITIES[profile].some((allowed) => allowed === capability)
  );
}

export function authorizeScannerExecution(input: unknown): PolicyDecision {
  if (!isRecord(input) || !hasExactKeys(input, REQUEST_KEYS)) {
    return deny("INVALID_REQUEST", "Execution request shape is invalid.");
  }

  if (
    input.schema_version !== SCANNER_POLICY_IDENTITY.schema_version ||
    input.policy_id !== SCANNER_POLICY_IDENTITY.policy_id ||
    input.policy_version !== SCANNER_POLICY_IDENTITY.policy_version
  ) {
    return deny("POLICY_IDENTITY_MISMATCH", "Policy identity is not current.");
  }

  if (!isProfile(input.profile)) {
    return deny("INVALID_REQUEST", "Scanner profile is unknown.");
  }

  if (input.profile === "ACTIVE") {
    return deny("PROFILE_DISABLED", "ACTIVE is disabled in V1.");
  }

  const capabilities = parseCapabilities(input.requested_capabilities);
  if ("allowed" in capabilities) return capabilities;

  if (
    capabilities.capabilities.some(
      (capability) =>
        !isCapabilityAllowed(input.profile as Profile, capability),
    )
  ) {
    return deny("CAPABILITY_DENIED", "Requested capability is denied.");
  }

  const parsedBudgets = parseBudgets(input.budgets);
  if ("allowed" in parsedBudgets) return parsedBudgets;

  const profile = input.profile as ExecutableProfile;
  const ceiling = BUDGET_CEILINGS[profile];
  if (BUDGET_KEYS.some((key) => parsedBudgets.budgets[key] > ceiling[key])) {
    return deny("BUDGET_EXCEEDED", "Requested budget exceeds its V1 ceiling.");
  }

  const request: ScannerExecutionRequest = Object.freeze({
    schema_version: 1,
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile,
    requested_capabilities: capabilities.capabilities,
    budgets: parsedBudgets.budgets,
  });

  return { allowed: true, request };
}
