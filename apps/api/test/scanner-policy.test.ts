import { describe, expect, it } from "vitest";
import {
  V1_CAPABILITY_DEFINITIONS,
  V1_CAPABILITY_PUBLICATIONS,
  createPublicCapabilityProjection,
} from "@outscan/capabilities";

import {
  ALLOWED_CAPABILITIES,
  BUDGET_CEILINGS,
  BUDGET_KEYS,
  CAPABILITIES,
  PROFILES,
  authorizeScannerExecution,
  isCapabilityAllowed,
  type ExecutableProfile,
} from "../src/scanner-policy/index.js";

function validRequest(profile: ExecutableProfile = "GUEST_SAFE") {
  return {
    schema_version: 1,
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile,
    requested_capabilities: [...ALLOWED_CAPABILITIES[profile]],
    budgets: { ...BUDGET_CEILINGS[profile] },
  };
}

describe("scanner policy", () => {
  it.each(["GUEST_SAFE", "VERIFIED_BASELINE", "CONTROLLED_DEEP"] as const)(
    "allows the canonical %s workflow",
    (profile) => {
      expect(authorizeScannerExecution(validRequest(profile))).toEqual({
        allowed: true,
        request: validRequest(profile),
      });
    },
  );

  it("denies unknown request fields", () => {
    const request = { ...validRequest(), consent: true };

    expect(authorizeScannerExecution(request)).toMatchObject({
      allowed: false,
      code: "INVALID_REQUEST",
    });
  });

  it("denies unknown capability values", () => {
    const request = {
      ...validRequest(),
      requested_capabilities: ["DNS_READ", "NEW_UNREVIEWED_CAPABILITY"],
    };

    expect(authorizeScannerExecution(request)).toMatchObject({
      allowed: false,
      code: "UNKNOWN_CAPABILITY",
    });
  });

  it("denies duplicate capability values", () => {
    const request = {
      ...validRequest(),
      requested_capabilities: ["DNS_READ", "DNS_READ"],
    };

    expect(authorizeScannerExecution(request)).toMatchObject({
      allowed: false,
      code: "INVALID_REQUEST",
    });
  });

  it("enforces the complete profile matrix", () => {
    for (const profile of PROFILES) {
      for (const capability of CAPABILITIES) {
        expect(isCapabilityAllowed(profile, capability)).toBe(
          ALLOWED_CAPABILITIES[profile].includes(capability as never),
        );
      }
    }
  });

  it.each(PROFILES)("denies HEADLESS_BROWSER for %s", (profile) => {
    expect(isCapabilityAllowed(profile, "HEADLESS_BROWSER")).toBe(false);
  });

  it("denies ACTIVE even with no capabilities", () => {
    const request = {
      ...validRequest(),
      profile: "ACTIVE",
      requested_capabilities: [],
    };

    expect(authorizeScannerExecution(request)).toMatchObject({
      allowed: false,
      code: "PROFILE_DISABLED",
    });
  });

  it("denies a known capability outside the selected profile", () => {
    const request = {
      ...validRequest(),
      requested_capabilities: ["NUCLEI_SAFE_HTTP"],
    };

    expect(authorizeScannerExecution(request)).toMatchObject({
      allowed: false,
      code: "CAPABILITY_DENIED",
    });
  });

  it("does not treat public ProductCapability state as execution authority", () => {
    const publications = V1_CAPABILITY_PUBLICATIONS.map((publication) => ({
      ...publication,
      releaseState: "ACTIVE" as const,
      publicVisible: true,
      claimApproved: true,
      evidenceValid: true,
    }));

    expect(
      createPublicCapabilityProjection(V1_CAPABILITY_DEFINITIONS, publications),
    ).toHaveLength(9);
    expect(isCapabilityAllowed("GUEST_SAFE", "NUCLEI_SAFE_HTTP")).toBe(false);
    expect(isCapabilityAllowed("GUEST_SAFE", "RAW_TCP")).toBe(false);
    expect(isCapabilityAllowed("GUEST_SAFE", "UNKNOWN")).toBe(false);
  });

  it.each(BUDGET_KEYS)("denies an exceeded %s budget", (key) => {
    const request = validRequest();
    const budgets = {
      ...request.budgets,
      [key]: request.budgets[key] + 1,
    };

    expect(authorizeScannerExecution({ ...request, budgets })).toMatchObject({
      allowed: false,
      code: "BUDGET_EXCEEDED",
    });
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["string", "1"],
  ])("denies a %s budget value", (_label, value) => {
    const request = validRequest();
    const budgets = { ...request.budgets, max_requests: value };

    expect(authorizeScannerExecution({ ...request, budgets })).toMatchObject({
      allowed: false,
      code: "INVALID_REQUEST",
    });
  });

  it("denies missing or unknown budget fields", () => {
    const request = validRequest();
    const missingBudget: Record<string, number> = { ...request.budgets };
    delete missingBudget.max_requests;
    const extraBudget = { ...request.budgets, max_dns_queries: 10 };

    expect(
      authorizeScannerExecution({ ...request, budgets: missingBudget }),
    ).toMatchObject({ allowed: false, code: "INVALID_REQUEST" });
    expect(
      authorizeScannerExecution({ ...request, budgets: extraBudget }),
    ).toMatchObject({ allowed: false, code: "INVALID_REQUEST" });
  });

  it.each([
    ["schema_version", 2],
    ["policy_id", "outscan-v2"],
    ["policy_version", "1.0.1"],
  ])("denies mismatched %s", (field, value) => {
    const request = { ...validRequest(), [field]: value };

    expect(authorizeScannerExecution(request)).toMatchObject({
      allowed: false,
      code: "POLICY_IDENTITY_MISMATCH",
    });
  });
});
