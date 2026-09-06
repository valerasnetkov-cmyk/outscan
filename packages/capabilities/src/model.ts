export const ACCESS_CLASSES = [
  "PUBLIC_SAFE",
  "VERIFIED",
  "CONTROLLED",
  "SYSTEM",
  "INTERNAL",
] as const;

export type AccessClass = (typeof ACCESS_CLASSES)[number];

export const RELEASE_STATES = [
  "PLANNED",
  "DEVELOPMENT",
  "STAGING",
  "VALIDATED",
  "ACTIVE",
  "DEPRECATED",
  "RETIRED",
] as const;

export type ReleaseState = (typeof RELEASE_STATES)[number];

export const MATURITY_LEVELS = ["EXPERIMENTAL", "BETA", "STABLE"] as const;

export type Maturity = (typeof MATURITY_LEVELS)[number];

export interface ProductCapabilityDefinition {
  slug: string;
  name: string;
  category: string;
  description: string;
  accessClass: AccessClass;
  maturity: Maturity;
  publicCopyKey: string;
  requiredEvidenceClass: string;
  tags: readonly string[];
  sortOrder: number;
}

export interface CapabilityPublicationState {
  capabilitySlug: string;
  releaseState: ReleaseState;
  publicVisible: boolean;
  claimApproved: boolean;
  evidenceValid: boolean;
}

export interface PublicCapability {
  slug: string;
  name: string;
  description: string;
  access: Exclude<AccessClass, "INTERNAL">;
  maturity: Maturity;
  status: "ACTIVE";
  sortOrder: number;
}

export interface PublicCapabilitiesResponse {
  data: readonly PublicCapability[];
  meta: {
    schemaVersion: 1;
    generatedAt: string;
  };
}

export class CapabilityRegistryError extends Error {
  readonly code = "CAPABILITY_REGISTRY_INVALID";

  constructor() {
    super("Capability registry validation failed");
    this.name = "CapabilityRegistryError";
  }
}
