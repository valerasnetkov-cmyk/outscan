# CHANGELOG

## [Unreleased] — consistency closure

### Detached Guest session bootstrap boundary

- Added an unregistered Fastify plugin for `POST /v1/public/guest-session`. It requires the exact configured HTTPS Origin, rejects query/body and duplicate raw headers, returns no session material in the body, and emits only a canonical host-only Secure/HttpOnly cookie or a no-refresh reuse response.
- Hostile bootstrap decisions, unsafe Set-Cookie values and provider failures collapse to a redacted 503. Route tests also prove the endpoint remains absent from production `buildApp()`; Gate B1 remains open and no browser receives the cookie yet.

### Detached Guest result HTTP boundary

- Added an unregistered Fastify plugin for `GET /v1/public/scans/:scanId` over the existing authorized read service. It rejects every query, disables implicit HEAD, preserves no-store/no-referrer, maps all access/resource denials to one enumeration-resistant 404 and contains clock/adapter failures behind a stable 503.
- Six route tests cover sanitized success, stable error mapping, dependency failure, query rejection, HEAD absence and continued absence from the production `buildApp()`. This is composition evidence only: Gate B1 remains open and the route is not publicly reachable.

### Minimal first-party GUEST_SAFE scanner

- Added a dependency-free scanner process entrypoint over the existing runtime DNS, full-set destination policy, pinned HTTP/TLS transport, same-host redirect flow and bounded result IPC. Its exact versioned runtime configuration carries explicit DNS settings plus a copied deployment-specific internal CIDR deny-list.
- The scanner revalidates the exact current GUEST_SAFE policy, requires its DNS/TLS/HTTP capabilities and enforces one request counter across DNS and HTTPS. Built-in or configured forbidden resolution never reaches transport; malformed, sparse or duplicate deny ranges fail closed, and raw addresses, headers and bodies never enter output.
- Current observations cover resolution, IPv6 availability, TLS reachability and a conservative security-header posture subset. HSTS requires positive `max-age` (including quoted form); CSP requires a unique enforcing directive; frame protection accepts valid X-Frame-Options or CSP `frame-ancestors`; permissive/unknown referrer and permissions values remain ATTENTION. RDAP, CT, mail and public-infrastructure groups stay explicitly unavailable. Container/egress deployment and owned-target live TLS evidence remain Gate B1 blockers.
- Added a bounded same-host HTTPS `/.well-known/security.txt` check using the existing pinned flow and shared request budget. PASS requires the conservative unsigned RFC 9116 subset: exact plain-text UTF-8 media type, a valid Contact, one future UTC Expires value and a matching Canonical URI when present; body content and contact data never enter output.

### Guest worker process entrypoint

- Added a dedicated `start:worker` process that composes the existing PostgreSQL/BullMQ runtime, mounted approval and result-key providers, durable telemetry and the fixed scanner process adapter from strict absolute-path environment configuration.
- Startup accepts only the current approved GUEST_SAFE artifact and an active 256-bit signing key that is present byte-for-byte in the startup verification keyring; revoked, missing, rotated-without-keyring and malformed state fails closed.
- Added process-configuration and signing-key/keyring binding negatives. The entrypoint emits only bounded local status, adds no route or scanner capability, and is not production deployment, container/egress or approved alert-export evidence; Gate B1 remains in progress.

### Fixed scanner process adapter

- Added a dependency-free shell-free process adapter that binds one exact approved artifact identity to an absolute executable/working directory and static bounded arguments, inherits no environment and sends only a bounded canonical scanner input document to stdin.
- Revalidates exact plan shape, canonical hostname, current scanner policy and artifact/profile identity before spawn; stderr is discarded, stdout remains the bounded result IPC channel, initialization is capped at five seconds, and TERM/KILL plus start/input failures expose stable process outcomes.
- The supervisor's one execution deadline and AbortSignal now include launcher startup and kill a valid handle that resolves after cancellation. Nine local process tests plus one late-launch supervisor negative pass. Container/OS isolation, egress enforcement and deployment binding remain Gate B1 blockers.

### Durable Guest queue telemetry

- Added a dependency-free buffer for the existing twelve closed BullMQ processor outcomes. It emits stable-ID immutable batches with saturating counters and one fixed-priority alert code, never dynamic labels or Guest/target/session/tenant/payload/scanner identifiers.
- Added `0006_guest_queue_telemetry.sql` and an idempotent PostgreSQL store with exact replay, conflicting-ID denial, immutable rows and exact 30-day pruning. Store failure retains the same pending snapshot while later outcomes collect separately.
- Added a fixed ten-second non-overlapping worker cadence, normalized closed outcome callback and final flush after queue transport shutdown. Five additional lifecycle/options cases pass. Production worker deployment and approved Ops alert export remain Gate B1 blockers; no route, scanner capability or external service was added.

### Mounted supervisor approval and signing-key providers

- Added concrete fresh-read regular-file providers for versioned GUEST_SAFE artifact approval/revocation and exact 256-bit ResultEnvelope signing keys. Files are bounded to 16 KiB and 1 KiB respectively, decoded as fatal UTF-8 and rejected on BOM, malformed/deep JSON, duplicate or unknown keys.
- Added a strict 4 KiB startup loader for 1–3 active+retained ResultEnvelope verification keys. Each version is unique and bounded, every key is canonical base64url for exactly 32 bytes, and the private-file policy is reused without introducing another secret backend.
- The reader rejects non-regular files, symlinks and lstat/open identity or size drift. POSIX approval files cannot be group/world-writable and signing-key files must be owner-only; Windows ACL validation remains deployment evidence rather than a portable mode-bit claim.
- Added rotation/revoke, canonical key/keyring, duplicate-version, missing/oversized/malformed file and configuration negatives. Local Windows evidence is 19 passed plus one POSIX-only case skipped; no Vault/KMS, Kubernetes symlink adapter, production container or public route was added.

### Guest worker runtime composition

- Added a strict Redis/BullMQ connection parser with explicit `redis`/`rediss` agreement, bounded database/credentials, no query or fragment options and certificate-validating TLS configuration. TLS mode requires authentication and cannot be downgraded by URL parameters.
- Added an internal Guest worker runtime that composes PostgreSQL lease/commit/rejection adapters, fresh approved execution context, supervisor runner, heartbeat and BullMQ transport using fixed GUEST_SAFE ResultEnvelope identities and limits.
- Added idempotent ready/close lifecycle, stable startup/shutdown errors and forced cleanup of malformed transport handles. Twenty-four focused tests pass; the later process entrypoint composes this runtime, while managed secret/artifact storage, container launcher, egress enforcement, deployment and public routes remain absent.

### Trusted supervisor provider boundaries

- Added fresh-read validation wrappers for active Guest artifact approval/revocation and result-signing key sources. Approval is pinned to the accepted `outscan-v1` policy version and `GUEST_SAFE` profile; signing material is an exact copied 256-bit key with a bounded version.
- Unknown fields, malformed/hostile values, wrong policy/profile, invalid keys and provider failures deny without leaking source details. Approval and key data are re-read on every use so revocation/rotation cannot be hidden by module caching.
- Added 16 unit cases and kept the actual secret manager, approval store, isolated process/container launcher and worker deployment pending Gate B1.

### Internal Guest scan creation composition

- Added a strict server-owned creation service that authenticates the Guest session, canonicalizes the hostname, resolves trusted ingress, derives rotation-safe network HMAC signals and invokes transactional PostgreSQL admission.
- Added stable-ID BullMQ enqueue acknowledgement and crash-window recovery: a live replay re-enqueues the same scan without consuming quota or extending expiry, while queue failure/ambiguity withholds the result token and returns a minimized unavailable response.
- Added unit and PostgreSQL evidence for canonical request hashing, hostile input/output containment, public error mapping, replay across network-signal changes, changed-request conflict and transactional concurrency denial. No Fastify route or scanner capability was exposed; Gate B1 remains in progress.

### Scheduled Guest retention telemetry

- Added a dedicated retention process that immediately runs bounded 100-row batches, drains at most ten batches per cycle, never overlaps cycles and waits 60 seconds between completed cycles. Invalid worker output, clock state and storage failure remain closed outcomes.
- Added `0005_guest_retention_runs.sql` and an idempotent PostgreSQL store for immutable PLATFORM/INTERNAL cycle outcomes. Rows contain only bounded counters and closed status/alert codes, expire at exactly 30 days and have no Guest, target, session/network, tenant or scanner field.
- Added unit and real PostgreSQL coverage for bounded drain/partial/failure/inconsistency paths, scheduler non-overlap, strict projection, exact replay, conflicting run identity, immutability and expiry pruning. Production process deployment and external Ops alert export remain Gate B1 blockers.

### Durable Guest result-rejection evidence

- Added append-only migration `0004_guest_result_rejection_events.sql` and a strict PostgreSQL sink for idempotent, composite scan/attempt/fence-bound result rejection events. Stored fields are limited to closed code/classification and occurrence time; the table has no tenant, target, payload, digest, token or scanner-output column and cascades with Guest retention.
- Required the BullMQ consumer to record every rejected commit before retry and to fail closed when recording fails or security classification disagrees. Unit and PostgreSQL tests cover malformed input, concurrency, immutability, minimized schema, FK denial and cascade cleanup.

### BullMQ Guest supervisor composition

- Added pinned BullMQ/ioredis transport with a strict queue payload containing only schema version and server-created GuestScan ID, deterministic job identity, bounded delivery retries and poison-job fail-closed handling.
- Added the internal consumer composition for PostgreSQL claim/start, approved server-owned GUEST_SAFE execution context, five-second lease heartbeat, abort on renewal loss, injected supervisor run and authenticated terminal commit. Redis is never attempt/fence authority and receives no target, policy, result token or credential.
- Added closed queue-outcome telemetry, unit negatives and a real Redis integration suite for delivery, duplicate enqueue and unrecoverable foreign jobs. The optional `msgpackr-extract` native build remains explicitly denied; production worker deployment, process/container and secret providers plus durable metrics/alerts remain pending Gate B1.

### Trusted ingress and rotation-safe Guest network quota

- Added strict trusted-ingress address selection: untrusted socket peers cannot inject forwarding identity, configured proxy CIDRs are exact and bounded, and trusted chains are walked right-to-left with malformed, excessive or all-trusted input denied.
- Added an active-first, maximum-three-key network-HMAC projection with duplicate/missing/invalid key rejection. It returns only domain-separated digests and preserves IPv4 `/32`, IPv6 `/64` and mapped-address normalization.
- Changed the Guest persistence command to carry active plus retained digests. PostgreSQL locks and sums live alias window/concurrency rows, increments only the active digest and stores that digest on the release reservation, preventing a normal staged rotation from resetting quota.
- Added unit and PostgreSQL rotation negatives/evidence. Public 429 mapping, retention-process deployment/alert export and route exposure remain pending Gate B1.

### Transactional Guest cancellation

- Added a trusted internal PostgreSQL cancellation adapter over a server-created GuestScan ID; no public route or ownership authorization is implied.
- Cancellation locks the job/current attempt, invalidates LEASED work as `SUPERSEDED` or RUNNING work as `CANCELLED`, terminalizes the job and releases its abuse-concurrency reservation in one SERIALIZABLE transaction.
- Duplicate and concurrent cancellation converge to one state/release effect. PostgreSQL tests cover QUEUED, LEASED and RUNNING paths plus malformed input; public cancellation authorization/wiring remains pending Gate B1.

### PostgreSQL Guest attempt leases

- Added queue-delivery claim, idempotent start and running-lease renewal persistence with exact attempt/fence/lease-version CAS, fixed 15-second leases, 45-second hard deadlines and three-attempt retry budget.
- Duplicate delivery now observes the live lease without mutation; expiry terminalizes the old attempt before issuing a strictly greater fence. Retry exhaustion and result-access expiry terminalize the job and release abuse concurrency.
- Added append-only migration `0003_guest_abuse_expired_release.sql` for an explicit `EXPIRED` release reason and real PostgreSQL concurrency/FSM/CAS coverage. The subsequent BullMQ slice now composes the heartbeat; production telemetry remains pending.

### Transactional Guest retention batches

- Added a bounded PostgreSQL worker that locks due GuestScans and expired abuse windows with `SKIP LOCKED`, deletes each 24-hour Guest aggregate by cascade and reconciles unreleased active quota in the same transaction.
- Made privacy deletion independent of quota-metadata consistency: missing active rows are counted in a machine-readable inconsistency result and set `alert_required` instead of retaining expired Guest data.
- Added real PostgreSQL coverage for deadline semantics, cascade deletion, already-released reservations, stale-window pruning, bounded continuation and corrupted quota metadata. Production scheduling and durable metrics/alerts remain pending.

### Transactional Guest abuse counters

- Added `0002_guest_abuse_counters.sql` with digest-only window/active counters, server-owned pause state and per-GuestScan reservation/release records; raw IP, User-Agent and browser fingerprint have no storage field.
- Integrated all four burst/daily and two concurrency dimensions into the same SERIALIZABLE GuestScan create/expired-replacement transaction. Live idempotent replay bypasses abuse state and denied admission rolls back scan/token/counter writes.
- Added idempotent concurrency release for terminal result commit and expired replacement while retaining consumed window counts. Concurrent same-session creation converges to one active reservation.
- Added PostgreSQL tests for six-dimension reservation, privacy schema, replay non-consumption, concurrency races, release, burst limits and pause behavior. Subsequent retention, queue and trusted-ingress/HMAC-rotation slices now close cleanup, scheduling foundation, internal delivery and quota-preserving rotation; production deployment/alert export and public routes remain pending.

### Atomic Guest terminal result commit

- Added a strict authenticated ResultEnvelope-to-PostgreSQL committer that reconstructs the sanitized projection from canonical signed bytes instead of accepting caller-selected result data.
- Added one SERIALIZABLE primary branch that locks current scan/attempt state, uses database transaction time, requires RUNNING/current fence/live lease/deadline and atomically succeeds the attempt/job plus inserts one immutable result.
- Added a separate terminal same-attempt/fence/digest acknowledgement with no payload write, bounded serialization retry and fail-closed stale, expired, cross-target, authentication and digest-conflict outcomes.
- Added real PostgreSQL tests for primary commit, concurrent duplicate convergence, terminal digest conflict, stale/expired denial and target/authentication substitution. Abuse, retention, lease and subsequent BullMQ/supervisor slices now close the internal execution composition; public Guest routes remain pending.

### Transactional Guest idempotency and result read

- Added a strict `pg` Guest persistence boundary with server-owned scan ID/token material, SERIALIZABLE transactions, bounded serialization/deadlock retry and unique-key winner reread.
- Implemented same-session stable replay, different-hash conflict, atomic expired-row replacement and independent same-key ownership across Guest sessions without IP/fingerprint identity.
- Added a parameterized one-query Guest result store that maps PostgreSQL rows through the existing exact snapshots before bearer authorization and sanitized projection.
- Added fail-closed configuration/database errors and real PostgreSQL concurrency, replacement and authorized-result tests. Subsequent slices close terminal result write and abuse reservation/release; public Guest routes and deletion remain pending.

### PostgreSQL Guest persistence foundation

- Accepted ADR-0017: PostgreSQL 18, append-only checksummed SQL migrations and the low-level `pg` driver; no V1 ORM/query builder or automatic startup migration.
- Added `0001_guest_scan.sql` for separate PUBLIC_GUEST scan/attempt/result tables with exact time/digest constraints, idempotency uniqueness, deferred accepted-result relationships, FSM/immutability guards and revoked default PUBLIC access.
- Added the bounded TLS-explicit pool configuration, serialized checksummed migration runner/CLI, PostgreSQL CI service and a real-database suite covering replay/drift, concurrency, chronology, FSM/fence/lease, atomic result identity and cascade deletion.
- The schema-only foundation kept application writes absent. Subsequent repository and BullMQ slices now implement idempotency, abuse, attempt-lease CAS, supervisor heartbeat, terminal result commit/replay, result read and retention; public Guest routes remain pending.

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
- That pure-policy checkpoint kept persistence absent; subsequent transactional counter, retention and trusted-ingress/HMAC-rotation slices now close reservation, accepted-result/expired-replacement release, cleanup/deletion and quota-preserving rotation. Other terminal releases, scheduling/metrics and public routes remain pending.

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
