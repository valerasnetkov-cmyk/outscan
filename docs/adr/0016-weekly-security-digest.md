# ADR-0016 — Deterministic Weekly Security Digest

**Status:** Proposed

**Date:** 2026-09-07

**Owner acceptance:** pending

## Context

OUTSCAN may provide an organization-specific weekly monitoring summary. This introduces durable scheduling, selection and immutable customer-content snapshots across Monitoring, Findings, Risk, Threat Intelligence, Product Capabilities, entitlements and Notifications.

ADR-0015 governs event-driven delivery but does not decide digest generation, priority, source freshness or snapshot semantics. ADR-0006 keeps canonical Risk separate from intelligence enrichment and presentation.

## Proposed decision

1. Weekly Digest is an optional Phase 4 TENANT subsystem, disabled until explicitly configured by an authorized Organization role.
2. V1 selection and rendering are deterministic and consume only canonical organization-scoped data. The engine owns no source importer, Risk model, entitlement system, recipient store or provider adapter.
3. Digest Priority is a versioned presentation score and cannot mutate OUTSCAN Risk, Finding confidence or alert policy.
4. Mutable work belongs to `DigestGenerationAttempt`. A `DigestIssue` is created only as an immutable READY snapshot; delivery retries never rebuild it from live state.
5. Frozen content uses closed schema-versioned item/freshness/provenance structures with bounded fields. Raw evidence, secrets, scanner payloads and arbitrary HTML are forbidden.
6. Stale, failed, disabled or unknown source state never becomes a negative claim. EPSS is probabilistic and KEV claims require applicable authoritative source state.
7. One organization/period/content version has one issue. Corrections use explicit supersession/new content version; notification deliveries reuse ADR-0015 endpoint/channel/template idempotency.
8. The future `WEEKLY_SECURITY_DIGEST_READY` tenant event is `MONITORING` in `CUSTOMER_TECHNICAL` and contains only the internal issue reference. Recipients are resolved from current membership/preferences at dispatch.
9. Real-time security alerts remain independent. Marketing content and consent are not part of V1.
10. Capability items require production-active customer-visible metadata, release time and current organization entitlement. Display metadata cannot grant scanner execution, verification or authorization.
11. There is no manual send/preview/regeneration API in V1. History and settings are tenant-scoped Workspace surfaces only.
12. AI editorial processing is a separate optional V2 decision and cannot be a V1 dependency.

## Dependencies

Implementation waits for Organization/RLS, Monitoring/Finding snapshots, canonical Threat Intelligence source health, entitlement/release metadata, notification persistence/outbox and verified email delivery.

## Gate effect

This proposed post-Gate-A decision does not reopen Gate A and does not alter Gate B1. It cannot be used as Gate B2/C or production evidence. Source implementation and public claims wait for owner acceptance and applicable downstream gates.

## Consequences

- Sent content is reproducible and explainable, while links lead to current Workspace state.
- An empty threat week does not manufacture urgency; insufficient monitoring baseline suppresses delivery with a recorded reason.
- Explicit organization schedule/timezone is required; there is no default opt-in.
- Data-model rows must enter the ADR-0010 entity matrix before migration.

## References

- [Weekly Security Digest](../WEEKLY_SECURITY_DIGEST.md)
- [Weekly Digest security testing](../WEEKLY_DIGEST_SECURITY_TESTING.md)
- [Notifications & Communications](../NOTIFICATIONS_COMMUNICATIONS.md)
- [Threat Intelligence](../THREAT_INTELLIGENCE.md)
- [Risk Engine](../RISK_ENGINE.md)
- [ADR-0015](0015-notifications-communications.md)
- [ADR-0010](0010-tenancy-data-classification.md)
