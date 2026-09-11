# OUTSCAN

**OUTSCAN** — SaaS-платформа мониторинга внешних киберрисков и цифрового периметра организации.

Domain: `outscan.ru`
Repository: `https://github.com/valerasnetkov-cmyk/outscan.git`
Slogan: **Внешние риски под контролем.**

## Product flow

`Guest Scan → Registration → Organization → Add exact host/Create Asset → DNS Verification → Verified Baseline → Asset Security Score → optional MonitoringEnrollment`.

Guest is safe/non-intrusive, not purely passive.

## V1 scope

Input: hostname/domain only.
VerifiedScope: EXACT_HOST only.

Disabled:

- DOMAIN_SUBTREE;
- IP/CIDR;
- Naabu/raw TCP;
- ACTIVE;
- authenticated scanning.

DNS verification requires persistent TXT and revalidation per ADR 0009.

## Guest idempotency boundary

Anonymous scan replay is scoped by a server-issued, Secure/HttpOnly host-only Guest-session cookie. Bootstrap and scan admission freshly read and validate the same bounded active/retained MAC keyring; bootstrap reuses a valid session without lifetime refresh and replaces missing/invalid/revoked credentials without restoring old ownership, while admission observes retained-key removal before persistence or queue access. A hardened mounted-file provider supplies the versioned keyring for later deployment composition. Both paths independently await PostgreSQL revocation state and fail unavailable on ambiguity. Detached same-origin plugins validate their HTTP contracts but are not registered in `buildApp()` before Gate B1. IP/NAT/User-Agent/browser fingerprint are abuse signals only, not authorization/idempotency ownership.

Result-token derivation and replay semantics are defined in ADR 0011.

New Guest scans are subject to a closed server-owned burst/daily/concurrency policy over authenticated session scope and a pseudonymous network signal. A trusted-ingress adapter ignores forwarding metadata from untrusted socket peers and walks only a bounded `X-Forwarded-For` chain behind an explicit proxy CIDR allow-list. The HMAC signal uses IPv4 `/32` or IPv6 `/64`; an active-plus-retained keyring and transactional multi-digest reads preserve live quota through staged rotation while new usage is written only to the active digest. PostgreSQL atomically reserves all six dimensions with GuestScan creation/replacement, while a valid live replay consumes nothing and terminal completion releases concurrency once. One bounded scheduled process deletes due Guest aggregates at the fixed 24-hour deadline, releases orphaned active quota, prunes expired windows and Guest-session revocations, and never overlaps cycles. Its minimized PLATFORM/INTERNAL run outcome and closed alert state expire after 30 days. Raw IP, User-Agent and browser fingerprint never become ownership keys. Deployment, alert export and public enforcement remain pending Gate B1 work.

The pure Guest result view turns an authorized sanitized projection into five stable posture sections and a complete eight-group coverage inventory, including explicit missing/unavailable states and no-score/no-assurance limitations. It omits raw evidence, finding details and scanner execution metadata. PostgreSQL-backed lookup and a detached fail-closed Fastify result plugin are implemented, but `buildApp()` does not register the route; public registration, page rendering and runtime accessibility evidence remain pending Gate B1 work.

The internal GuestScan boundary validates exact PUBLIC_GUEST scan, attempt and accepted-result row snapshots. PostgreSQL supplies constrained scan/attempt/result, digest-only abuse, minimized rejection-event and retention-run tables. The creation service composes the authenticated Guest session, canonical hostname, trusted ingress/network HMAC, transactional create/replay and deterministic BullMQ enqueue. A detached same-origin POST adapter now enforces bounded JSON/single-header input and closed `200/202/400/401/409/429/503` projection, but is not registered in `buildApp()`. A replay re-enqueues the same scan ID to recover the commit/enqueue crash window; no result token is returned unless enqueue acknowledges that exact ID. A rejected commit must be idempotently recorded against its attempt/fence before retry, without target, payload, digest, token or scanner data. Worker deployment/exported alerts and every Guest HTTP mutation route remain publicly unregistered.

## Security architecture

```text
Web/Admin
  ↓
API
  ↓
PostgreSQL / BullMQ
                 ↓
         trusted supervisor
                 ↓
        disposable scanner
                 ↓
       controlled Internet
```

Outbound probes pin actual connection to validated IP while preserving Host/SNI/certificate hostname verification.

Scanner gets no DB/Redis/Result-Ingress credential.

## Core concepts

- ProductCapability registry for public/product metadata only;
- Asset / AssetRelation;
- DomainVerification / VerifiedScope;
- ScanRequest / ScanJob / ScanAttempt;
- ExecutionEnvelope;
- ResultEnvelope with ScannerResultEnvelope payload;
- Finding / FindingOccurrence / FindingEvent / FindingDisposition / FindingCoverage;
- AssetPostureSnapshot;
- Asset Security Score / Organization Security Score;
- MonitoringEnrollment;
- Notifications & Communications event/delivery boundary;
- proposed deterministic organization Weekly Security Digest;
- planned code-first public Security Glossary metadata;
- planned post-B2 server-only Security Question Registry and user Check-ins;
- deferred post-B2 Action Center and V1.5 Change Intelligence workflow;
- proposed post-B2 Promotions/Access Grants entitlement layer;
- PartnerDelegation / SupportAccessGrant.

Public capability surfaces are generated from the Product Capability Registry. Scanner execution remains independently controlled by `ScanAuthorization` and the ADR-0012 scanner policy.

The first External Asset Sources foundation supports bounded Yandex Metrika counter parsing, hostname normalization and candidate provenance without exposing routes or credentials. Metrika discovery never establishes verification or scan authority; the full Workspace delivery remains gated by Organization authz, RLS, audit and encrypted secret storage. See `docs/YANDEX_METRIKA_ASSET_IMPORT.md`.

Notifications use a closed event → future transactional outbox → server-side policy/preferences → isolated channel-adapter design. The current foundation contains pure contracts and Telegram security primitives only; no route, provider SDK, credential or external delivery exists. See `docs/NOTIFICATIONS_COMMUNICATIONS.md` and ADR 0015.

The current Guest supervisor foundation composes approved execution state, a frozen non-secret launch plan, bounded local IPC, canonical target-bound output and supervisor-only ResultEnvelope HMAC signing. BullMQ producer/consumer and PostgreSQL lease heartbeat/result-commit/rejection orchestration are connected by an internal worker runtime with strict TLS-explicit Redis configuration and idempotent lifecycle. The worker schedules non-overlapping flushes of closed queue outcomes into stable immutable PLATFORM batches without Guest/target/payload identifiers and performs one final flush after transport shutdown; production deployment and approved Ops export remain pending. Approval, active signing key and the startup active+retained verification keyring can be supplied by bounded regular-file readers suitable for controlled read-only secret mounts; strict formats, duplicate versions, symlink/TOCTOU and POSIX permissions fail closed. A dedicated worker CLI binds those providers to the PostgreSQL/Redis runtime and fixed shell-free scanner process adapter; startup requires the active signing key to match the verification keyring. A minimal first-party scanner executable reuses the full-set DNS policy and pinned HTTPS flow to report resolution, IPv6, TLS, conservative security-header posture and a bounded same-host RFC 9116 `security.txt` subset while marking other detector groups unavailable. Its versioned process argument also carries a strict deployment-specific internal CIDR deny-list applied on every resolution. This is not Vault/KMS, Windows ACL, container/egress isolation, live-target or deployment evidence. No Guest route is exposed yet.

## Scores

Asset Security Score exists only when `SufficientBaselineV1=true`.
Organization Security Score includes explicitly monitored assets only.

## Change Intelligence

V1 stores snapshots/provenance.
V1.5 adds full diff/significance/timeline/alerts.

## Claims / design

Public copy follows `docs/CLAIM_INVENTORY.md`.
Design/accessibility contract: `docs/UX_ACCEPTANCE.md`.
`public/maket.png` is retained temporarily as a reference for the first-screen build. It is not accepted Gate A evidence and must not drive blocked claims or nonconforming visual decisions; before Gate B1/public deployment it must be moved/excluded if it would be served.

## Gate

See `docs/PRE_SCAFFOLD_GATE.md`.

Current: package/security/content consistency PASS; ADR-0009…ADR-0014 are Accepted; post-acceptance checks passed; Gate A PASS. Minimal source scaffold and CI/test harness are in place; Gate B1 work is in progress.

Capability Registry integration does not reopen Gate A. Its public API and homepage block remain non-deployed until applicable Gate B1 and claim/evidence requirements pass.

The Yandex Metrika foundation also leaves Gate A unchanged. It is not publicly exposed and does not make Gate B2 PASS.

ADR-0015 is an accepted post-Gate-A decision. Its notification foundation does not reopen Gate A/B1 and does not make Gate B2 PASS.

ADR-0017 accepts PostgreSQL 18 with versioned SQL migrations and the low-level `pg` driver; no ORM/query builder is used in V1. The decision does not reopen Gate A and the schema alone does not make Gate B1 PASS.

Weekly Security Digest is documented as a deferred Phase 4 proposal under ADR-0016. It has no source, route, scheduler or active notification event and does not affect Gate A/B1. See `docs/WEEKLY_SECURITY_DIGEST.md`.

Security Glossary is planned as a post-B1 code-first public metadata module with no CMS/database or scan authority. Its supplied seed requires correction and review before import. See `docs/SECURITY_GLOSSARY.md`.

Security Check-ins are documented as an optional post-B2 educational Workspace module. No Cyberexam bank, question registry, preference, API or UI is implemented or approved as current product behavior. See `docs/SECURITY_CHECKINS.md`.

Action Center and Change Intelligence are staged deferred Workspace capabilities. Gate B1 remains first; user-reported remediation, triage or TI candidates never resolve Findings or expand verification/scan authority. See `docs/ACTION_CHANGE.md`.

The owner-supplied OUTSCAN manifesto is retained as a canonical draft content source for later insertion into the product/site body. Only its already approved brand lines may be reused now; the remaining copy requires feature-by-feature claim evidence and gate-aware Product/Security/Legal review before publication. See `docs/OUTSCAN_MANIFESTO.md`.

Promotions/Access Grants are documented for later post-B2 commercial implementation. A grant may contribute only to server-calculated entitlement; it never creates verification, consent, monitoring enrollment or scan authority. The supplied `ADMIN_ATTESTED` bypass is not accepted under ADR-0009 and requires a separate future ADR. See `docs/PROMOTIONS_ACCESS_GRANTS.md`.

## Development

Current deployment target: an Ubuntu server with Docker Compose. Gate B1 implementation must be designed and verified for this environment; later scanner execution workers may move to Kubernetes while preserving the existing supervisor/scanner trust boundary and job/IPC contracts. This is an accepted deployment direction, not deployment or Gate B1 evidence. See [deployment target](docs/DEPLOYMENT_TARGET.md).

Read:

1. `AGENTS.md`;
2. `docs/PRE_SCAFFOLD_GATE.md`;
3. `plan.md`;
4. `CHANGELOG.md`;
5. relevant docs/ADR;
6. latest audit.

Graphify only after Gate A PASS and meaningful source scaffold.

### Local commands

Requirements: Node.js 24+ and pnpm 11.19.0.

```text
pnpm install
pnpm dev:web
pnpm dev:api
pnpm dev:admin
pnpm verify
pnpm verify:db
```

Database verification requires an isolated PostgreSQL 18 test database in `OUTSCAN_TEST_DATABASE_URL`. Schema changes are applied explicitly with `OUTSCAN_DATABASE_URL` and `OUTSCAN_DATABASE_SSL=disable|require` via `pnpm --filter @outscan/api db:migrate`; the API never migrates automatically at startup.

The public scan control is intentionally disabled. No Guest Scan endpoint or outbound scanner is exposed before Gate B1.
