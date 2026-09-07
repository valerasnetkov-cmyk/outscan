# Weekly Digest security testing

**Status:** Proposed blocking suite for future implementation

**Parent contract:** [Weekly Security Digest](WEEKLY_SECURITY_DIGEST.md)

## Tenant and recipient isolation

- Generating an Organization A issue with mixed A/B fixtures must select and snapshot only A rows.
- A member of A cannot list or fetch B issue IDs; removed/suspended membership loses access immediately.
- Every digest item foreign key must match the issue `organization_id`; database constraints and RLS reject cross-tenant rows.
- Generation events/jobs reject recipient email, endpoint ID, Telegram identity and undeclared fields.
- Dispatch re-evaluates active membership, endpoint state and weekly technical-email preference. A removed member receives no delayed delivery.
- Platform/support access requires the existing bounded audited grant; no implicit support read path is introduced.

## Idempotency and concurrency

- Duplicate and concurrent scheduler jobs produce one issue for organization/period/content version.
- A READY issue is immutable; retry renders byte-equivalent content from its snapshot rather than live data.
- Replayed outbox events produce one logical delivery for each current endpoint/channel/template version.
- Provider timeout after an uncertain request enters `UNKNOWN`; no blind resend or exactly-once claim is allowed.
- A correction creates an explicit new content version/supersession and cannot mutate the historical sent issue.

## Source and claim safety

- Stale/failed/unknown KEV state cannot render `KEV: нет`; missing EPSS cannot become zero.
- Editorial or Tier-B text alone cannot assert active exploitation, affected version or confirmed vulnerability.
- Technology/version match without qualifying evidence remains Potential/Probable under canonical confidence policy.
- Conflicting sources follow canonical Threat Intelligence resolution and preserve provenance.
- Unsupported/incomparable score or coverage data is omitted or marked insufficient, never rendered as safety.

## Content boundary

- Authorization headers, cookies, credentials, tokens, raw requests/responses and FindingEvidence never enter snapshots, rendered bodies or logs.
- Markup, CRLF/header-injection strings, formula prefixes and bidirectional/control characters are rejected or safely normalized for their context.
- Only allowlisted same-origin Workspace paths become links; external/source URLs and arbitrary HTML are not rendered.
- Output size, every string, item count and section count are bounded before persistence and rendering.
- Plain-text and HTML outputs carry the same facts; HTML variables are escaped by construction.

## Risk, capability and communication separation

- Changing Digest Priority changes ordering only; it cannot mutate canonical OUTSCAN Risk.
- Critical/High/KEV real-time policy fires independently of weekly generation failure or schedule.
- Capability items require production-active customer-visible metadata, release time and current organization entitlement.
- Capability/digest metadata cannot change ScannerCapability, VerifiedScope or ScanAuthorization.
- Monitoring digest contains no promotion even when marketing consent is enabled; marketing unsubscribe does not change mandatory account delivery.

## Scheduler and operations

- Large organization batches use pagination, bounded concurrency and queue backpressure.
- Oversized tenants and candidate sets remain within query/work/memory/content limits.
- Invalid timezone, DST gap/overlap and period boundary cases resolve deterministically without duplicate periods.
- Disabled settings or insufficient baseline produce a recorded closed suppression reason without delivery.
- Metrics/logs expose stable low-cardinality outcomes and contain no tenant content, recipients or secrets.

## API and UX

- All future routes require active exact-organization membership; PATCH additionally requires server-resolved role permission and CSRF protection.
- Unknown settings fields, arbitrary locale/timezone values and send/preview/recipient fields fail closed.
- History is read-only, paginated and tenant-scoped; V1 exposes no manual send/regeneration route.
- Settings and history meet the project WCAG 2.2 AA keyboard, focus, error, zoom and reflow acceptance criteria.

## Optional AI V2

If later enabled, tests must prove one-tenant bounded input, no tool/send/browse authority, structured output validation, rejection of invented/escalated claims and deterministic fallback on timeout or invalid output.

## Blocking release conditions

Weekly Digest remains disabled if tenant isolation, recipient resolution, generation/delivery idempotency, stale-source semantics, evidence exclusion, entitlement filtering, real-time separation, provider uncertainty handling or relevant build/security suites lack evidence.

Any PASS statement applies only to this subsystem and its reviewed environment.
