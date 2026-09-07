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
- `apps/api`: Fastify trusted boundary exposing `GET /health` and the read-only safe `GET /v1/public/capabilities` metadata projection; scan routes remain unavailable.
- `packages/capabilities`: dependency-free code-first ProductCapability registry and fail-closed public projection. Current production projection is empty until claims and evidence are approved.
- `apps/api/src/guest-crypto`: Guest-session cookie/scope and result-token cryptographic primitives, strict Set-Cookie/Cookie authentication and non-URL Bearer result-access authorization with privacy headers; no public session, scan or result route is exposed.
- `apps/api/src/guest-idempotency`: pure 30-minute Guest scan create/replay/conflict decision over authenticated session scope and a persisted-record view; the concrete transaction/uniqueness adapter lives in `guest-persistence`.
- `apps/api/src/guest-abuse`: closed new-scan admission policy, HMAC-derived network signal and fixed 24-hour retention decision. Live idempotent replay bypasses new quota consumption; PostgreSQL applies the returned session/time-bound six-dimension reservation. `guest-persistence` supplies bounded `SKIP LOCKED` deletion/window-cleanup batches with active-quota reconciliation and an explicit alert flag. Trusted-proxy/key-rotation wiring plus worker scheduling/telemetry are not implemented.
- `apps/api/src/target`: hostname/IDNA canonicalization, bounded runtime DNS factory, A/AAAA orchestration, full-set destination policy and TTL-bound pinned HTTP/TLS dispatch. The transport verifies `socket.remoteAddress`, bounds response framing/headers/body and never follows redirects automatically. A higher flow layer freshly resolves/revalidates before each retry and normalized same-host redirect, blocks HTTPS downgrade and stops cross-host redirects; no API/supervisor wiring is exposed.
- `apps/api/src/scanner-policy`: dependency-free V1 policy authorization module used by the pre-launch boundary, not by a scanner process.
- `apps/api/src/scan-protocol`: pure Job/Attempt FSM and primary-commit/terminal-replay decision logic; the Guest terminal-result adapter applies that decision atomically, while queue/lease acquisition remains pending.
- `apps/api/src/scanner-output`: bounded Guest scanner-output parser/projection and canonical producer. It validates the closed GUEST_SAFE machine schema, deterministically orders fields/collections, redacts evidence before canonical UTF-8 JSON digesting and emits only allowlisted public posture/coverage plus aggregate risk/warning counts. Payload access is copy-on-read.
- `apps/api/src/guest-result`: pure fail-closed public response builder over successful Guest result authorization and sanitized projection. It emits five fixed posture sections, the full canonical coverage inventory and explicit limitations while omitting raw evidence and scanner execution metadata; database lookup, route and UI are not implemented.
- `apps/api/src/guest-scan`: exact PUBLIC_GUEST scan/attempt/result row contracts, immutable hostile-input snapshots and an injected read-only result-store composition. It binds route scan ID, bearer token, accepted attempt/fence/digest, canonical target, access/retention time and sanitized view; PostgreSQL supplies the store, while the HTTP route remains absent.
- `apps/api/src/guest-persistence`: concrete SQL-first Guest idempotency, abuse, terminal-result and result-read adapters. SERIALIZABLE transactions provide bounded retry, atomic six-dimension reservation/create, idempotent concurrency release and one authenticated result commit; live replay and terminal same-digest replay add no duplicate effects. Deletion, queue lifecycle and HTTP routes remain absent.
- `apps/api/src/db` and `apps/api/db/migrations`: ADR-0017 SQL-first PostgreSQL boundary with bounded explicit TLS configuration, a checksummed advisory-locked migration runner and separate Guest scan/attempt/result plus digest-only abuse schemas. No ORM or startup auto-migration is present; Guest public routes remain absent.
- `apps/api/src/scanner-ipc`: one-result local IPC frame encoder/reader with fixed v1 magic, U32BE length, profile output ceiling, one overall deadline, cancellation, fragmentation bound and mandatory EOF. It rejects trailing/multiple frames and exposes only isolated payload copies.
- `apps/api/src/result-envelope`: authenticated ResultEnvelope signing and ingress primitives. The supervisor signer binds job/attempt/fence, workload/audience/time and payload digest/size with HMAC; ingress independently verifies the exact wrapper before exposing isolated payload copies and commit identity.
- `apps/api/src/external-assets` and `apps/api/src/integrations/yandex-metrika`: provider-neutral candidate/provenance contracts plus a closed Yandex Metrika foundation (OAuth state/PKCE request, bounded counter client/parser, public-host normalization and deterministic deduplication). It has no route, token exchange/storage, tenant persistence, scheduler, UI or scan handoff.
- `apps/api/src/notifications`: dependency-free notification foundation with a closed event catalog, strict scoped envelopes, server-owned recipient decisions, delivery identity/FSM, minimized content, adapter/outbox ports and Telegram binding/webhook-secret primitives. It has no persistence, route, provider SDK, credential, UI or external delivery.
- `apps/api/src/supervisor`: pre-launch current-state/artifact authorization plus a GUEST_SAFE orchestration boundary. It passes only frozen non-secret scanner input to an injected launcher, owns the deadline/abort/exit/TERM→KILL flow, validates one IPC result, canonicalizes/redacts it and obtains the signing key only afterward. The production process/container launcher, secret-manager adapter, queue/CAS persistence and actual network execution remain pending.
- `.github/workflows/ci.yml`: format, lint, typecheck, tests, builds and source line-count gate plus a separate real PostgreSQL migration/schema suite.

The initial Guest database schema is implemented. Application repositories/transactions, queue, Guest routes, a production scanner process/container adapter and live outbound probing are not implemented or exposed yet.
