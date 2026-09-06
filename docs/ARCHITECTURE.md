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
- `apps/api/src/guest-idempotency`: pure 30-minute Guest scan create/replay/conflict decision over authenticated session scope and a persisted-record view; database transaction/uniqueness wiring is not implemented.
- `apps/api/src/target`: hostname/IDNA canonicalization, bounded runtime DNS factory, A/AAAA orchestration, full-set destination policy and TTL-bound pinned HTTP/TLS dispatch. The transport verifies `socket.remoteAddress`, bounds response framing/headers/body and never follows redirects automatically. A higher flow layer freshly resolves/revalidates before each retry and normalized same-host redirect, blocks HTTPS downgrade and stops cross-host redirects; no API/supervisor wiring is exposed.
- `apps/api/src/scanner-policy`: dependency-free V1 policy authorization module used by the pre-launch boundary, not by a scanner process.
- `apps/api/src/scan-protocol`: pure Job/Attempt FSM and primary-commit/terminal-replay decision logic; persistence is not implemented.
- `apps/api/src/scanner-output`: bounded Guest scanner-output parser/projection and canonical producer. It validates the closed GUEST_SAFE machine schema, deterministically orders fields/collections, redacts evidence before canonical UTF-8 JSON digesting and emits only allowlisted public posture/coverage plus aggregate risk/warning counts. Payload access is copy-on-read.
- `apps/api/src/scanner-ipc`: one-result local IPC frame encoder/reader with fixed v1 magic, U32BE length, profile output ceiling, one overall deadline, cancellation, fragmentation bound and mandatory EOF. It rejects trailing/multiple frames and exposes only isolated payload copies.
- `apps/api/src/result-envelope`: authenticated ResultEnvelope signing and ingress primitives. The supervisor signer binds job/attempt/fence, workload/audience/time and payload digest/size with HMAC; ingress independently verifies the exact wrapper before exposing isolated payload copies and commit identity.
- `apps/api/src/external-assets` and `apps/api/src/integrations/yandex-metrika`: provider-neutral candidate/provenance contracts plus a closed Yandex Metrika foundation (OAuth state/PKCE request, bounded counter client/parser, public-host normalization and deterministic deduplication). It has no route, token exchange/storage, tenant persistence, scheduler, UI or scan handoff.
- `apps/api/src/notifications`: dependency-free notification foundation with a closed event catalog, strict scoped envelopes, server-owned recipient decisions, delivery identity/FSM, minimized content, adapter/outbox ports and Telegram binding/webhook-secret primitives. It has no persistence, route, provider SDK, credential, UI or external delivery.
- `apps/api/src/supervisor`: pre-launch current-state/artifact authorization plus a GUEST_SAFE orchestration boundary. It passes only frozen non-secret scanner input to an injected launcher, owns the deadline/abort/exit/TERM→KILL flow, validates one IPC result, canonicalizes/redacts it and obtains the signing key only afterward. The production process/container launcher, secret-manager adapter, queue/CAS persistence and actual network execution remain pending.
- `.github/workflows/ci.yml`: format, lint, typecheck, tests, builds and source line-count gate.

Database, queue, Guest routes, a production scanner process/container adapter and live outbound probing are not implemented or exposed yet.
