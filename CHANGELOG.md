# CHANGELOG

## [Unreleased] — consistency closure

### Transactional Guest retention batches

- Added a bounded PostgreSQL worker that locks due GuestScans and expired abuse windows with `SKIP LOCKED`, deletes each 24-hour Guest aggregate by cascade and reconciles unreleased active quota in the same transaction.
- Made privacy deletion independent of quota-metadata consistency: missing active rows are counted in a machine-readable inconsistency result and set `alert_required` instead of retaining expired Guest data.
- Added real PostgreSQL coverage for deadline semantics, cascade deletion, already-released reservations, stale-window pruning, bounded continuation and corrupted quota metadata. Production scheduling and durable metrics/alerts remain pending.

### Transactional Guest abuse counters

- Added `0002_guest_abuse_counters.sql` with digest-only window/active counters, server-owned pause state and per-GuestScan reservation/release records; raw IP, User-Agent and browser fingerprint have no storage field.
- Integrated all four burst/daily and two concurrency dimensions into the same SERIALIZABLE GuestScan create/expired-replacement transaction. Live idempotent replay bypasses abuse state and denied admission rolls back scan/token/counter writes.
- Added idempotent concurrency release for terminal result commit and expired replacement while retaining consumed window counts. Concurrent same-session creation converges to one active reservation.
- Added PostgreSQL tests for six-dimension reservation, privacy schema, replay non-consumption, concurrency races, release, burst limits and pause behavior. The retention slice now supplies bounded cleanup; trusted ingress/key rotation, worker scheduling/telemetry, queue lifecycle and public routes remain pending.

### Atomic Guest terminal result commit

- Added a strict authenticated ResultEnvelope-to-PostgreSQL committer that reconstructs the sanitized projection from canonical signed bytes instead of accepting caller-selected result data.
- Added one SERIALIZABLE primary branch that locks current scan/attempt state, uses database transaction time, requires RUNNING/current fence/live lease/deadline and atomically succeeds the attempt/job plus inserts one immutable result.
- Added a separate terminal same-attempt/fence/digest acknowledgement with no payload write, bounded serialization retry and fail-closed stale, expired, cross-target, authentication and digest-conflict outcomes.
- Added real PostgreSQL tests for primary commit, concurrent duplicate convergence, terminal digest conflict, stale/expired denial and target/authentication substitution. The abuse-counter slice above adds terminal concurrency release; deletion, queue lease acquisition and public Guest routes remain pending.

### Transactional Guest idempotency and result read

- Added a strict `pg` Guest persistence boundary with server-owned scan ID/token material, SERIALIZABLE transactions, bounded serialization/deadlock retry and unique-key winner reread.
- Implemented same-session stable replay, different-hash conflict, atomic expired-row replacement and independent same-key ownership across Guest sessions without IP/fingerprint identity.
- Added a parameterized one-query Guest result store that maps PostgreSQL rows through the existing exact snapshots before bearer authorization and sanitized projection.
- Added fail-closed configuration/database errors and real PostgreSQL concurrency, replacement and authorized-result tests. Subsequent slices close terminal result write and abuse reservation/release; public Guest routes and deletion remain pending.

### PostgreSQL Guest persistence foundation

- Accepted ADR-0017: PostgreSQL 18, append-only checksummed SQL migrations and the low-level `pg` driver; no V1 ORM/query builder or automatic startup migration.
- Added `0001_guest_scan.sql` for separate PUBLIC_GUEST scan/attempt/result tables with exact time/digest constraints, idempotency uniqueness, deferred accepted-result relationships, FSM/immutability guards and revoked default PUBLIC access.
- Added the bounded TLS-explicit pool configuration, serialized checksummed migration runner/CLI, PostgreSQL CI service and a real-database suite covering replay/drift, concurrency, chronology, FSM/fence/lease, atomic result identity and cascade deletion.
- The schema-only foundation kept application writes absent. Subsequent repository slices now implement idempotency, abuse reservation/release, terminal result commit/replay and result read; deletion, queue lease acquisition/CAS wiring and public Guest routes remain pending.

### GuestScan persistence boundary

- Added exact PUBLIC_GUEST GuestScan, GuestScanAttempt and accepted GuestResult record contracts with immutable validation of access/retention chronology, job/attempt state and accepted attempt/fence/digest identity.
- Added an injected read-only result-store composition that binds the route scan ID, bearer authorization, terminal record, canonical target and sanitized view while collapsing unavailable/inconsistent persisted state to one denial.
- The row/snapshot slice itself added no database adapter. ADR-0017 and the subsequent persistence slices now supply schema, idempotency and result-read evidence; the remaining write workflows and public Guest routes keep Gate B1 in progress.

### Sanitized Guest result view

- Added a strict immutable Guest response builder with five stable posture sections, a complete eight-group coverage inventory and explicit missing/unavailable states.
- Kept raw evidence, individual Finding details, severity/confidence/fingerprints and scanner execution metadata outside the public model; fixed limitations prohibit a Security Score or absolute-assurance interpretation.
- The result-view slice initially kept database lookup absent; the new strict PostgreSQL read store now fills that port. HTTP route, visual page and WCAG runtime evidence remain pending, so Guest exposure stays disabled.

### Promotions and Access Grants proposal

- Added a deferred post-B2 commercial entitlement contract and blocking suite for standard/campaign trials and direct platform-issued grants without changing paid Subscription state.
- Preserved the mandatory separation between entitlement, verification, VerifiedScope, consent, MonitoringEnrollment and ScanAuthorization; the supplied `ADMIN_ATTESTED` bypass remains denied under ADR-0009 pending a separate future ADR.
- Kept all entities, migrations, routes, admin/customer UI, notifications and promo rollout absent; Gate B1 remains the critical path.

### OUTSCAN manifesto draft

- Added the owner-supplied long-form manifesto as a gated canonical content source for later product/site insertion, without publishing it or treating future-feature language as runtime evidence.
- Added section-level claim, gate, Product/Security/Legal and accessibility requirements; Gate B1 remains the critical path and no route, UI or scanner capability was added.

### Action Center and Change Intelligence proposal

- Added staged post-B2 Action Center and V1.5 Change Intelligence/Triage contracts with blocking tenant, coverage, recheck-authorization, monitoring and TI/lifecycle suites while retaining Gate B1 priority.
- Kept user-reported remediation distinct from verified Finding resolution, declared asset ownership distinct from verification, and every recheck/targeted scan behind current EXACT_HOST VerifiedScope, ScanAuthorization, entitlement and ADR-0012 policy.
- Reused canonical MonitoringEvent and Weekly Security Digest, deferred HEADLESS_BROWSER-based preview to a separate later ADR, and kept Brand Protection, DMARC report ingestion and credential exposure outside current implementation.

### Security Question Registry and Check-ins proposal

- Added a post-B2 server-only question-registry and optional user Check-ins contract with projection confidentiality, fixed-choice KNOWLEDGE scope, reversible per-user popup suppression and strict separation from Findings, Risk/Scores, monitoring and notifications.
- Corrected the supplied model by keeping educational progress GLOBAL user-owned without Organization/customer data and treating the claimed Cyberexam banks, attempt rules and O09 approval as unverified until a canonical Cyberexam decision exists.
- Added blocking privacy/authorization/idempotency/UI tests and a deferred implementation backlog; no registry data, preference, route, UI, analytics, Cyberexam or new ADR was introduced.

### Security Glossary proposal

- Added a post-B1 code-first Security Glossary contract and blocking validation/search/API/Web/security/SEO test plan without adding runtime code, routes, persistence or a new ADR.
- Recorded package findings that block automatic seed import: 91 parsed records with one blank slug, a stale 84/90 count and nine category-enum mismatches, plus Guest/ACTIVE/IP wording that requires canonical product review.
- Kept glossary visibility and capability navigation strictly descriptive; glossary metadata cannot publish capabilities or alter Risk, ScannerCapability, VerifiedScope or ScanAuthorization.

### Weekly Security Digest proposal

- Added a deferred deterministic organization Weekly Security Digest contract and blocking security test plan that reuse canonical Monitoring, Risk, Threat Intelligence, Capability/entitlement and Notifications boundaries.
- Added proposed ADR-0016 for immutable READY snapshots, explicit opt-in scheduling, stale-source uncertainty, server-resolved recipients and separation from real-time alerts, marketing and scanner authorization.
- Kept source, routes, scheduler, event-catalog activation, persistence, provider delivery and AI absent; Gate A/B1 remain unchanged and implementation stays in Phase 4 after Workspace dependencies.

### Guest abuse and retention policy

- Added a closed V1 Guest abuse policy over authenticated session scope and a server-derived pseudonymous network signal, with burst/daily/concurrency ceilings and a global pause state; raw IP, User-Agent and browser fingerprint are rejected from this decision input.
- Added an admission composition that returns live same-key/same-hash idempotent replay without consuming a new quota, while CREATE and expired-row replacement require a session/time-bound atomic counter reservation.
- Added a strict 24-hour Guest deletion-deadline decision tied to the original 30-minute result-access window.
- Added versioned domain-separated HMAC network-signal derivation from trusted ingress addresses with IPv4-mapped normalization, IPv4 `/32`, IPv6 `/64`, fixed vectors and rejection of client-forwarded fields.
- That pure-policy checkpoint kept persistence absent; the transactional counter slice above now closes reservation and accepted-result/expired-replacement release. Trusted-proxy/key rotation, other terminal releases, cleanup/deletion/metrics and public routes remain pending.

### Trusted Guest supervisor runtime

- Added the bounded Guest orchestration path from current attempt/artifact authorization through an injected isolated-process launcher, single-frame IPC, canonical output validation and supervisor-owned authenticated ResultEnvelope signing.
- Added one overall execution deadline, abort handling, exit-status validation and best-effort TERM→KILL escalation; malformed launch handles, output, exits and signing keys fail with stable codes.
- Made approved policy, budget, capability and artifact data immutable snapshots before launch, and proved that launch input contains no job, authorization or signing credential.
- Kept the production process/container adapter, secret-manager key provider, queue/CAS transitions, persistence, network execution and public Guest routes unimplemented; Gate B1 remains in progress.

### Notifications & Communications foundation

- Accepted post-Gate-A ADR-0015 and replaced the ambiguous generic notification ownership row with separate account/user, tenant and platform contours; Gate A remains PASS and Gate B1 is unchanged.
- Added a closed account/tenant/platform event catalog, strict scoped envelopes, server-owned recipient resolution, versioned delivery identity and an explicit delivery FSM with unknown/replay/stale-event handling.
- Added provider-neutral outbox/queue/channel adapter ports, fake test adapters and an allowlisted external-content projection; no persistence, route, provider SDK, credential or external delivery was introduced.
- Added hash-only short-lived Telegram binding-token and constant-time customer/Ops webhook-secret primitives with separate bot boundaries.
- Mapped transactional email to Phase 2, customer/Ops technical notifications to Phase 4 and marketing consent/campaign delivery to Later/Commercial; concrete email provider selection remains a later ADR.

### Yandex Metrika external asset foundation

- Added provider-neutral External Asset Source and candidate provenance contracts without adding Yandex-specific fields to `Asset`.
- Added least-privilege `metrika:read` OAuth authorization-request primitives with random one-time state, ten-minute expiry and PKCE `S256`; no callback route, code exchange or token storage is exposed yet.
- Added a fixed-origin, bounded Yandex Management API counter client with strict pagination/response parsing, partial-record rejection, retry/backoff/rate-limit handling and stable errors.
- Added IDNA/public-suffix hostname normalization and deterministic candidate deduplication that retains multiple counter/role sources while keeping distinct subdomains separate.
- Added negative tests proving discovery metadata does not establish VerifiedScope, ScanAuthorization or scanner credentials. Full tenant persistence, UI, scheduling and import/QUICK_SCAN orchestration remain gated by Workspace/B2 prerequisites.

### Product Capability Registry

- Added the shared code-first `@outscan/capabilities` catalog with nine stable V1 product identities, strict validation and a fail-closed public allow-list projection.
- Added anonymous read-only `GET /v1/public/capabilities` and canonical homepage consumption; no capability is currently public-active without approved claims and production evidence.
- Proved that product visibility does not alter Guest scanner policy or authorize Nuclei, raw TCP or unknown machine capabilities.
- Kept runtime rollout persistence, engine bindings and Platform Admin controls deferred; Gate A remains PASS and Gate B1 still governs public deployment.

### Initial source scaffold

- Added pnpm workspace with separate Next.js public/admin applications and a Fastify API boundary.
- Added a claim-safe, responsive public landing preview; Guest Scan submission remains disabled until Gate B1.
- Added API `/health` coverage, strict TypeScript/ESLint/Prettier configuration, source line-limit enforcement and GitHub Actions CI.
- Pinned dependency versions and restricted install scripts to `esbuild` and `unrs-resolver`.
- Completed the full local verification pipeline, including lint, typecheck, tests and production builds; scoped Next.js ESLint rules to the two Next.js applications.
- Verified the public page in desktop/mobile browser viewports with no error overlay or console warnings; disabled automatic Next.js agent-file generation.

### Scanner policy enforcement

- Added a dependency-free, fail-closed V1 scanner-policy validator with exact policy identity, profile capability matrix and workflow budget ceilings.
- Added negative coverage for unknown fields/capabilities, disabled ACTIVE/HEADLESS behavior, capability escalation and every budget ceiling.

### Supervisor authorization boundary

- Added a fail-closed pre-launch ExecutionEnvelope authorization module that binds current attempt/fence/target/authorization/lease/deadline state to scanner policy and approved artifact identity.
- Added negative coverage proving that template, dependency, engine, image, config, policy or profile changes invalidate scanner approval.

### Scan execution protocol

- Added pure ScanJob and ScanAttempt state machines with complete fail-closed transition tables and immutable terminal states.
- Added the ADR-0011 primary-commit and terminal-replay decision boundary, including lease/deadline rejection, stale fence handling and audited digest conflicts without duplicate payload writes.

### Guest cryptographic boundary

- Added canonical Guest-session cookie MAC encoding/verification, authenticated session-scope derivation and replay-stable Guest result-token derivation using the ADR-0011 domain-separated binary formats.
- Added fixed vectors and negative coverage for tampering, non-canonical encoding, expiry, revocation, key rotation/invalidation, oversized input and metadata changes.
- Added a strict HTTP cookie boundary that emits the exact host-only Secure/HttpOnly/SameSite/Path contract, rejects malformed or duplicate Guest cookies and returns only the authenticated non-secret scope digest.
- Added the pure Guest scan idempotency decision boundary: 30-minute create/replace windows, same-scope same-hash deterministic token replay, different-hash conflict and revoked/unavailable-token denial without IP or fingerprint ownership.
- Added strict Guest result-access authorization using a non-URL Bearer token, route-ID binding, uniform public denial, 30-minute remaining-window enforcement and mandatory no-store/no-referrer response headers.
- Centralized immutable result-token metadata validation so HTTP access, idempotent replay and direct verification share the same hostile-input/keyring rules.

### Target input boundary

- Added a dependency-free hostname/IDNA canonicalizer that returns only validated lowercase ASCII hostnames and rejects URLs, paths, ports, userinfo, IP literals and invalid DNS forms.
- Added positive and fail-closed coverage for Unicode/Punycode conversion, the single trailing-dot rule, non-canonical IP forms and DNS length boundaries.
- Added a versioned full-set A/AAAA decision policy that normalizes and deduplicates addresses, rejects malformed/empty/oversized resolver output and blocks the whole set when any destination is non-public or configured internal.
- Added conservative IPv4/IPv6 special-purpose, metadata/control-address and malformed-runtime-configuration coverage; no DNS lookup or socket connection was added.
- Added an injectable dual-family resolver boundary that requires canonical host input, queries A/AAAA together, validates exact address/TTL records and reconciles ENODATA, NXDOMAIN and operational errors without leaking resolver details.
- Successful resolution returns a frozen, policy-approved target with the minimum observed TTL; runtime DNS client configuration and socket pinning remain separate pending layers.
- Added a bounded `node:dns` runtime factory with explicit literal-IP servers, query/retry timeouts and tries; malformed or hostile configuration and initialization failures deny startup.
- The configured Resolver is hidden behind a frozen A/AAAA-only facade so downstream code cannot call `setServers()` or expand DNS capabilities.
- Bound approved resolution sets to their minimum DNS TTL with explicit creation/expiry timestamps.
- Added a pinned HTTP/TLS request-options boundary that revalidates target policy and freshness, supplies only the selected approved IP through `lookup`, fixes Host/SNI/certificate validation to the canonical hostname and rejects lookup/family substitution.
- Added bounded HTTP/TLS dispatch that verifies the connected socket address against the selected pin, enforces a hard deadline plus header/body limits, rejects ambiguous response framing and returns redirects without following them.
- Added a bounded retry/redirect flow that freshly resolves and revalidates A/AAAA before every connection, follows only normalized same-host redirects, blocks HTTPS downgrade and stops cross-host redirects without scope expansion.
- Snapshotted validated transport limits to prevent getter-based time-of-check/time-of-use changes.

### Guest output boundary

- Added a byte-bounded, strict Guest scanner-output projection with fatal UTF-8/JSON parsing, duplicate-key/depth protection, closed machine-code schemas and profile budget validation.
- Candidate findings are deduplicated to an aggregate count; evidence, severity, confidence and fingerprint never enter the public projection, while posture and coverage remain allowlisted machine states.
- Added deterministic GUEST_SAFE ScannerResultEnvelope production: fixed field/collection order, pre-digest evidence redaction, immutable payload copies and a digest/size contract consumable by authenticated result ingress.

### Result ingress authentication

- Added a versioned, domain-separated HMAC wrapper for ResultEnvelope headers with exact workload/audience, lifetime, key-version, payload-size and payload-digest binding.
- Added constant-time MAC/digest checks, payload-copy isolation, fixed serialization vectors and fail-closed coverage for tampering, expiry, key rotation failures, hostile shapes and profile output ceilings.

### Scanner IPC boundary

- Added a versioned single-result local IPC frame with fixed magic, U32BE payload length, profile byte ceiling and mandatory EOF; trailing data and multiple-frame smuggling fail closed.
- Added an overall read deadline, AbortSignal cancellation, fragmentation ceiling, stable stream errors and copy-on-read payload handoff into canonical Guest output processing.

### Gate A closure

- ADR-0009…ADR-0014 accepted by the owner.
- Post-acceptance documentation, whitespace and consistency checks passed; Gate A is PASS.
- `public/maket.png` remains reference-only and must be removed/excluded before Gate B1/public deployment if it would be served.

### ADR-0011 final consistency fixes

- Guest scan idempotency ownership now uses a server-issued, MAC-authenticated 256-bit Guest-session cookie; IP/NAT/User-Agent/browser fingerprint are abuse signals only.
- Guest result-token HMAC message now uses explicit `OUTSCAN:GUEST_RESULT_TOKEN:v1` domain separation with length-prefixed/big-endian binary encoding.
- Result handling is split into a primary RUNNING commit branch and a terminal same-digest replay acknowledgement branch with no duplicate writes.
- `agent.md` owner decision and current applied-revision `git diff --check` PASS are synchronized into gate/plan/audit.

### Follow-up consistency fixes

- Guest scan idempotency window aligned to 30-minute result-access window.
- Same-key/same-hash Guest replay returns the same HMAC-derived result token without extending the original access expiry.
- RUNNING attempt commit now requires an unexpired lease and hard deadline in addition to current attempt/fence.
- HEADLESS_BROWSER is denied in every V1 profile pending a separate browser-egress ADR.
- TENANT_ROOT Organization list/get/mutate/RLS rules are now explicit.
- Accepted ADR-0004 amended from `safe/passive` to `safe/non-intrusive`.
- Accepted ADR-0007 amended to V1 snapshot foundation + V1.5 full diff/timeline capability.
- FUTURE_LABEL Change Intelligence copy changed to `Концепт будущей возможности V1.5`.
- plan/audit synchronized with already-removed correction drafts and previously passing `git diff --check`.

### Gate / evidence

- Added canonical PRE_SCAFFOLD_GATE.
- Added CLAIM_INVENTORY and UX_ACCEPTANCE.
- Previous correction drafts were superseded and removed.
- `public/maket.png` is retained temporarily as reference-only first-screen material; it is not Gate A evidence and must be moved/excluded before Gate B1/public deployment if still present.

### ADR 0009

- Actual outbound connection must be pinned to validated IP.
- Host/SNI/certificate hostname validation remain canonical-host based.
- Mixed A/AAAA set fails closed on forbidden/ambiguous destination.
- Added exact TXT format, challenge FSM, 24h issuance expiry.
- Added persistent TXT revalidation: 7d normal, >24h before Controlled Deep, 30d hard expiry without success.

### ADR 0010

- Added complete entity ownership/sensitivity matrix.
- Added TENANT_ROOT, PLATFORM and PLATFORM_GRANT.
- Split TenantAuditLog and PlatformAuditLog.
- SupportAccessGrant no longer uses CROSS_TENANT_GRANT.

### ADR 0011

- Added ScanJob/ScanAttempt FSM tables.
- Added same/different hash and concurrent idempotency semantics.
- ResultEnvelope now contains `payload: ScannerResultEnvelope`.
- Added same-digest replay and different-digest conflict behavior.
- Defined Guest mapping.

### ADR 0012

- Added explicit capability classes/profile matrix.
- Added V1 safety budgets.
- Added machine-readable policy schema shape.
- Unknown capability fail-closed.

### ADR 0013

- Restored FindingOccurrence.
- Recurrence derives from occurrences.
- Added SufficientBaselineV1 required for Asset Security Score.

### Product / UX / Legal

- Flow now includes Add exact host/Create Asset before verification.
- Guest terminology changed from safe/passive to safe/non-intrusive.
- `passive` reserved for genuinely passive sources.
- Runtime claims governed by Claim Inventory.

### Status

Previous synchronized package was applied before this revision.
Current package/security/content consistency review PASS. Gate A PASS; minimal source scaffold and CI/test harness may begin.
