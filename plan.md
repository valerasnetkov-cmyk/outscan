# OUTSCAN — plan

## Phase 0 — Baseline

- [x] Product concept/three layers.
- [x] Guest boundary.
- [x] TI/Risk/Change Intelligence/Agency direction.
- [x] Living docs.
- [x] Previous synchronized MD package applied to working tree.

## Phase 0A — Consistency closure

### ADR

- [x] Draft ADR-0009…ADR-0014.
- [x] Expand 0009 with pinned connect + challenge/revalidation lifecycle.
- [x] Expand 0010 with complete entity matrix + PLATFORM_GRANT.
- [x] Expand 0011 with job/attempt FSM + exact idempotency/result semantics.
- [x] Harden Guest idempotency with server-authenticated Guest-session scope, canonical token serialization and separate terminal-replay branch.
- [x] Expand 0012 with capability matrix, budgets and machine policy schema.
- [x] Expand 0013 with FindingOccurrence + SufficientBaselineV1.
- [x] Synchronize 0014 with explicit Asset creation and terminology.
- [x] Owner accepted ADR-0009…ADR-0014.

### Evidence / cleanup

- [x] Create `docs/CLAIM_INVENTORY.md`.
- [x] Create `docs/UX_ACCEPTANCE.md`.
- [x] Keep `public/maket.png` temporarily as reference-only first-screen material; it is not accepted Gate A evidence.
- [ ] Before Gate B1/public deployment, move/exclude `public/maket.png` from served runtime assets if still present.
- [x] Old `PRE_SCAFFOLD_CORRECTIONS*` confirmed absent by latest read-only review.
- [x] Latest review confirms old correction drafts are absent; `docs/PRE_SCAFFOLD_GATE.md` is the canonical active gate.
- [x] Owner decision for `agent.md` recorded/resolved; `AGENTS.md` remains canonical.
- [x] Post-application `git diff --check` passed for the currently applied revision.
- [x] Current v3 `git diff --check` PASS confirmed by latest review.
- [x] Current package/security/content consistency review PASS.
- [x] Re-run `git diff --check` after ADR-0009…ADR-0014 status changes.
- [x] Run final Gate A read-only consistency review after ADR acceptance.
- [x] Gate A = PASS.

### ORM

- [ ] Choose data-access ADR only after Gate A data rules accepted.

## Phase 0B — Scaffold after Gate A PASS

- [x] Minimal source scaffold for web, admin and API boundaries.
- [x] CI/test harness with format, lint, typecheck, unit-test, build and line-count stages.
- [x] Add typed code-first ProductCapability registry and strict validation.
- [x] Add fail-closed safe public capability projection.
- [x] Add anonymous read-only `GET /v1/public/capabilities` contract and implementation.
- [x] Remove the homepage's second capability array and render only canonical projection data.
- [x] Add negative tests proving registry visibility cannot grant scanner execution.
- [ ] Activate public capabilities only after claim approval and valid production evidence.
- [ ] Add engine bindings only as production adapters become real.
- [ ] Add read-only Platform Admin capability view later; runtime rollout persistence remains deferred.
- [x] Accept ADR-0015 as a post-Gate-A Notifications & Communications decision.
- [x] Add pure notification catalog/event/recipient/idempotency/FSM/content/adapter contracts and Telegram security primitives.
- [x] Keep notification routes, persistence, provider SDKs, credentials and external delivery absent from the foundation.
- [x] Full local `npm run verify` completed after scaffold creation.
- [x] Public preview browser smoke test completed for desktop and mobile layouts.
- [ ] Graphify.
- [x] trusted Guest supervisor orchestration over an approved launch port, bounded IPC, canonical output and authenticated ResultEnvelope signing.
- [x] trusted supervisor pre-launch ExecutionEnvelope/approval authorization boundary.
- [x] machine scanner-policy validator.
- [x] pure ScanJob/ScanAttempt FSM and result commit/replay decision boundary.
- [ ] job FSM/idempotency persistence.

## Phase 1 — Guest / B1

- [x] strict Guest-session Set-Cookie issuance and Cookie-header authentication primitives.
- [ ] wire the Guest-session bootstrap route after remaining B1 controls pass.
- [x] Guest-session cookie MAC codec and authenticated scope derivation primitives.
- [x] pure Guest idempotency decision scoped by authenticated session digest, never IP/fingerprint.
- [ ] transactional Guest idempotency persistence with unique-key winner reread.
- [x] canonical ADR-0011 Guest result-token derivation/test vectors.
- [x] strict hostname parser + IDNA/Punycode canonicalization with negative tests.
- [x] full-set A/AAAA normalization, deduplication and fail-closed destination classification.
- [x] injectable A/AAAA resolver orchestration with strict response/TTL/error handling.
- [x] bounded runtime `node:dns` Resolver factory with explicit servers/timeouts/tries and restricted facade.
- [x] TTL-bound pinned HTTP/TLS request options preserving Host/SNI/certificate validation.
- [x] bounded pinned HTTP/TLS dispatch with synthetic socket-address evidence.
- [ ] live socket/TLS integration evidence against an owned test target.
- [x] retry/same-host redirect re-resolution, revalidation and pinning tests.
- [ ] GuestScan/GuestScanAttempt.
- [x] Guest result bearer-token authorization with 30m/no-store/no-referrer boundary.
- [ ] wire persisted Guest result lookup and sanitized result route.
- [ ] Guest retention 24h max.
- [ ] abuse limits.
- [x] GUEST_SAFE capability policy and budgets enforced before launch and through output handling.
- [x] bounded Guest scanner-output JSON projection with strict schema and disclosure minimization.
- [x] authenticated ResultEnvelope header/MAC/digest/size validation.
- [x] canonical GUEST_SAFE ScannerResultEnvelope producer with evidence redaction and digest.
- [x] bounded single-result scanner IPC framing/reader with deadline and cancellation.
- [x] injected supervisor launch/pipe/exit/cancellation orchestration and supervisor-side ResultEnvelope HMAC signing.
- [ ] production process/container launcher, secret-manager signing-key provider, queue/CAS state wiring and bounded persistence.
- [ ] full Guest posture.
- [ ] coverage states.
- [ ] WCAG runtime evidence.
- [ ] Gate B1 PASS before exposure.

## Phase 2 — Workspace foundation

- [x] Add provider-neutral External Asset Source/candidate/provenance contracts.
- [x] Add closed Yandex Metrika foundation: `metrika:read` OAuth state/PKCE request, bounded counter pagination/parser, public-host normalization and deterministic deduplication.
- [ ] auth/session/recovery/CSRF.
- [ ] Organization.
- [ ] Add exact host/Create Asset.
- [ ] tenant API/composite FK/RLS.
- [ ] cross-tenant tests.
- [ ] Tenant/Platform audit split.
- [ ] Add encrypted integration-token storage and one-time OAuth transaction persistence after auth/RLS prerequisites.
- [ ] Add organization-scoped Metrika routes, sync/import transactions, lock/scheduler, audit events and Workspace UI.
- [ ] Wire QUICK_SCAN only through current `GUEST_SAFE` policy plus independent ScanAuthorization; no import-derived verification.
- [ ] Add account/user notification endpoint, event/delivery and transactional outbox persistence.
- [ ] Select transactional email provider through ADR; implement verification/recovery delivery and authenticated webhooks.
- [ ] Add bounce/complaint/suppression handling without coupling marketing unsubscribe to mandatory account mail.

## Phase 3 — Verification / baseline

- [ ] TXT exact format.
- [ ] challenge FSM/24h.
- [ ] TXT revalidation 7d.
- [ ] Controlled Deep >24h revalidation.
- [ ] 30d hard scope expiry without successful revalidation.
- [ ] EXACT_HOST.
- [ ] execution ScanAuthorization.
- [ ] Verified Baseline SAFE.
- [ ] FindingOccurrence/Coverage.
- [ ] SufficientBaselineV1.
- [ ] Asset Security Score only when sufficient.
- [ ] Gate B2 PASS before Workspace exposure.

## Phase 4 — TI/Risk/Monitoring

- [ ] NVD/KEV/EPSS.
- [ ] recurrence-aware Risk Engine.
- [ ] targeted CVE via same authorization.
- [ ] explicit MonitoringEnrollment.
- [ ] Organization Security Score monitored set.
- [ ] posture snapshots.
- [ ] Customer technical email/Telegram preferences, delivery history and secure endpoint lifecycle.
- [ ] Separate platform Ops Telegram delivery for worker/queue/scanner/TI/notification health.

## V1.5

- [ ] Change Intelligence diff/significance/timeline/alerts.

## Later

Marketing consent/campaign email, EASM/Asset Graph, Agency/API, dedicated IP/CIDR ADR before network scan, AppSec/API, Supply Chain, Cloud/private scanner, Attack Paths, CTEM, Enterprise/Managed.

## Gate C

- [ ] security suites/build.
- [ ] retention/export/delete/residency.
- [ ] backup+restore.
- [ ] runbooks.
- [ ] Admin MFA/step-up.
- [ ] disclosure contact.
- [ ] privacy/terms/РФ legal review.
- [ ] production claim inventory approval.
