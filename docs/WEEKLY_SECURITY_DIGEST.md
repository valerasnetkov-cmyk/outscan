# Weekly Security Digest

**Status:** Proposed for Phase 4; no runtime implementation

**Decision:** [ADR-0016](adr/0016-weekly-security-digest.md)

## Purpose

Weekly Security Digest is an optional organization-scoped monitoring summary. It explains posture changes, the most important current actions, relevant threat-intelligence changes and newly usable OUTSCAN capabilities.

It is not a generic newsletter, a second Risk Engine, an internet-browsing agent or a replacement for immediate security alerts.

## Delivery prerequisites

Source implementation starts only after these canonical boundaries exist:

- Organization membership, tenant authorization, composite tenant constraints and RLS;
- Monitoring/Finding history, comparable posture snapshots and canonical Risk output;
- normalized Threat Intelligence with provenance, freshness and conflict policy;
- organization entitlements and capability production-release metadata;
- tenant notification preferences, transactional outbox, delivery persistence and a verified email provider.

The feature is post-Gate-A, does not affect Gate B1 and cannot make Gate B2 or Gate C pass.

## Architecture

```text
Monitoring + Findings + Risk + Threat Intelligence + Capabilities/Entitlements
                                ↓
                    deterministic Digest Engine
                                ↓
                    immutable DigestIssue snapshot
                                ↓
              TenantNotificationEvent / transactional outbox
                                ↓
             recipient policy → delivery → EmailProviderAdapter
```

Digest generation never changes ProductCapability visibility, ScannerCapability, VerifiedScope or ScanAuthorization. It does not fetch arbitrary web pages and never calls an email provider directly.

## Product policy

- Disabled by default. An authorized Organization role enables it and explicitly selects an IANA timezone, weekday and local delivery time.
- Category is `MONITORING`, stream is `CUSTOMER_TECHNICAL`, channel is `EMAIL_TECHNICAL`.
- The future closed event type is `WEEKLY_SECURITY_DIGEST_READY`; it is not active in the current notification catalog.
- Sender identity is provider configuration under `notify.outscan.ru`, not a source constant or production claim.
- Recipients are active members with the applicable current technical-email preference, resolved server-side at dispatch. Requests/jobs contain no address or endpoint selection.
- Marketing consent and content remain separate. Critical/High/KEV real-time alert policy is evaluated independently and is never delayed by the digest.

## Content

The deterministic Russian V1 template contains bounded sections:

1. `Ваш периметр` — comparable score direction and supported change counts;
2. `Требует внимания` — at most three current priority items;
3. `Что изменилось` — bounded material asset/finding/monitoring changes;
4. `Для ваших технологий` — relevant, source-supported threat matches;
5. `Что сделать на этой неделе` — at most three canonical remediation actions;
6. `Новое в OUTSCAN` — at most three actually usable capability releases.

Missing or incomparable data is omitted or identified as insufficient. Zero findings, missing coverage or stale sources never become a safety claim. If monitoring data is insufficient for a meaningful organization summary, generation is suppressed with a closed reason. Otherwise an empty-threat week may still produce a calm posture/change summary.

Customer content contains only approved display identifiers, bounded summaries, OUTSCAN Risk/confidence, supported CVE/KEV/EPSS facts, canonical remediation copy and same-origin Workspace paths. Raw FindingEvidence, scanner payloads, headers, credentials, tokens, arbitrary HTML/Markdown and internal scanner identifiers are forbidden.

## Threat source semantics

Digest consumes canonical normalized Threat Intelligence; it owns no importer.

- Official vendor statements and CISA KEV support only the claims within their source semantics.
- NVD supplies normalized NVD metadata, not an unconditional vendor-authoritative affected-version claim.
- FIRST EPSS is a probabilistic model signal, not evidence of exploitation.
- OSV/Nuclei metadata is technical enrichment and cannot independently assert confirmation or authorization.
- A stale, failed, disabled or unknown source yields unknown/omitted facts, never `NO` or zero.

Every selected external fact keeps a bounded reference to canonical source identity, normalized record version/hash, source time and freshness state. External strings are untrusted and context-escaped.

## Digest Priority

Digest Priority selects scarce email space and never mutates OUTSCAN Risk. Proposed `digest-priority-v1` calibration:

```text
technology match +30       exact version match +25
CISA KEV +30               EPSS > 0.80 +20
confirmed finding +40      internet exposed +15
critical asset +15         low confidence -30
no approved detection path -10
```

Candidates at 70 or above are considered first, 40–69 fill remaining capacity and lower scores are normally omitted. Deterministic stable tie-breakers use item kind and canonical source/entity identifier. Weights, thresholds, caps and tie-break version are stored with the issue and require calibration evidence before production acceptance.

## Data contracts

All future rows are TENANT and require `organization_id`, composite tenant foreign keys and RLS:

- `OrganizationDigestSettings`: enabled, IANA timezone, weekday, local time, locale and audit timestamps; no recipients;
- `DigestGenerationAttempt`: mutable job/attempt outcome with stable error code and no raw exception/source payload;
- `DigestIssue`: immutable READY structured snapshot for one organization, period and content version;
- `DigestItem`: closed discriminated item snapshots with bounded typed facts and provenance.

`facts` and `sourceWatermarks` are schema-versioned allowlisted structures, not arbitrary JSON. Delivery state remains in `TenantNotificationDelivery`.

Issue generation uses a unique organization/period/content-version identity. Concurrent jobs elect one winner transactionally. Once READY, content is never rebuilt from live state during delivery retry. The email shows generation time and links to current Workspace state. Corrections create a new content version and explicit supersession record; they do not mutate a sent issue.

The notification event carries the internal issue reference as `subjectReferenceId`; it contains neither rendered body nor recipients. Existing delivery idempotency remains `event + endpoint + channel + template ID/version`.

## Future API and UI

No digest route exists now. After Workspace/B2 prerequisites, the minimum organization-scoped API may provide:

- `GET/PATCH /v1/organizations/:organizationId/notification-preferences/weekly-digest`;
- `GET /v1/organizations/:organizationId/weekly-digests`;
- `GET /v1/organizations/:organizationId/weekly-digests/:digestIssueId`.

PATCH accepts only enabled/schedule/locale fields and uses server-resolved RBAC. History/detail require active membership and exact tenant lookup. V1 has no public endpoint, arbitrary recipient, send-now, preview or regeneration API.

Workspace placement is `Настройки → Уведомления → Еженедельная сводка`, plus read-only history. Normal users never see source-ingestion internals or raw evidence.

## Scheduling and failure behavior

The regular bounded scheduler computes period boundaries in the configured timezone, records source watermarks, creates one generation attempt and applies queue backpressure. It does not use Codex, browser automation or an autonomous agent.

Closed failure/suppression reasons include source unavailable, tenant data invalid, insufficient baseline, build/render/outbox failure and digest disabled. Only retryable infrastructure failures receive bounded backoff. Provider uncertainty remains `UNKNOWN` under ADR-0015 and is not blindly resent.

Required telemetry covers generation outcomes/duration, suppression reason, selected counts, source staleness, queue backlog and delivery outcome without tenant identifiers or content in metric labels/logs.

## Optional AI editorial V2

AI is outside deterministic V1 and requires explicit later acceptance. It may rewrite already selected allowlisted facts into bounded text, but cannot select sources/items, change Risk/confidence/KEV, invent facts or URLs, resolve recipients, send, browse or call tools. Invalid output falls back to deterministic rendering.

## Release evidence

Production enablement requires the blocking suites in [Weekly Digest security testing](WEEKLY_DIGEST_SECURITY_TESTING.md), accepted ADR-0016, implemented prerequisites, provider/DNS evidence, observability and an updated claim inventory. Passing the documentation review alone is not runtime evidence.
