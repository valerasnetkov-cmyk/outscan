import {
  CapabilityRegistryError,
  type CapabilityPublicationState,
  type ProductCapabilityDefinition,
  type PublicCapabilitiesResponse,
  type PublicCapability,
} from "./model.js";
import {
  validateCapabilityDefinitions,
  validateCapabilityPublications,
} from "./validate.js";

export function createPublicCapabilityProjection(
  definitionsInput: unknown,
  publicationsInput: unknown,
): readonly PublicCapability[] {
  const definitions = validateCapabilityDefinitions(definitionsInput);
  const publications = validateCapabilityPublications(
    publicationsInput,
    definitions,
  );
  const publicationBySlug = new Map(
    publications.map((state) => [state.capabilitySlug, state]),
  );

  const output = definitions
    .filter((definition) => {
      const publication = publicationBySlug.get(definition.slug);
      return isPublic(definition, publication);
    })
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((definition): PublicCapability =>
      Object.freeze({
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        access: definition.accessClass as PublicCapability["access"],
        maturity: definition.maturity,
        status: "ACTIVE",
        sortOrder: definition.sortOrder,
      }),
    );

  return Object.freeze(output);
}

function isPublic(
  definition: ProductCapabilityDefinition,
  publication: CapabilityPublicationState | undefined,
): boolean {
  if (!publication) throw new CapabilityRegistryError();
  return (
    definition.accessClass !== "INTERNAL" &&
    publication.releaseState === "ACTIVE" &&
    publication.publicVisible &&
    publication.claimApproved &&
    publication.evidenceValid
  );
}

export function createPublicCapabilitiesResponse(
  capabilities: readonly PublicCapability[],
  generatedAt: Date,
): PublicCapabilitiesResponse {
  if (
    !(generatedAt instanceof Date) ||
    !Number.isFinite(generatedAt.getTime()) ||
    !Object.isFrozen(capabilities)
  ) {
    throw new CapabilityRegistryError();
  }
  return Object.freeze({
    data: capabilities,
    meta: Object.freeze({
      schemaVersion: 1,
      generatedAt: generatedAt.toISOString(),
    }),
  });
}
