import {
  ACCESS_CLASSES,
  CapabilityRegistryError,
  MATURITY_LEVELS,
  RELEASE_STATES,
  type AccessClass,
  type CapabilityPublicationState,
  type Maturity,
  type ProductCapabilityDefinition,
  type ReleaseState,
} from "./model.js";

const DEFINITION_KEYS = [
  "slug",
  "name",
  "category",
  "description",
  "accessClass",
  "maturity",
  "publicCopyKey",
  "requiredEvidenceClass",
  "tags",
  "sortOrder",
] as const;

const PUBLICATION_KEYS = [
  "capabilitySlug",
  "releaseState",
  "publicVisible",
  "claimApproved",
  "evidenceValid",
] as const;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const KEY_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

function fail(): never {
  throw new CapabilityRegistryError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === expected.length &&
    keys.every((key) => typeof key === "string" && expected.includes(key))
  );
}

function boundedText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maximum ||
    value !== value.trim()
  ) {
    return fail();
  }
  return value;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) return fail();
  return value as T;
}

function parseTags(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length > 12) return fail();
  const tags = value.map((tag) => boundedText(tag, 48));
  if (tags.some((tag) => !SLUG_PATTERN.test(tag))) return fail();
  if (new Set(tags).size !== tags.length) return fail();
  return Object.freeze(tags);
}

function parseDefinition(value: unknown): ProductCapabilityDefinition {
  if (!isRecord(value) || !hasExactKeys(value, DEFINITION_KEYS)) return fail();

  const slug = boundedText(value.slug, 64);
  const category = boundedText(value.category, 64);
  const publicCopyKey = boundedText(value.publicCopyKey, 128);
  const requiredEvidenceClass = boundedText(value.requiredEvidenceClass, 64);
  if (
    !SLUG_PATTERN.test(slug) ||
    !SLUG_PATTERN.test(category) ||
    !KEY_PATTERN.test(publicCopyKey) ||
    !KEY_PATTERN.test(requiredEvidenceClass) ||
    !Number.isSafeInteger(value.sortOrder) ||
    (value.sortOrder as number) < 0 ||
    (value.sortOrder as number) > 10_000
  ) {
    return fail();
  }

  return Object.freeze({
    slug,
    name: boundedText(value.name, 96),
    category,
    description: boundedText(value.description, 320),
    accessClass: enumValue<AccessClass>(value.accessClass, ACCESS_CLASSES),
    maturity: enumValue<Maturity>(value.maturity, MATURITY_LEVELS),
    publicCopyKey,
    requiredEvidenceClass,
    tags: parseTags(value.tags),
    sortOrder: value.sortOrder as number,
  });
}

function parsePublication(value: unknown): CapabilityPublicationState {
  if (!isRecord(value) || !hasExactKeys(value, PUBLICATION_KEYS)) return fail();
  if (
    typeof value.publicVisible !== "boolean" ||
    typeof value.claimApproved !== "boolean" ||
    typeof value.evidenceValid !== "boolean"
  ) {
    return fail();
  }

  const capabilitySlug = boundedText(value.capabilitySlug, 64);
  if (!SLUG_PATTERN.test(capabilitySlug)) return fail();

  return Object.freeze({
    capabilitySlug,
    releaseState: enumValue<ReleaseState>(value.releaseState, RELEASE_STATES),
    publicVisible: value.publicVisible,
    claimApproved: value.claimApproved,
    evidenceValid: value.evidenceValid,
  });
}

export function validateCapabilityDefinitions(
  input: unknown,
): readonly ProductCapabilityDefinition[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) {
    return fail();
  }
  const definitions = input.map(parseDefinition);
  if (
    new Set(definitions.map(({ slug }) => slug)).size !== definitions.length
  ) {
    return fail();
  }
  if (
    new Set(definitions.map(({ sortOrder }) => sortOrder)).size !==
    definitions.length
  ) {
    return fail();
  }
  return Object.freeze(definitions);
}

export function validateCapabilityPublications(
  input: unknown,
  definitions: readonly ProductCapabilityDefinition[],
): readonly CapabilityPublicationState[] {
  if (!Array.isArray(input) || input.length !== definitions.length)
    return fail();
  const states = input.map(parsePublication);
  const known = new Set(definitions.map(({ slug }) => slug));
  const slugs = states.map(({ capabilitySlug }) => capabilitySlug);
  if (
    new Set(slugs).size !== states.length ||
    slugs.some((slug) => !known.has(slug))
  ) {
    return fail();
  }
  if (definitions.some(({ slug }) => !slugs.includes(slug))) return fail();
  return Object.freeze(states);
}
