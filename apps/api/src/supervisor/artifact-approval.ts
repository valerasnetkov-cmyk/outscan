import type {
  ScannerArtifactIdentity,
  ScannerTemplateApproval,
} from "./model.js";

const ARTIFACT_KEYS = [
  "template_workflow_digest",
  "transitive_dependency_digests",
  "engine_version",
  "scanner_image_digest",
  "config_version",
  "policy_id",
  "policy_version",
  "profile",
] as const;

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    actual.every((key) => expected.includes(key))
  );
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && VERSION_PATTERN.test(value);
}

export function parseArtifactIdentity(
  value: unknown,
): ScannerArtifactIdentity | null {
  if (!isRecord(value) || !hasExactKeys(value, ARTIFACT_KEYS)) return null;

  const dependencyDigests = value.transitive_dependency_digests;
  if (
    !Array.isArray(dependencyDigests) ||
    dependencyDigests.length > 256 ||
    !dependencyDigests.every(
      (digest) => typeof digest === "string" && SHA256_PATTERN.test(digest),
    ) ||
    new Set(dependencyDigests).size !== dependencyDigests.length
  ) {
    return null;
  }

  if (
    typeof value.template_workflow_digest !== "string" ||
    !SHA256_PATTERN.test(value.template_workflow_digest) ||
    typeof value.scanner_image_digest !== "string" ||
    !SHA256_PATTERN.test(value.scanner_image_digest) ||
    !isVersion(value.engine_version) ||
    !isVersion(value.config_version) ||
    !isVersion(value.policy_id) ||
    !isVersion(value.policy_version) ||
    !isVersion(value.profile)
  ) {
    return null;
  }

  return {
    template_workflow_digest: value.template_workflow_digest,
    transitive_dependency_digests: Object.freeze(
      [...dependencyDigests].sort(),
    ) as unknown as string[],
    engine_version: value.engine_version,
    scanner_image_digest: value.scanner_image_digest,
    config_version: value.config_version,
    policy_id: value.policy_id,
    policy_version: value.policy_version,
    profile: value.profile,
  };
}

export function matchesApproval(
  artifact: ScannerArtifactIdentity,
  approval: ScannerTemplateApproval,
): boolean {
  const approved = parseArtifactIdentity(approval.artifact_identity);
  if (!approved) return false;

  return (
    artifact.template_workflow_digest === approved.template_workflow_digest &&
    artifact.engine_version === approved.engine_version &&
    artifact.scanner_image_digest === approved.scanner_image_digest &&
    artifact.config_version === approved.config_version &&
    artifact.policy_id === approved.policy_id &&
    artifact.policy_version === approved.policy_version &&
    artifact.profile === approved.profile &&
    artifact.transitive_dependency_digests.length ===
      approved.transitive_dependency_digests.length &&
    artifact.transitive_dependency_digests.every(
      (digest, index) =>
        digest === approved.transitive_dependency_digests[index],
    )
  );
}
