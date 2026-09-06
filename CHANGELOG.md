# CHANGELOG

## [Unreleased] — consistency closure

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
