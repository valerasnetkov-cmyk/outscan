import { describe, expect, it } from "vitest";
import {
  CapabilityRegistryError,
  V1_CAPABILITY_DEFINITIONS,
  V1_CAPABILITY_PUBLICATIONS,
  createPublicCapabilityProjection,
  getV1PublicCapabilities,
  validateCapabilityDefinitions,
} from "../src/index.js";

function cloneDefinitions(): Record<string, unknown>[] {
  return V1_CAPABILITY_DEFINITIONS.map((definition) => ({
    ...definition,
    tags: [...definition.tags],
  }));
}

function clonePublications(): Record<string, unknown>[] {
  return V1_CAPABILITY_PUBLICATIONS.map((publication) => ({ ...publication }));
}

describe("ProductCapability registry", () => {
  it("loads the nine canonical V1 definitions", () => {
    const definitions = validateCapabilityDefinitions(
      V1_CAPABILITY_DEFINITIONS,
    );
    expect(definitions).toHaveLength(9);
    expect(definitions.map(({ slug }) => slug)).toEqual([
      "domain-security",
      "tls-https",
      "email-security",
      "web-security",
      "infrastructure",
      "technology-detection",
      "attack-surface-discovery",
      "vulnerability-detection",
      "threat-intelligence",
    ]);
  });

  it.each([
    [
      "duplicate slug",
      (definitions: Record<string, unknown>[]) => {
        definitions[1]!.slug = definitions[0]!.slug;
      },
    ],
    [
      "invalid slug",
      (definitions: Record<string, unknown>[]) => {
        definitions[0]!.slug = "Domain Security";
      },
    ],
    [
      "unknown access class",
      (definitions: Record<string, unknown>[]) => {
        definitions[0]!.accessClass = "SCAN_ANYTHING";
      },
    ],
    [
      "unknown maturity",
      (definitions: Record<string, unknown>[]) => {
        definitions[0]!.maturity = "PRODUCTION";
      },
    ],
    [
      "missing public copy",
      (definitions: Record<string, unknown>[]) => {
        definitions[0]!.description = "";
      },
    ],
    [
      "scanner permission field",
      (definitions: Record<string, unknown>[]) => {
        definitions[0]!.scannerCommand = "nuclei";
      },
    ],
  ])("rejects %s", (_label, mutate) => {
    const definitions = cloneDefinitions();
    mutate(definitions);
    expect(() => validateCapabilityDefinitions(definitions)).toThrow(
      CapabilityRegistryError,
    );
  });

  it("keeps stable identity independent from the display name", () => {
    const definitions = cloneDefinitions();
    definitions[0]!.name = "Domain posture";
    expect(validateCapabilityDefinitions(definitions)[0]?.slug).toBe(
      "domain-security",
    );
  });
});

describe("public capability projection", () => {
  it("publishes nothing before claim and production evidence approval", () => {
    expect(getV1PublicCapabilities()).toEqual([]);
  });

  it("includes only active, visible, approved and evidenced capabilities", () => {
    const publications = clonePublications();
    Object.assign(publications[0]!, {
      releaseState: "ACTIVE",
      claimApproved: true,
      evidenceValid: true,
    });
    const projected = createPublicCapabilityProjection(
      V1_CAPABILITY_DEFINITIONS,
      publications,
    );
    expect(projected).toEqual([
      {
        slug: "domain-security",
        name: "Domain Security",
        description: "Состояние DNS, DNSSEC, CAA и базовых настроек домена.",
        access: "PUBLIC_SAFE",
        maturity: "BETA",
        status: "ACTIVE",
        sortOrder: 10,
      },
    ]);
    expect(Object.keys(projected[0] ?? {})).toEqual([
      "slug",
      "name",
      "description",
      "access",
      "maturity",
      "status",
      "sortOrder",
    ]);
  });

  it.each([
    ["PLANNED", true, true, true],
    ["DEVELOPMENT", true, true, true],
    ["STAGING", true, true, true],
    ["VALIDATED", true, true, true],
    ["DEPRECATED", true, true, true],
    ["RETIRED", true, true, true],
    ["ACTIVE", false, true, true],
    ["ACTIVE", true, false, true],
    ["ACTIVE", true, true, false],
  ])(
    "excludes status=%s visible=%s claim=%s evidence=%s",
    (releaseState, publicVisible, claimApproved, evidenceValid) => {
      const publications = clonePublications();
      Object.assign(publications[0]!, {
        releaseState,
        publicVisible,
        claimApproved,
        evidenceValid,
      });
      expect(
        createPublicCapabilityProjection(
          V1_CAPABILITY_DEFINITIONS,
          publications,
        ),
      ).toEqual([]);
    },
  );

  it("rejects unknown or incomplete rollout metadata", () => {
    const publications = clonePublications();
    publications[0]!.capabilitySlug = "unknown-capability";
    expect(() =>
      createPublicCapabilityProjection(V1_CAPABILITY_DEFINITIONS, publications),
    ).toThrow(CapabilityRegistryError);
  });

  it("rejects an unknown release state", () => {
    const publications = clonePublications();
    publications[0]!.releaseState = "PUBLIC";
    expect(() =>
      createPublicCapabilityProjection(V1_CAPABILITY_DEFINITIONS, publications),
    ).toThrow(CapabilityRegistryError);
  });

  it("never projects an internal capability", () => {
    const definitions = cloneDefinitions();
    definitions[0]!.accessClass = "INTERNAL";
    const publications = clonePublications();
    Object.assign(publications[0]!, {
      releaseState: "ACTIVE",
      claimApproved: true,
      evidenceValid: true,
    });
    expect(createPublicCapabilityProjection(definitions, publications)).toEqual(
      [],
    );
  });

  it("uses explicit sort order instead of input order", () => {
    const publications = clonePublications();
    for (const publication of publications.slice(0, 2)) {
      Object.assign(publication, {
        releaseState: "ACTIVE",
        claimApproved: true,
        evidenceValid: true,
      });
    }
    expect(
      createPublicCapabilityProjection(
        [...V1_CAPABILITY_DEFINITIONS].reverse(),
        publications,
      ).map(({ slug }) => slug),
    ).toEqual(["domain-security", "tls-https"]);
  });
});
