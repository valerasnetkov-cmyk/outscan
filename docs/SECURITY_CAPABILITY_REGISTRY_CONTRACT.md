# OUTSCAN Security Capability Registry Contract

**Status:** Implementation contract
**Depends on:** `SECURITY_CAPABILITY_REGISTRY.md`
**Canonical API integration:** merge public route into `docs/API_CONTRACT.md` during implementation

## 1. Purpose

This document defines the minimal data and API contract for the product-level Security Capability Registry.

It intentionally does not define scanner execution permissions. Scanner execution remains governed by scanner policy, profile policy, verified scope, entitlement, consent and `ScanAuthorization`.

## 2. Stable identifiers

Capability identifiers use lowercase kebab-case slugs.

Examples:

```text
domain-security
tls-https
email-security
web-security
infrastructure
technology-detection
attack-surface-discovery
vulnerability-detection
threat-intelligence
```

Rules:

- slug is unique;
- slug is immutable after public release unless migrated explicitly;
- display name may change without changing slug;
- unknown slug fails closed for privileged/internal operations.

## 3. Canonical enums

### Access class

```text
PUBLIC_SAFE
VERIFIED
CONTROLLED
SYSTEM
INTERNAL
```

### Release state

```text
PLANNED
DEVELOPMENT
STAGING
VALIDATED
ACTIVE
DEPRECATED
RETIRED
```

### Maturity

```text
EXPERIMENTAL
BETA
STABLE
```

Maturity is presentation metadata only and cannot grant execution rights.

## 4. Product capability definition

Logical schema:

```text
ProductCapabilityDefinition
- slug: string
- name: string
- category: string
- description: string
- access_class: enum
- maturity: enum
- public_copy_key: string
- required_evidence_class: string
- tags: string[]
```

Validation requirements:

- reject duplicate slugs;
- reject missing public copy for public-visible capability;
- reject unsupported enum values;
- reject internal implementation details from public copy fields;
- reject capability definition that attempts to declare scanner execution permissions.

## 5. Operational rollout

Logical schema:

```text
CapabilityRollout
- capability_slug
- release_state
- public_visible
- maturity_override: optional
- released_at: optional
- last_validated_at: optional
- validation_evidence_ref: optional
- updated_at
- updated_by
```

Code definition remains the identity/source for immutable capability semantics.

Runtime rollout may only narrow availability relative to code/policy.

## 6. Engine binding

Logical schema:

```text
EngineBinding
- capability_slug
- engine_id
- role
- enabled
- min_approved_version: optional
- notes: optional
```

Suggested roles:

```text
DETECTOR
DISCOVERY
ENRICHMENT
THREAT_INTEL
POSTURE
```

Engine binding is descriptive/operational metadata, not authorization.

## 7. Public endpoint

Recommended route:

```text
GET /v1/public/capabilities
```

No authentication is required.

The endpoint returns only safe public projection data.

Example response shape:

```json
{
  "data": [
    {
      "slug": "domain-security",
      "name": "Domain Security",
      "description": "DNS, DNSSEC, CAA and domain security posture.",
      "access": "PUBLIC_SAFE",
      "maturity": "STABLE",
      "status": "ACTIVE",
      "sortOrder": 10
    }
  ],
  "meta": {
    "schemaVersion": 1,
    "generatedAt": "2026-09-04T00:00:00Z"
  }
}
```

`generatedAt` is metadata generation time, not a claim that all upstream threat sources were updated at that exact moment.

## 8. Public filtering

A capability is returned only when all applicable conditions are true:

```text
code definition exists
AND rollout.release_state = ACTIVE
AND rollout.public_visible = true
AND public claim is approved
AND required production evidence is valid
```

If rollout storage is not introduced yet, first code-first implementation may represent approved production state in version-controlled configuration.

## 9. Forbidden public fields

Public response must never include:

```text
scanner_command
template_id
template_digest
workflow_id
workflow_digest
worker_image
worker_image_digest
policy_rule
policy_version_detail
scan_budget
authorization_context
internal_evidence_ref
secret_ref
credential_ref
staging_only metadata
```

The implementation should use an explicit allow-list serializer rather than object spreading from internal models.

## 10. Ordering

Public ordering is explicit and deterministic.

Recommended field:

`sortOrder`

Do not derive order from database insertion time, engine order or scanner severity.

## 11. Caching

Public endpoint may support:

- server-side cache;
- CDN cache;
- ETag;
- short stale-while-revalidate behavior if supported safely.

Requirements:

- cache contains only public projection;
- invalidation occurs on public rollout change;
- no authenticated/internal data is mixed into the same cache key;
- errors must not fall back to a raw internal payload.

## 12. Error behavior

On registry validation failure:

- fail the public projection generation closed;
- do not publish partially validated internal data;
- return a controlled service response;
- record an operational error without sensitive payloads.

Homepage behavior may use an approved build-time snapshot from the same canonical registry.

## 13. Future internal endpoints

Possible future read-only Platform Admin route:

```text
GET /v1/platform/capabilities
```

It requires platform authorization and must be implemented under the existing admin policy boundary.

Possible future rollout mutation endpoints must not be added until:

- Platform Admin authz is implemented;
- privileged actions are audited;
- transition rules are server-enforced;
- changes cannot mutate scanner policy;
- rollback behavior is defined.

## 14. Finding/coverage reference

Normalized records may include:

```text
product_capability_slug
```

This is presentation/grouping metadata.

Required detector/profile/version/fingerprint/coverage provenance remains separate and authoritative for security state.

## 15. Versioning

Public response contains `schemaVersion`.

Breaking response changes require:

- documented migration;
- compatibility window when external API consumers exist;
- update to `docs/API_CONTRACT.md`;
- tests for old/new behavior where applicable.

## 16. Acceptance criteria

- endpoint returns only active, approved, public capabilities;
- staging/planned/internal capabilities never appear;
- internal fields cannot be serialized accidentally;
- stable ordering is deterministic;
- invalid registry fails closed;
- no request to this endpoint can cause a scan or mutate platform state;
- no registry field can bypass server-side authorization or scanner policy.
