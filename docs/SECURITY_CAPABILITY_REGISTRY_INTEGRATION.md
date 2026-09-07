# OUTSCAN Security Capability Registry Integration Map

**Status:** Merge guide
**Purpose:** Identify exact canonical documents that must be updated when the feature is applied

This file is not a replacement for canonical project specifications. It is an integration checklist and should not become a second source of normative truth after the changes are merged.

## 1. Important project constraint

The repository already defines scanner capability policy under ADR-0012.

When integrating this feature, use:

- `ProductCapability` for product/public catalog;
- `ScannerCapability` for machine execution policy.

Never rename the ADR-0012 security mechanism to the product registry or merge them into one mutable model.

## 2. `docs/ARCHITECTURE.md`

Add a concise module boundary:

```text
Product Capability Registry
- canonical code-first product capability definitions
- public projection
- engine bindings
- later runtime rollout state

Security boundary:
Product Capability Registry does not authorize scan execution.
Scan execution remains controlled by VerifiedScope + ScanAuthorization + profile/scanner policy.
```

Suggested architecture flow:

```text
Capability definitions
        |
        +--> Public projection --> Public API --> Homepage
        |
        +--> Engine bindings --> operational/admin read model
        |
        +--> Workspace/report grouping

ScanAuthorization/scanner policy
        |
        +--> trusted dispatcher/supervisor --> worker
```

The two flows may share identifiers/metadata but not authority.

## 3. `docs/API_CONTRACT.md`

Add:

```text
GET /v1/public/capabilities
```

Contract requirements:

- anonymous read-only;
- safe allow-listed projection;
- only production-active/public-visible/approved capabilities;
- schema version;
- deterministic ordering;
- no scanner internals;
- endpoint cannot trigger scans or mutate state.

Reference detailed shape from `docs/SECURITY_CAPABILITY_REGISTRY_CONTRACT.md`.

## 4. `docs/UI_UX.md`

Add homepage block requirement:

### Возможности OUTSCAN

Content order:

1. Domain Security
2. TLS / HTTPS
3. Email Security
4. Web Security
5. Infrastructure
6. Technology Detection
7. Attack Surface Discovery
8. Vulnerability Detection
9. Threat Intelligence

UX rules:

- explain outcome before engine name;
- distinguish Guest-safe vs verification-required capability;
- no scanner-selection-first workflow;
- no claim of active verified-only scan in Guest mode;
- no hardcoded second source of capabilities;
- loading/error does not block main Guest Scan flow;
- accessibility remains WCAG 2.2 AA.

## 5. `docs/PRODUCT.md`

Add product principle:

> OUTSCAN publicly describes capabilities from one production capability catalog. The catalog reflects supported OUTSCAN product behavior, not raw upstream scanner feature lists.

Clarify:

- public capability presence is a product claim;
- claims require production evidence;
- engine availability alone is insufficient evidence;
- product capability availability is not asset-specific scan coverage.

## 6. `docs/SECURITY_MODEL.md`

Add invariant:

```text
Product capability visibility is not authorization.
```

Explicitly state:

- registry cannot expand `VerifiedScope`;
- registry cannot satisfy `ScanAuthorization`;
- registry cannot grant consent or entitlement;
- registry cannot enable unknown/forbidden scanner capabilities;
- unknown scanner behavior remains denied by ADR-0012 policy.

## 7. `docs/SCANNING_POLICY.md`

Do not duplicate scanner policy.

Add only the separation rule:

> ProductCapability metadata may describe an available OUTSCAN function but never changes SAFE/CONTROLLED/ACTIVE/DISABLED machine capability classification or profile authorization.

Future glossary `relatedCapabilities` is descriptive navigation only and must resolve through the safe public capability projection; it cannot reveal or change hidden rollout/claim/evidence state.

If an engine binding references Nuclei/Subfinder/httpx/etc., it remains descriptive until the corresponding approved profile/policy permits execution.

## 8. `docs/DATA_MODEL.md`

First implementation may remain code-first with no database table.

When runtime rollout becomes necessary, add GLOBAL operational metadata entities such as:

```text
CapabilityRollout
EngineInventory
EngineBinding
```

Suggested classification:

- ownership: `GLOBAL`;
- sensitivity: `INTERNAL` for operational engine details;
- only public projection is `PUBLIC`.

Do not place tenant/customer evidence into global capability metadata.

If `product_capability_slug` is added to Finding/Coverage, keep tenant ownership and existing provenance rules unchanged.

## 9. `docs/TESTING.md`

Add required suite from `docs/SECURITY_CAPABILITY_REGISTRY_TESTS.md`.

Minimum blockers before public release:

- duplicate/invalid registry rejection;
- public allow-list serialization;
- staging/internal exclusion;
- Guest cannot gain verified execution;
- registry cannot mutate scanner policy;
- homepage consumes canonical projection;
- failure mode does not expose internal data.

## 10. `docs/OPERATIONS.md`

Add operational checks:

- registry validation health;
- public projection generation health;
- engine inventory freshness;
- stale capability validation evidence;
- safe kill/visibility control for product capability;
- independent scanner kill/rollback remains under scanner operations.

Do not use public capability switch as the only scanner kill switch.

## 11. `docs/CLAIM_INVENTORY.md`

Every public capability description is a claim requiring evidence ownership and approval.

Do not infer claims such as:

- number of checks;
- number of sources;
- continuous/instant response guarantees;
- vulnerability coverage percentage;
- SLA/security guarantees

from registry/engine counts unless separately approved.

## 12. `README.md`

After implementation, add one short architecture reference:

> Public capability surfaces are generated from the Product Capability Registry; scanner execution remains independently controlled by scanner policy and ScanAuthorization.

Link to the new registry spec only if project documentation conventions allow adding it to the docs index.

## 13. `plan.md`

Insert tasks after Gate A PASS and minimal scaffold:

```text
- [ ] Add typed ProductCapability registry and validation.
- [ ] Add safe public projection.
- [ ] Add GET /v1/public/capabilities.
- [ ] Render homepage capabilities from canonical projection.
- [ ] Add negative tests proving registry cannot grant scan authorization.
- [ ] Add engine bindings as adapters become production-ready.
- [ ] Add read-only Platform Admin view later.
```

Do not mark complete until tests/docs are synchronized.

## 14. `CHANGELOG.md`

Record the feature when applied, not merely when this draft package is created.

Suggested entry:

```text
### Added
- Product-level Security Capability Registry as the canonical source for public capability surfaces.
- Safe public capability projection and homepage integration contract.

### Security
- Explicit separation between product capability metadata and ADR-0012 scanner capability policy/ScanAuthorization.
```

Adjust wording to actual implemented scope.

## 15. `docs/PRE_SCAFFOLD_GATE.md`

Do not add a new Gate A blocker solely for this product metadata module.

Current Gate A requirements and required ADR acceptance remain unchanged unless the owner deliberately changes the gate model.

If integration is performed before Gate A PASS as documentation-only work:

- do not claim runtime implementation exists;
- do not change Gate B status;
- do not add unsupported public claims;
- keep the module explicitly subordinate to ADR-0012.

## 16. `docs/adr/0012-worker-boundary-scanner-policy.md`

Preferred approach: **no new normative decision required** if the public/product registry remains non-authoritative for execution.

A small clarification may be added during canonical sync:

> The product-facing ProductCapability registry is metadata only and is not the ScannerCapability policy described by this ADR. Product state cannot expand the machine policy allow-list or ScanAuthorization.

Do not add a new ADR unless implementation later introduces a materially new architectural decision, such as dynamic production mutation with security consequences.

## 17. Daily audit

When the change is actually merged/implemented, create/update the relevant dated audit with:

- changed files;
- tests run;
- line-count result;
- Markdown link result;
- secret scan result;
- consistency check;
- Gate impact;
- remaining risks.

## 18. Final consistency check

Before handoff, search for accidental conflation of these terms:

```text
ProductCapability
ScannerCapability
ScanAuthorization
VerifiedScope
public_visible
```

Expected relationship:

```text
ProductCapability/public_visible
        |
        +--> presentation only

VerifiedScope + ScanAuthorization + ScannerCapability policy
        |
        +--> execution authority
```
