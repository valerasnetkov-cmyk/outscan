# OUTSCAN Reporting architecture

Status: planned post-B2 capability; documentation only

This is the scope/prerequisite entry point for the existing Reporting suite, not a second engine or data model. Accepted ADRs and the canonical gate matrix take precedence. Detailed design remains proposed in [ADR 0018](adr/0018-report-engine.md), [Report Engine](REPORT_ENGINE.md), [schema](REPORT_SCHEMA_VERSIONING.md), [compatibility](REPORT_SCHEMA_COMPATIBILITY.md), [formats](REPORT_FORMATS.md), [rendering rules](REPORT_RENDERING_RULES.md), [storage](REPORT_BUNDLE_STORAGE.md) and [UI](REPORT_UI_UX.md).

## Purpose

Reporting turns already accepted canonical OUTSCAN data into reproducible human and machine views. Reporting is not a scanner, Risk Engine, authorization source or remediation authority.

```text
accepted scan/result data
-> normalized Findings/Coverage/Risk
-> immutable report snapshot
-> renderers
   -> Workspace historical view
   -> JSON
   -> Markdown RU/EN
   -> AI Handoff
   -> PDF
   -> ZIP Report Bundle
```

No report request may expand target scope, enqueue a scan, create verification, change Finding condition/confidence, change Risk/Score or enroll monitoring.

Scan labels in diagrams refer to the existing ScanRequest/ScanJob/ScanAttempt relationships and accepted results, not a new Scan table or a shared nullable-tenant Guest model. The Guest sanitized result remains separate from future tenant reporting.

## Prerequisites

Runtime implementation waits for:

- Gate B2 prerequisites relevant to report access;
- Organization/tenant authorization and RLS;
- durable Asset/Finding/Occurrence/Event/Coverage data;
- stable Finding identity;
- sufficient/comparable score semantics where scores are shown;
- accepted retention/storage policy for report snapshots and artifacts.

## Canonical snapshot

The report snapshot is an immutable factual projection for one report identity and observation period. It must freeze enough canonical data so a historical report does not change when live Workspace state changes later.

Conceptual fields:

```text
report_id
organization_id
source scan/report scope
created_at
schema_version
content_version
coverage/limitations
assets included
findings with stable IDs
risk/score data actually valid at snapshot time
changes only when based on compatible canonical observations
recommendations
source/provenance references needed for reproducibility
```

Do not silently rewrite a finalized snapshot. Corrections require an explicit new version/revision policy.

## Existing domain model relationship

The repository already defines `Report` as TENANT/RESTRICTED. ADR 0018 proposes `ReportSnapshot` and `ReportArtifact` as TENANT/RESTRICTED with mandatory organization keys, composite FKs, RLS and separately accepted retention. They are not accepted ADR-0010 matrix rows or migrations yet. Complete that classification and owner acceptance before persistence; do not create nullable cross-tenant shortcuts or a second Finding identity model.

Use the canonical Finding ID/fingerprint/occurrence/coverage model. Reporting must not invent `HIGH-1` style identities.

Preserve canonical confidence values; editorial potential/probable/confirmed words are not new machine states. Finding condition, disposition and RemediationAction state remain separate axes. User `REPORTED_COMPLETE` never resolves a Finding. Automatic RESOLVED remains disabled under ADR-0013 until accepted compatible-coverage rules and tests exist; report generation itself never performs that transition. Asset Security Score requires `SufficientBaselineV1`; organization score uses explicitly monitored assets only.

## Historical versus live state

A report may display both only when clearly separated:

```text
snapshot at 2026-09-11: Finding OPEN
current Workspace state: RESOLVED on 2026-09-12
```

The old PDF/JSON remains the historical statement. A current-state badge must be fetched and labeled as live data, never silently merged into the immutable artifact.

## Coverage and limitations

Every report states what was actually observed:

- target/assets included;
- profile/capability coverage represented at a product-safe level;
- successful/failed/partial/not-applicable/unknown coverage where meaningful;
- observation interval;
- score comparability/availability;
- known limitations.

Zero findings or missing coverage must never render as `safe`, `secure`, `no vulnerabilities` or equivalent.

## Output formats

### JSON

Machine-oriented canonical export. Prefer JSON as the first renderer because it provides the strongest parity baseline for other formats.

### Markdown RU / EN

Technical human-readable representations of the same snapshot. Language changes wording only, not facts/IDs/statuses.

### AI Handoff

A deterministic technical export for coding assistants. It is data/export only in the first version; OUTSCAN does not invoke a model, grant tools or modify a repository. See `AI_HANDOFF_SECURITY.md`.

### PDF

A presentation renderer, not a screenshot of Workspace. Recommended structure: executive summary first, technical appendix after, with the same snapshot identity and limitations.

### ZIP Report Bundle

A bounded archive containing allowlisted artifacts plus a manifest of hashes/schema/renderer versions. Archive creation must not accept user-controlled output paths or arbitrary filenames.

## Renderer contract

Renderers consume only a validated immutable snapshot/projection. They do not query arbitrary live tables to fill missing facts. This prevents different formats for one report ID from silently describing different moments.

Recommended identity for deterministic artifact generation:

```text
report_id + format + locale + renderer_version + branding_profile
```

Concurrent duplicate render requests must converge or deduplicate safely.

## Authorization and storage

All tenant reports/exports require server-side membership/permission checks plus RLS/composite tenant integrity. Artifact IDs, UUIDs, filenames and object-storage URLs are not authorization.

Binary artifacts belong in private storage or an equivalent protected store. Download uses an authorized API boundary or bounded short-lived signed access after server authorization. Public permanent object URLs are not the default.

## Retention

Snapshot metadata and binary artifact retention are separate policies. Exact periods must be decided from current product/legal/data policy; this document does not invent retention durations.

## Reporting roadmap

1. Complete ADR 0018 acceptance and ADR-0010 persistence classification after B2/durable Finding/Risk foundations.
2. Implement strict immutable snapshot builder from canonical data.
3. Implement JSON renderer and parity tests.
4. Add MD RU/EN and AI Handoff.
5. Add PDF and ZIP bundle with bounded private artifact storage.
6. Add Workspace report history/download UI.
7. Update Capability/Claim Inventory only after runtime and security evidence.

Reporting documentation is not runtime or public claim evidence.
