# Action Center and Change Intelligence

**Status:** Deferred staged product contracts; no runtime implementation

## Priority and gate boundary

Gate B1 remains the current critical path. This document adds no source, route, entity, capability publication, notification, worker or public/Workspace surface.

Delivery is staged:

- after Gate B2 and durable Findings: Action Center foundation;
- Phase 4 prerequisites: preset monitoring rules, Emerging Threat evaluation and technology lifecycle observations;
- V1.5 under accepted ADR-0007: deterministic Change Intelligence and asset triage;
- later separate decisions: visual preview, Brand Protection, DMARC report ingestion and credential exposure.

Nothing here expands V1 `EXACT_HOST`, enables IP/CIDR, Naabu/raw TCP, ACTIVE, authenticated scanning or `HEADLESS_BROWSER`. Every recheck/targeted execution recomputes current `VerifiedScope + ScanAuthorization + entitlement + ADR-0012 policy`.

## Product loop

The future Workspace may organize supported workflows as:

```text
DISCOVER → UNDERSTAND → ACT → VERIFY → WATCH
```

This is navigation/product language, not a scanner authorization state machine. `Actions` explains current work, `Changes` explains comparable observations and `Assets` explains known/proposed resources.

## Action Center foundation

Action Center is an organization-scoped remediation projection over durable Findings, certificate/asset tasks and later monitoring changes. It does not replace Finding condition/events/disposition/occurrence/coverage or become a generic ticketing platform.

The first slice supports:

- assign/clear an active Organization member;
- set/clear a bounded due date;
- move between `OPEN | IN_PROGRESS | REPORTED_COMPLETE | CLOSED` under server transition policy;
- request an authorized recheck;
- surface existing ACKNOWLEDGED/ACCEPTED_RISK/FALSE_POSITIVE disposition separately;
- query a deterministic action queue by organization, status, assignee, due band and risk band.

V1 Action Center has no free-form comments, attachments, external ticket integration, custom workflow or client-defined status. Existing disposition reason remains bounded/audited under canonical policy.

### Remediation semantics

`REPORTED_COMPLETE` records only a user's remediation statement. It cannot set `Finding.condition = RESOLVED`, create negative coverage, raise confidence or improve Risk/Security Score.

`CLOSED` uses a server-owned reason such as compatible verified Finding resolution, accepted disposition or supersession. Verified resolution remains owned by ADR-0013 coverage-compatible result processing. A reopened Finding creates/reopens actionable work without deleting historical action/audit state.

### Future data contract

`RemediationAction` is TENANT RESTRICTED with mandatory `organization_id`, composite tenant references to Finding/Asset, optional active-member assignee, status, due time, report-complete actor/time, linked recheck ScanRequest, server-owned close reason and audit timestamps.

At most one non-closed action exists per Finding. Assignee removal clears or invalidates active assignment atomically through membership lifecycle policy; it never transfers work silently. Client mutation cannot set close reason, verified state, organization/finding/asset identity or scan reference.

The entity must enter ADR-0010 with retention and RLS before migration. No `RemediationNote` is included in the first slice.

### Recheck boundary

Request-recheck accepts only action identity plus idempotency key. The server reloads the tenant Finding/Asset, checks current role, current EXACT_HOST verification, entitlement and execution policy, and derives target/profile itself.

It then creates the canonical ScanRequest/ScanJob flow. Client target, IP, URL, profile, capability/template, scanner arguments and desired result state are rejected. Concurrent replay follows ADR-0011 idempotency; stale/revoked scope denies before enqueue.

### Future API

No Action route exists now. Post-B2 minimum:

```text
GET   /v1/organizations/:organizationId/actions
GET   /v1/organizations/:organizationId/findings/:findingId/action
POST  /v1/organizations/:organizationId/findings/:findingId/action
PATCH /v1/organizations/:organizationId/actions/:actionId
POST  /v1/organizations/:organizationId/actions/:actionId/request-recheck
```

All operations use exact tenant lookup, RLS, server-resolved RBAC, CSRF for session mutations, bounded schemas and TenantAuditLog. No route accepts `verifiedFixed`, close reason, tenant/object reassignment or arbitrary scan input.

## Change Intelligence V1.5

ADR-0007 remains unchanged: V1 preserves versioned observations/snapshots/provenance; the first complete user-facing diff/significance/timeline/alerts capability remains V1.5.

Change Intelligence compares only compatible snapshots and produces deterministic typed `MonitoringEvent` records. It does not introduce a parallel generic `ChangeEvent` until the accepted MonitoringEvent model proves insufficient.

Initial event families may cover asset discovery/disappearance, IP/ASN/provider, NS/MX, certificate/issuer, TLS/DMARC/CDN/WAF/technology posture, Finding transitions and comparable score movement.

Every event records organization/asset, type, significance, before/after snapshot references, bounded sanitized display values, explanation/action codes, coverage/provenance and observed time. Significance is separate from vulnerability severity and OUTSCAN Risk.

Absence, failed/partial/unknown coverage or stale source never becomes disappearance, remediation or security improvement. Finding events derive from canonical FindingEvent transitions, not independent inference. Score deltas require comparable baseline/coverage/model versions.

## Asset triage

V1.5 triage may add a focused TENANT `AssetTriage` record after Asset/discovery persistence exists:

- `DECLARED_OWNED | THIRD_PARTY | UNKNOWN` relationship classification;
- `PRODUCTION | STAGING | DEVELOPMENT | OTHER` environment;
- active-member responsibility, business criticality and bounded controlled tags;
- provenance explanation and explicit monitoring-enrollment decision.

`DECLARED_OWNED`, responsible assignment, tags or criticality are customer metadata only. They never create DomainVerification, VerifiedScope, ScanAuthorization or MonitoringEnrollment. Cross-tenant assignment and arbitrary/unbounded tags fail closed.

## Visual preview — later separate decision

Screenshot/favicon/title preview is excluded from V1 and V1.5 implementation planning. It requires `HEADLESS_BROWSER`, which remains denied in every V1 scanner profile, plus a separate ADR covering browser isolation, subresource/redirect SSRF control, egress, storage/content type, retention, credentials and abuse/cost limits.

Any future preview uses a dedicated credential-free worker, current verified exact-host authorization and fail-closed network mediation for every navigation/subresource. A screenshot is inert convenience content, never ownership, verification, Finding evidence or scan authorization.

## Preset monitoring rules

After MonitoringEvent and ADR-0015 delivery exist, organizations may enable closed server-defined rule codes and channel preferences. The initial catalog can cover meaningful new asset, DMARC/NS/MX/certificate/provider/lifecycle/Finding reopen and comparable score-regression events.

`MonitoringRulePreference` is TENANT SENSITIVE, organization-keyed/RLS and references a closed code. It contains enabled state, optional allowed significance threshold and technical channel preference. No expression, script, query, scanner config or recipient address is accepted. Rule evaluation requires applicable MonitoringEnrollment and creates idempotent events/deliveries through Notifications.

## Emerging Threat evaluation

Canonical Threat Intelligence may match a monitored verified Asset using trusted technology/version observations, KEV/EPSS context and approved detector availability. This creates an evaluation, not authorization.

Closed customer-safe states distinguish `POTENTIAL_MATCH`, `QUEUED_FOR_CHECK`, `NOT_TECHNICALLY_VERIFIED`, `EVALUATED_NO_CONFIRMATION`, `CONFIRMED` and `UNKNOWN`. `EVALUATED_NO_CONFIRMATION` is not `not vulnerable` and requires explicit compatible coverage metadata.

A targeted check is created only through the normal server-derived ScanRequest and current execution authorization. No detector/compatible policy means no launch and an honest unverified state. Client input cannot choose target/profile/template or promote an evaluation to Finding/Confirmed.

Future `EmergingThreatEvaluation` is TENANT RESTRICTED with organization/asset/CVE, normalized TI snapshot/provenance, match/version confidence, verification/coverage state and optional canonical ScanRequest/Finding references.

## Technology lifecycle observations

Lifecycle/EOL is separate from CVE Finding state. A future TENANT observation binds organization/asset/technology observation, version confidence, `SUPPORTED | SUPPORT_ENDING | END_OF_LIFE | UNKNOWN`, source/version/freshness, support date and observation time.

Low-confidence version or stale/conflicting source yields UNKNOWN/qualified copy, never exact EOL applicability. `SUPPORTED` does not imply absence of vulnerabilities. Lifecycle observations may affect action priority only through versioned reviewed Risk/product policy.

## Weekly action digest

Do not create another digest subsystem. [Weekly Security Digest](WEEKLY_SECURITY_DIGEST.md) remains canonical and may select at most three Action Center items after its Phase 4/B2/notification prerequisites. Real-time urgent policy remains independent; recipients are server-derived and marketing remains separate.

## Later add-ons

- Brand Protection requires a separate scope/legal/trademark/source decision and defaults to bounded passive/public observations of third-party candidates; verified-only scanners never run against them.
- DMARC aggregate-report ingestion is distinct from public DNS posture and requires explicit customer setup, XML parser limits, tenant isolation, sender/IP minimization, retention and legal review.
- Credential exposure monitoring requires a separate legal/privacy/licensing/source/data-minimization decision before product commitment.
- Custom monitoring DSL, Jira/Linear integration and graph-based significance remain later.

None is a Gate B1/B2 blocker or current capability claim.

## Release sequencing

Each slice updates ADR-0010 before migration, uses existing domain boundaries, passes [Action & Change testing](ACTION_CHANGE_TESTING.md) and records only its own evidence. No documentation item may be marked implemented or exposed before its prerequisites and applicable B2/C/product claim gates pass.
