# Architecture

## Goals

- MVP without premature microservices.
- Strong actual-connection scanner boundary.
- Separate Guest and tenant persistence.
- Multi-tenant Workspace with RLS.
- Deterministic job/attempt/result protocol.
- Versioned capability policy.
- Generic Asset model.

Gate rules: `PRE_SCAFFOLD_GATE.md`.

## Components

### apps/web

Public + Workspace UI.

### apps/admin

Separate Platform Admin UI.

### apps/api

Trusted boundary: auth, organizations, guest, assets, verification, scans, findings, risk/TI, monitoring, reports, billing, admin/audit.

### trusted dispatcher/supervisor

Trusted platform process:

- consumes BullMQ;
- CAS leases/fence;
- renews RUNNING attempt leases;
- validates policy/authorization/current lease/hard deadline;
- launches disposable scanner;
- enforces controlled egress/budgets;
- reads bounded local output;
- validates/normalizes/redacts;
- creates ScannerResultEnvelope;
- wraps it in authenticated ResultEnvelope;
- primary-commits only while job/attempt/fence/lease/deadline are current;
- handles terminal same-digest replay as a separate no-write acknowledgement branch over stored accepted result identity.

### disposable scanner

Untrusted third-party process:

- no DB/Redis/result credential;
- no private app network/metadata;
- controlled egress;
- bounded local IPC.

## Outbound connection adapter

Security-sensitive probes use a platform-controlled adapter that:

- resolves full A/AAAA set;
- fail-closes forbidden/ambiguous set;
- pins actual socket to validated IP;
- preserves Host/SNI/certificate hostname verification;
- repeats on retry/redirect.

Third-party scanners unable to obey this contract are not allowed in Guest or verified exact-host profiles.

## Guest flow

```text
browser
→ server-authenticated Guest-session bootstrap
→ API hostname validation + Guest-session-scoped idempotency
→ GuestScan
→ BullMQ
→ supervisor
→ pinned safe/non-intrusive probes
→ bounded output
→ ScannerResultEnvelope
→ ResultEnvelope commit
→ GuestResult
→ token-authorized browser
```

GuestScan/GuestScanAttempt use generic Job/Attempt semantics in separate PUBLIC_GUEST tables.

## Workspace flow

```text
Organization
→ Add exact host Asset
→ DNS verification/revalidation
→ ScanAuthorization
→ ScanRequest/ScanJob/ScanAttempt
→ supervisor
→ approved profile
→ ScannerResultEnvelope
→ ResultEnvelope atomic commit
→ observations/occurrences/coverage/findings
→ SufficientBaselineV1
→ Asset Security Score
→ optional MonitoringEnrollment
```

## Modules

Product Capability Registry: version-controlled product metadata, safe public projection and later descriptive engine bindings. It supplies public API, homepage and future Workspace/report grouping, but never authorizes execution.

Future Security Glossary: dependency-free reviewed terminology metadata, deterministic local search and fail-closed public/hint projections. It may navigate to safe public capabilities but owns no scanner, Risk, tenant data, CMS/database or external search.

Future Security Question Registry is server-only because it holds answers/scoring. It emits separate safe Cyberexam/Workspace projections; post-B2 Check-ins store only GLOBAL user-owned preference/progress and cannot write tenant security, Finding, Risk/Score, Monitoring or notification state.

Deferred Action Center extends durable tenant Findings with remediation workflow but never owns technical resolution. ADR-0007 V1.5 Change Intelligence compares compatible snapshots into canonical MonitoringEvent; triage, preset rules and TI/lifecycle evaluation remain separate typed boundaries. Recheck/targeted execution always returns through the canonical authorization/job pipeline.

Future Promotions/Access Grants combine paid Subscription state with time-bounded versioned commercial entitlement snapshots in one server-owned calculator. They do not create DomainVerification, VerifiedScope, consent, MonitoringEnrollment or scanner authorization. The proposed administrative verification override is outside accepted ADR-0009 and remains absent pending a separate ADR.

External Asset Sources: provider-neutral discovery metadata and provenance. A provider can propose a hostname candidate but cannot create VerifiedScope, ScanAuthorization or scanner-policy authority.

Notifications & Communications: closed domain events, scoped server-side recipient policy, transactional-outbox/delivery ports and isolated email/customer Telegram/Ops Telegram adapters. Provider availability cannot alter source business transactions.

Asset: assets, relations, verification, monitoring enrollment.
Scan: idempotency, job/attempt FSM, leases/fence, policy versions.
Finding: condition, occurrences, events, disposition, coverage/evidence.
Risk: pure versioned calculation and sufficient-baseline consumption.
Change Intelligence: V1 snapshots, V1.5 diffs/events/significance.
TI: NVD/KEV/EPSS provenance.

```text
ProductCapability definitions → public projection → API/homepage
ScanAuthorization + ScannerCapability policy → supervisor → scanner
Domain event → transactional outbox → dispatcher/policy → delivery queue → channel adapter
```

Future Phase 4 Weekly Digest consumes canonical tenant Monitoring/Finding/Risk, normalized Threat Intelligence and entitled production Capability metadata, freezes a deterministic issue, then emits through the ADR-0015 outbox/delivery boundary. It owns no importer, Risk model, recipient list, provider call or scan authorization. See `WEEKLY_SECURITY_DIGEST.md`; no runtime module exists yet.

The flows may share stable identifiers and descriptive metadata, but only the second flow has execution authority.

## Data ownership

TENANT rows organization-keyed + composite FK + RLS.
Guest separate.
Platform/grants per ADR 0010.

## Scale

Start:
`API → BullMQ → supervisor pool → disposable scanners`.

Later pools by approved capability.

## Microservice rule

Extract only for proven scale, security/failure isolation, deployment cadence or ownership. Scanner process isolation is required day one; broker/result ingress may remain logical interfaces.

## Current scaffold

- `apps/web`: Next.js public surface with a non-submitting Guest Scan preview.
- `apps/admin`: isolated placeholder surface with no data or admin actions.
- `apps/api`: Fastify trusted boundary exposing `GET /health` and the read-only safe `GET /v1/public/capabilities` metadata projection; Guest scan/result routes remain unavailable.
- `packages/capabilities`: dependency-free code-first ProductCapability registry and fail-closed public projection. Current production projection is empty until claims and evidence are approved.
- `apps/api/src/guest-crypto`: Guest-session cookie/scope and result-token cryptographic primitives, strict Set-Cookie/Cookie authentication and non-URL Bearer result-access authorization with privacy headers; no public session, scan or result route is exposed.
- `apps/api/src/guest-idempotency`: pure 30-minute Guest scan create/replay/conflict decision over authenticated session scope and a persisted-record view; the concrete transaction/uniqueness adapter lives in `guest-persistence`.
- `apps/api/src/guest-abuse`: closed new-scan admission policy, trusted socket/proxy chain selection, bounded active/retained HMAC network-signal projection and fixed 24-hour retention decision. Live idempotent replay bypasses new quota consumption; PostgreSQL aggregates live counters across rotation digests under one lock, writes only the active digest and applies the session/time-bound six-dimension reservation. `guest-persistence` also supplies bounded `SKIP LOCKED` deletion/window-cleanup batches with active-quota reconciliation. Public 429 mapping, process deployment and external alert export are not implemented.
- `apps/api/src/target`: hostname/IDNA canonicalization, bounded runtime DNS factory, A/AAAA orchestration, full-set destination policy and TTL-bound pinned HTTP/TLS dispatch. The transport verifies `socket.remoteAddress`, bounds response framing/headers/body and never follows redirects automatically. A higher flow layer freshly resolves/revalidates before each retry and normalized same-host redirect, blocks HTTPS downgrade and stops cross-host redirects; no API/supervisor wiring is exposed.
- `apps/api/src/scanner-policy`: dependency-free V1 policy authorization module used by the pre-launch boundary, not by a scanner process.
- `apps/api/src/scan-protocol`: pure Job/Attempt FSM and primary-commit/terminal-replay decision logic; Guest PostgreSQL adapters apply lease and result transitions atomically.
- `apps/api/src/scanner-output`: bounded Guest scanner-output parser/projection and canonical producer. It validates the closed GUEST_SAFE machine schema, deterministically orders fields/collections, redacts evidence before canonical UTF-8 JSON digesting and emits only allowlisted public posture/coverage plus aggregate risk/warning counts. Payload access is copy-on-read.
- `apps/api/src/guest-result`: pure fail-closed public response builder over successful Guest result authorization and sanitized projection. It emits five fixed posture sections, the full canonical coverage inventory and explicit limitations while omitting raw evidence and scanner execution metadata; PostgreSQL lookup now exists through `guest-scan`.
- `apps/api/src/guest-http`: detached Fastify session-bootstrap and result plugins. Bootstrap requires an exact configured HTTPS Origin, no query/body, a server-owned reuse/issue decision and a canonical Set-Cookie value; result access has closed 400/404/503 mappings, mandatory privacy headers, no implicit HEAD and no token-in-query path. `buildApp()` deliberately registers neither before Gate B1, so they are not public route evidence.
- `apps/api/src/guest-scan`: exact PUBLIC_GUEST scan/attempt/result row contracts, immutable hostile-input snapshots and internal create/read compositions. Creation binds the authenticated Guest session, canonical hostname, trusted ingress/network HMAC, SERIALIZABLE admission and exact-ID queue acknowledgement; replay re-enqueues the stable scan ID to recover the commit/enqueue crash window. Read binds route scan ID, bearer token, accepted attempt/fence/digest, canonical target, access/retention time and sanitized view. PostgreSQL supplies both stores, while all Guest HTTP routes remain absent.
- `apps/api/src/guest-persistence`: concrete SQL-first Guest idempotency, abuse, attempt-lease, cancellation, terminal-result, rejection-event, result-read and retention adapters. Rejection events contain only closed code/classification plus current scan/attempt/fence, are idempotent/append-only and cascade with Guest retention. `apps/api/src/guest-retention` serializes bounded cleanup cycles and persists separate minimized PLATFORM run/alert telemetry with 30-day expiry. SERIALIZABLE lease CAS and terminal transitions remain PostgreSQL authority; production worker deployment and HTTP routes remain absent.
- `apps/api/src/guest-queue`: BullMQ transport with deterministic job identity and a strict payload containing only schema version plus server-created GuestScan ID. Redis configuration requires an explicit plaintext/TLS mode, rejects URL option injection and produces certificate-validating `rediss` settings. Its consumer composes PostgreSQL claim/start, approved GUEST_SAFE context, five-second lease renewal, abort-on-lease-loss supervisor execution and authenticated result commit. Rejected commits must reach the durable minimized event sink before bounded retry; PostgreSQL remains attempt/fence authority.
- `apps/api/src/guest-telemetry`: dependency-free in-process aggregation of the queue's closed outcomes into immutable PLATFORM/INTERNAL batches. PostgreSQL accepts stable-ID exact replay, rejects conflicting identity, derives no dynamic labels and prunes at the exact 30-day deadline. Store failure retains the exact pending batch while new counts accrue separately. The worker owns a bounded non-overlapping cadence and final shutdown flush; production deployment and alert export remain external work.
- `apps/api/src/guest-worker`: internal runtime composition of the PostgreSQL lease/commit/rejection adapters, approved context, supervisor runner and BullMQ Worker. It fixes GUEST_SAFE ResultEnvelope identity/bounds, validates concurrency/heartbeat/termination settings, provides idempotent ready/close and cleans malformed transports. A dedicated process entrypoint composes it from strict mounted approval/keyring/signing inputs, database/Redis configuration and the fixed process launcher; it is not deployment or scanner-sandbox evidence.
- `apps/api/src/guest-scanner`: minimal first-party GUEST_SAFE process. It revalidates the exact scanner input/policy, constructs an explicit runtime DNS resolver, applies built-in plus deployment-specific CIDR denial to the full-set destination policy and pinned HTTPS/same-host redirect flow, shares one outbound request counter across DNS and HTTP, and emits only the bounded scanner IPC frame. Resolution/IPv6, TLS, a conservative accepted security-header subset and bounded same-host RFC 9116 `security.txt` validation are implemented; RDAP, CT, mail and public-infrastructure coverage remains explicitly unavailable. It receives no environment or platform credential, but production container/egress isolation is not implied.
- `apps/api/src/db` and `apps/api/db/migrations`: ADR-0017 SQL-first PostgreSQL boundary with bounded explicit TLS configuration, a checksummed advisory-locked migration runner and separate Guest scan/attempt/result plus digest-only abuse schemas. No ORM or startup auto-migration is present; Guest public routes remain absent.
- `apps/api/src/scanner-ipc`: one-result local IPC frame encoder/reader with fixed v1 magic, U32BE length, profile output ceiling, one overall deadline, cancellation, fragmentation bound and mandatory EOF. It rejects trailing/multiple frames and exposes only isolated payload copies.
- `apps/api/src/result-envelope`: authenticated ResultEnvelope signing and ingress primitives. The supervisor signer binds job/attempt/fence, workload/audience/time and payload digest/size with HMAC; ingress independently verifies the exact wrapper before exposing isolated payload copies and commit identity.
- `apps/api/src/external-assets` and `apps/api/src/integrations/yandex-metrika`: provider-neutral candidate/provenance contracts plus a closed Yandex Metrika foundation (OAuth state/PKCE request, bounded counter client/parser, public-host normalization and deterministic deduplication). It has no route, token exchange/storage, tenant persistence, scheduler, UI or scan handoff.
- `apps/api/src/notifications`: dependency-free notification foundation with a closed event catalog, strict scoped envelopes, server-owned recipient decisions, delivery identity/FSM, minimized content, adapter/outbox ports and Telegram binding/webhook-secret primitives. It has no persistence, route, provider SDK, credential, UI or external delivery.
- `apps/api/src/supervisor`: pre-launch current-state/artifact authorization plus a GUEST_SAFE orchestration boundary. It passes only frozen non-secret scanner input to an injected launcher, owns one deadline/AbortSignal across launch, IPC and exit, kills valid handles that arrive after cancellation, validates one IPC result, canonicalizes/redacts it and obtains the signing key only afterward. Fresh-read wrappers validate and snapshot approval/revocation and exact 256-bit signing keys without caching rotation state. Concrete bounded regular-file sources cover approval, active signing key and a startup 1–3-key verification keyring with duplicate-version denial, strict JSON, symlink/TOCTOU rejection and POSIX permission policy. The worker binds every fresh active signing key byte-for-byte to that verification keyring before use. A fixed process adapter additionally requires an absolute executable/cwd, static bounded arguments and exact approved artifact identity, disables shell/environment inheritance, caps initialization at five seconds, sends only bounded canonical scanner input on stdin and exposes stdout plus TERM/KILL lifecycle. Vault/KMS, Windows ACL evidence, symlink-based secret-volume adapters, production container/egress binding and network execution remain pending.
- `.github/workflows/ci.yml`: format, lint, typecheck, tests, builds and source line-count gate plus separate real PostgreSQL and Redis/BullMQ suites.

The Guest database schema, core repositories/transactions, internal creation composition, BullMQ/supervisor lease flow and a minimal scanner executable are implemented. Durable minimized queue telemetry has an internal runtime, PostgreSQL store, worker lifecycle scheduling and a dedicated process entrypoint, but the worker and alert exporter are not deployed. Guest routes, production worker/container/egress deployment and owned-target live socket/TLS evidence are not implemented or exposed yet.
