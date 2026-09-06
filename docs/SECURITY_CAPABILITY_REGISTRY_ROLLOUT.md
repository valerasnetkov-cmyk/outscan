# OUTSCAN Security Capability Registry Rollout

**Status:** Implementation sequence
**Purpose:** Introduce the module without expanding Gate A or prematurely building a feature-management platform

## 1. Gate interaction

Current project order remains authoritative:

```text
Gate A PASS
-> minimal scaffold + CI/test harness
-> trusted dispatcher/target controls
-> Guest vertical slice
-> Gate B1
-> Workspace/verification
-> Gate B2
-> monitoring/change intelligence
-> Gate C
```

Security Capability Registry does not require a new pre-scaffold ADR if it remains a product metadata layer subordinate to the already defined scanner capability policy.

Do not use this feature to alter the decisions owned by ADR-0009 through ADR-0014.

## 2. Recommended insertion point

Implement the smallest registry foundation immediately after the minimal scaffold and basic shared type/config validation exist.

Recommended sequence:

```text
1. Gate A PASS
2. Minimal source scaffold
3. CI + test harness
4. ProductCapability types/schema
5. Code-first V1 registry
6. Public projection
7. Public capabilities endpoint
8. Homepage capabilities block
9. Guest Scan vertical slice continues
10. Engine bindings as adapters are implemented
11. Finding/coverage capability linkage
12. Read-only Platform Admin view
13. Runtime rollout persistence only when Admin foundation exists
```

The registry should not block dispatcher/SSRF/Guest security work.

## 3. Phase 0: documentation synchronization

Before implementation:

- accept existing required ADRs and pass Gate A according to current gate process;
- add this feature to `plan.md` after scaffold foundation;
- add durable architecture summary to `docs/ARCHITECTURE.md`;
- add public endpoint contract to `docs/API_CONTRACT.md`;
- add UI behavior to `docs/UI_UX.md`;
- add security separation rule to `docs/SECURITY_MODEL.md` and/or `docs/SCANNING_POLICY.md` without duplicating ADR-0012;
- add test requirements to `docs/TESTING.md`;
- record the accepted addition in `CHANGELOG.md` when actually applied.

Do not change Gate A to PASS merely because these files exist.

## 4. Phase 1: code-first registry

Goal: establish one source of product capability identity.

Implement:

- typed `ProductCapability` definition;
- canonical V1 slug list;
- schema validation;
- duplicate detection;
- release/access/maturity enums;
- unit tests.

Do not implement:

- DB CRUD;
- admin mutation;
- percentage rollout;
- CMS editing;
- upstream auto-publish.

### Exit criteria

- registry validates at startup/build/test boundary;
- duplicate/invalid definitions fail deterministically;
- no scanner execution permission is represented in product capability definition.

## 5. Phase 2: public projection

Goal: produce a deliberately limited public view.

Implement:

- explicit allow-list serializer;
- filtering to production-active + public-visible + approved claims;
- deterministic ordering;
- response schema version;
- safe cache strategy;
- failure behavior.

### Exit criteria

- internal engine/scanner policy metadata is not serializable through public projection;
- staging/internal/planned capabilities are absent;
- negative tests pass.

## 6. Phase 3: public API

Goal: expose one read-only endpoint used by the site.

Recommended route:

```text
GET /v1/public/capabilities
```

Implement:

- no-auth read endpoint;
- response schema validation;
- rate/cache policy appropriate for low-frequency metadata;
- safe errors;
- integration tests.

The endpoint must not trigger scans or mutate any state.

## 7. Phase 4: homepage integration

Goal: remove hardcoded capability list from the public site.

Implement block:

**Возможности OUTSCAN**

Initial rows:

- Domain Security;
- TLS / HTTPS;
- Email Security;
- Web Security;
- Infrastructure;
- Technology Detection;
- Attack Surface Discovery;
- Vulnerability Detection;
- Threat Intelligence.

Requirements:

- outcome-first copy;
- access labels distinguish public vs verified capability;
- no claim that a visible verified capability can run in Guest mode;
- no duplicate local source of truth;
- safe loading/error state;
- WCAG 2.2 AA behavior consistent with existing project requirements.

### Exit criteria

Changing canonical registry/public state updates the block without editing the page capability list.

## 8. Phase 5: engine bindings

Goal: relate product capabilities to actual production implementation without coupling the UI to scanners.

Implement only as each engine adapter becomes real.

Examples:

```text
domain-security -> DNS/RDAP/posture adapters
tls-https -> TLS/HTTP posture adapters
technology-detection -> httpx/enrichment
attack-surface-discovery -> passive discovery/Subfinder/httpx
vulnerability-detection -> approved Nuclei profile
threat-intelligence -> NVD/KEV/EPSS
```

Do not bind unavailable/planned engines merely for marketing completeness.

### Exit criteria

Bindings describe implementation/provenance but cannot grant execution rights.

## 9. Phase 6: finding/coverage mapping

Goal: reuse stable capability identity across reports and Workspace.

Add capability reference only after existing finding/coverage contracts are implemented.

Requirements:

- detector/profile/version provenance remains authoritative;
- capability is grouping/presentation metadata;
- disabling capability cannot auto-resolve findings;
- incomplete scan does not become successful coverage because capability exists.

## 10. Phase 7: read-only Platform Admin

Goal: operational visibility without introducing risky mutation surface.

Show:

- release state;
- public visibility;
- access class;
- maturity;
- supporting engines;
- engine health/version status;
- last validation;
- evidence state.

No rollout-edit button in first Admin slice.

## 11. Phase 8: runtime rollout state

Introduce database-backed `CapabilityRollout` only when there is a real operational need.

Prerequisites:

- Platform Admin authentication/authorization;
- audit log;
- server-enforced transition rules;
- rollback semantics;
- production evidence model;
- negative authorization tests.

Code definition remains canonical identity. Runtime DB state can narrow visibility/availability but cannot weaken machine policy.

## 12. Phase 9: future reuse

After the base module is stable, use the same slug identity in:

- tariffs;
- Workspace capability/coverage views;
- reports;
- Agency/MSP surfaces;
- API docs;
- future modules such as AppSec, API Security, SCA, Cloud and Mobile.

Do not extend schema preemptively before a real consumer exists.

## 13. Rollback plan

### Homepage/API issue

- disable public projection or use last approved snapshot;
- keep Guest Scan core flow operational;
- do not expose raw internal registry.

### Capability implementation issue

- set product rollout visibility off/degraded;
- independently disable affected scanner profile through existing scanner policy/operations controls;
- preserve historical findings and evidence;
- record operational incident/change.

### Bad upstream release

- roll back engine/template bundle using scanner release process;
- do not alter public capability identity unless actual product behavior is no longer supported.

## 14. Risks to watch

### Naming collision

Do not confuse `ProductCapability` with ADR-0012 `ScannerCapability`.

### False coverage

Capability availability is not proof that an asset was checked successfully.

### Marketing drift

Do not publish functionality merely because an upstream scanner supports it.

### Authorization coupling

Do not use public/DB capability state as the final scan authorization decision.

### Premature complexity

Do not build a general feature-flag platform for the first slice.

## 15. Completion rule

The feature is considered integrated, not merely coded, when:

```text
canonical definition
-> validated registry
-> safe public projection
-> API
-> homepage
-> tests
-> synchronized docs
-> Gate B evidence before publication
```

and the security boundary remains:

```text
public product state
!= scanner permission
!= verified scope
!= scan authorization
```
