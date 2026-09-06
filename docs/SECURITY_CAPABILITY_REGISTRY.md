# OUTSCAN Security Capability Registry

**Status:** Implementation specification
**Scope:** Product/public capability catalog
**Target stage:** After Gate A PASS, starting with the first meaningful source scaffold
**Owner:** Product + Architecture
**Security dependency:** ADR-0012 scanner capability policy remains authoritative for execution safety

## 1. Purpose

Security Capability Registry is the single product-level catalog of security capabilities that OUTSCAN can expose in the public site, Workspace, tariffs, reports and Platform Admin.

The registry answers:

- what OUTSCAN can currently do;
- which capability is available publicly or only after verification;
- whether the capability is planned, beta, active or deprecated;
- which engines or data sources support the capability;
- whether the capability may be displayed in public product surfaces.

The registry does **not** authorize a scan and does not replace scanner policy, `VerifiedScope`, `ScanAuthorization`, entitlement or consent checks.

## 2. Critical terminology separation

OUTSCAN has two different concepts that must never be merged.

### Product capability

User-facing product concept, for example:

- Domain Security;
- TLS / HTTPS;
- Email Security;
- Infrastructure;
- Technology Detection;
- Attack Surface Discovery;
- Vulnerability Detection;
- Threat Intelligence.

Canonical technical name:

`ProductCapability`

Public/product name:

`Security Capability`

### Scanner capability

Machine-level execution permission controlled by ADR-0012 and scanner policy-as-code.

Examples include protocol/method/template behavior, headless mode, code execution, OOB, fuzzing, raw TCP and other execution characteristics.

Canonical technical name:

`ScannerCapability`

`ProductCapability` must never grant, infer or mutate `ScannerCapability` permissions.

## 3. Security invariants

1. Registry state cannot authorize a scan.
2. Public visibility cannot expand `VerifiedScope`.
3. Public visibility cannot bypass `ScanAuthorization`.
4. Public visibility cannot enable `CONTROLLED_DEEP`, `ACTIVE`, IP/CIDR or raw TCP scanning.
5. Scanner policy is deny-by-default and remains authoritative.
6. Unknown scanner capability remains `DENY` regardless of registry state.
7. A capability may be visible only when its public claim is supported by production evidence.
8. Upstream engine/template updates do not automatically publish new OUTSCAN capabilities.
9. Disabling a capability does not delete historical findings, coverage or reports.
10. Public API never exposes internal scanner commands, template identifiers, bundle digests, worker images, internal policy rules or secret configuration.

## 4. Initial V1 catalog

| Slug                       | Public name              | Access class  | Initial public visibility |
| -------------------------- | ------------------------ | ------------- | ------------------------- |
| `domain-security`          | Domain Security          | `PUBLIC_SAFE` | yes                       |
| `tls-https`                | TLS / HTTPS              | `PUBLIC_SAFE` | yes                       |
| `email-security`           | Email Security           | `PUBLIC_SAFE` | yes                       |
| `web-security`             | Web Security             | `PUBLIC_SAFE` | yes                       |
| `infrastructure`           | Infrastructure           | `PUBLIC_SAFE` | yes                       |
| `technology-detection`     | Technology Detection     | `PUBLIC_SAFE` | yes                       |
| `attack-surface-discovery` | Attack Surface Discovery | `VERIFIED`    | yes                       |
| `vulnerability-detection`  | Vulnerability Detection  | `VERIFIED`    | yes                       |
| `threat-intelligence`      | Threat Intelligence      | `SYSTEM`      | yes                       |

The table describes product availability only. It does not change existing V1 scanning restrictions.

## 5. Access classes

### `PUBLIC_SAFE`

Capability has a useful Guest-safe representation and can be described on the public site.

Runtime execution still uses the `GUEST_SAFE` profile and all existing target/SSRF/budget controls.

### `VERIFIED`

Capability requires a currently valid verified scope and applicable server-side scan authorization.

Public site may describe the capability, but execution remains unavailable until verification and authorization succeed.

### `CONTROLLED`

Capability requires verified scope plus explicit consent and profile policy.

Do not use this access class to weaken or bypass `CONTROLLED_DEEP` rules.

### `SYSTEM`

Capability is a platform service rather than a directly user-triggered scanner, for example Threat Intelligence enrichment.

### `INTERNAL`

Capability exists only for platform operations and is not exposed to customer/public surfaces.

## 6. Release states

Canonical lifecycle:

```text
PLANNED
  -> DEVELOPMENT
  -> STAGING
  -> VALIDATED
  -> ACTIVE
  -> DEPRECATED
  -> RETIRED
```

Rules:

- `PLANNED` and `DEVELOPMENT` are not publicly visible by default;
- `STAGING` cannot be consumed by production public API;
- `VALIDATED` means required tests/evidence passed but production activation has not yet occurred;
- `ACTIVE` may be publicly visible if `public_visible=true` and claims are approved;
- `DEPRECATED` remains queryable for historical compatibility but should not be promoted;
- `RETIRED` cannot be selected for new scans or new product enrollment.

A separate explicit `BETA` label may be represented as a maturity field, not as an execution permission.

## 7. Canonical code-first definition

For the first implementation, stable capability identity and security-relevant metadata are version controlled.

Recommended logical shape:

```text
ProductCapabilityDefinition
- slug
- name
- category
- description
- access_class
- maturity
- public_copy_key
- required_evidence_class
- tags[]
```

Do not store scanner permission logic in this definition.

Recommended initial module boundary:

```text
packages/
  capabilities/
    definitions/
    registry/
    public-projection/
    engine-bindings/
    types/
```

Exact framework paths may be adjusted to the accepted scaffold, but responsibilities must stay separated.

## 8. Operational state

After the Platform Admin and database foundation exist, runtime rollout state may be stored separately from the code-first definition.

Logical entity:

`CapabilityRollout`

Suggested fields:

```text
capability_slug
release_state
public_visible
maturity
released_at
last_validated_at
validation_evidence_ref
updated_at
updated_by
```

Security rule:

Database state may reduce availability or visibility, but must not create scanner permissions that are absent from code/policy.

Effective public capability is therefore an intersection:

```text
code definition
AND production rollout state
AND approved claim state
AND required production evidence
```

## 9. Engine bindings

A product capability can be supported by zero, one or multiple engines/data sources.

Logical relationship:

```text
ProductCapability
  <-> EngineBinding
  <-> EngineInventory
```

Examples:

```text
Attack Surface Discovery
  -> passive CT source
  -> Subfinder
  -> httpx enrichment

Vulnerability Detection
  -> approved Nuclei profile

Threat Intelligence
  -> NVD
  -> CISA KEV
  -> FIRST EPSS
```

Bindings are descriptive and operational metadata. They are not scan authorization.

## 10. Engine inventory boundary

Engine Inventory tracks production operational state such as:

- engine identifier;
- deployed version;
- approved bundle/image version;
- latest observed upstream version;
- health/status;
- last update check;
- last validation;
- production approval reference.

The public site should not depend directly on upstream release state.

Required flow:

```text
upstream release
-> update watcher
-> staging
-> integration tests
-> canary validation
-> production approval
-> Engine Inventory update
-> capability evidence refresh if applicable
```

## 11. Public projection

The public site consumes a safe projection, never the full internal registry.

Required fields may include:

```text
slug
name
description
access
maturity
status
sort_order
```

Optional user-facing metadata:

```text
short_label
availability_label
updated_label
```

Forbidden public fields include:

- internal policy rules;
- scanner commands;
- template/workflow identifiers;
- template digests;
- dependency digests;
- internal engine configuration;
- worker image names/digests;
- scan budgets;
- authorization context;
- unpublished capabilities;
- internal evidence references.

## 12. Homepage behavior

The homepage block is rendered from the public projection.

Recommended title:

**Возможности OUTSCAN**

The user-facing block describes outcomes first, engines second.

Do not make scanner selection the main public workflow.

The homepage must not hardcode a second independent list of capabilities.

If the public registry API is temporarily unavailable, the page must fail safely:

- use a versioned build-time snapshot generated from the same canonical registry, or
- hide the dynamic block while keeping the rest of the page usable.

Do not fall back to an unrelated manually maintained capability list.

## 13. Workspace use

Workspace may use the same capability identities to show:

- available coverage;
- current entitlement;
- verification requirement;
- current execution state;
- `Не проверено` / `Не определено` / `Неприменимо` states;
- plan limitations;
- beta status.

Coverage must remain based on actual scan coverage data, not merely on registry availability.

`ACTIVE capability` does not mean `this asset was successfully checked`.

## 14. Finding linkage

When applicable, normalized findings and coverage records should reference stable capability identity.

Example relationship:

```text
Finding
- source_detector
- product_capability_slug
- ...existing finding fields
```

This reference supports UI/report grouping but does not replace detector/version/profile provenance required by ADR-0013.

A finding may map to one primary capability for presentation while retaining full technical provenance separately.

## 15. Reports and tariffs

The same stable capability slug may be used to determine product presentation in:

- tariffs;
- reports;
- customer Workspace;
- Agency/MSP views;
- public documentation.

Entitlement remains a separate server-side system.

A tariff claiming a capability is available does not itself authorize a scan.

## 16. Operational continuation

Operational Admin, claim/evidence, caching, observability, compatibility, non-goals and completion rules are defined in:

`docs/SECURITY_CAPABILITY_REGISTRY_OPERATIONS.md`
