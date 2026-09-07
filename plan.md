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

- [x] Accept ADR-0017: PostgreSQL 18, versioned SQL migrations and low-level `pg`; no V1 ORM/query builder.

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
- [ ] queue-driven job/lease acquisition and renewal persistence; Guest idempotency and terminal-result persistence are implemented in Phase 1.

## Phase 1 — Guest / B1

- [x] strict Guest-session Set-Cookie issuance and Cookie-header authentication primitives.
- [ ] wire the Guest-session bootstrap route after remaining B1 controls pass.
- [x] Guest-session cookie MAC codec and authenticated scope derivation primitives.
- [x] pure Guest idempotency decision scoped by authenticated session digest, never IP/fingerprint.
- [x] transactional Guest idempotency persistence with SERIALIZABLE bounded retry, unique-key winner reread and atomic expired replacement.
- [x] canonical ADR-0011 Guest result-token derivation/test vectors.
- [x] strict hostname parser + IDNA/Punycode canonicalization with negative tests.
- [x] full-set A/AAAA normalization, deduplication and fail-closed destination classification.
- [x] injectable A/AAAA resolver orchestration with strict response/TTL/error handling.
- [x] bounded runtime `node:dns` Resolver factory with explicit servers/timeouts/tries and restricted facade.
- [x] TTL-bound pinned HTTP/TLS request options preserving Host/SNI/certificate validation.
- [x] bounded pinned HTTP/TLS dispatch with synthetic socket-address evidence.
- [ ] live socket/TLS integration evidence against an owned test target.
- [x] retry/same-host redirect re-resolution, revalidation and pinning tests.
- [x] strict GuestScan/GuestScanAttempt/GuestResult persisted-row contracts and fail-closed snapshot validation.
- [x] PostgreSQL migration for GuestScan/GuestScanAttempt/GuestResult with constraints, deferred accepted-result relationships and FSM/immutability guards.
- [x] Implement the transactional `pg` Guest idempotency repository and strict database-backed result-read store.
- [x] Implement authenticated atomic terminal result commit and same-digest no-write replay with current attempt/fence/lease/deadline checks.
- [ ] Wire the terminal-result rejection audit/metric sink before result-ingress exposure.
- [x] Implement transactional six-dimension abuse reservation with GuestScan create/replace and idempotent terminal concurrency release.
- [x] Implement bounded expired abuse-window cleanup and transactional 24-hour Guest aggregate deletion batches.
- [x] Guest result bearer-token authorization with 30m/no-store/no-referrer boundary.
- [x] compose route-bound result authorization and sanitized view through an injected read-only Guest store port.
- [x] wire the concrete PostgreSQL Guest result lookup into the existing read-store port.
- [ ] wire the sanitized Guest result HTTP route after remaining B1 controls pass.
- [x] pure sanitized Guest result view with five stable posture sections, a complete coverage inventory and explicit limitations.
- [x] pure Guest retention decision enforcing the original 30m access window and fixed 24h deletion deadline.
- [x] Return machine-readable deletion/window/quota-inconsistency counters and alert-required state from each retention batch.
- [ ] Schedule the Guest retention worker and wire durable metrics/alerts before exposure.
- [x] closed Guest burst/daily/concurrency admission policy separated from ownership/idempotency.
- [x] versioned HMAC Guest network-signal derivation from a trusted ingress address with IPv4 `/32`, IPv6 `/64` and mapped-address normalization.
- [x] transactional abuse-counter reservation/release integrated with Guest persistence.
- [ ] trusted proxy/ingress adapter, network-HMAC rotation and public 429/Retry-After wiring.
- [x] GUEST_SAFE capability policy and budgets enforced before launch and through output handling.
- [x] bounded Guest scanner-output JSON projection with strict schema and disclosure minimization.
- [x] authenticated ResultEnvelope header/MAC/digest/size validation.
- [x] canonical GUEST_SAFE ScannerResultEnvelope producer with evidence redaction and digest.
- [x] bounded single-result scanner IPC framing/reader with deadline and cancellation.
- [x] injected supervisor launch/pipe/exit/cancellation orchestration and supervisor-side ResultEnvelope HMAC signing.
- [ ] production process/container launcher, secret-manager signing-key provider, queue/CAS state wiring and bounded persistence.
- [ ] wire the full Guest posture page and registration/verification CTA after the remaining B1 controls.
- [x] honest Guest coverage states with explicit missing/unavailable groups and no Security Score.
- [ ] WCAG runtime evidence.
- [ ] Gate B1 PASS before exposure.

## Phase 1C — Public Security Glossary after B1 critical path

- [x] Document the code-first glossary, search/API/UI/SEO boundary and blocking tests for later implementation.
- [x] Keep V1 metadata-only with no new ADR; require a separate decision for CMS/database, external ingestion, AI production copy or external search.
- [ ] Correct and security-review the supplied seed: blank `monitoring` slug, stale 84/90 count, nine category mismatches and V1 product-policy wording.
- [ ] Add dependency-free `@outscan/glossary` with exact types, review state, strict validation and fail-closed public/hint projections.
- [ ] Add bounded deterministic Russian/English/abbreviation/alias search without Redis, database, fuzzy engine or external service.
- [ ] Add read-only `GET /v1/public/glossary` and canonical-slug detail API with safe cache/error behavior.
- [ ] Add `/glossary` and `/glossary/[slug]` pages, metadata, sitemap, empty/404 states and WCAG 2.2 AA evidence.
- [ ] Integrate one reviewed hint with an existing DNSSEC/DMARC/TLS public label; do not invent unavailable CVE/Workspace UI.
- [ ] Pass registry/content/search/API/Web/security/SEO tests and claim review before activation.
- [ ] Keep Admin editing, exam/game, multilingual workflow and runtime AI for later.

## Phase 1D — Public OUTSCAN manifesto after B1 critical path

- [x] Preserve the owner-supplied manifesto as a canonical draft content source with publication guardrails.
- [ ] Complete section-by-section Claim Inventory mapping and Product/Security/Legal acceptance against actual release evidence.
- [ ] Select the final surface and information architecture; do not place long-form copy inside the Guest scan critical flow.
- [ ] Publish only implemented claims: omit or future-label discovery, Change Intelligence, remediation/recheck, Monitoring, Threat Intelligence and AI passages until their own gates pass.
- [ ] Verify semantic headings, readable line length, WCAG 2.2 AA, keyboard behavior, 320px reflow, metadata and canonical URL before activation.
- [ ] Keep Gate B1 as the critical path; the stored draft is not B1/B2/C evidence and creates no route, API or scanner capability.

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

## Phase 3C — Security Question Registry and Check-ins after B2

- [x] Document corrected server-only registry, user preference/progress, API/UX/privacy boundaries and blocking tests.
- [x] Keep the module out of Gate A/B1/B2 evidence and require no new ADR for the code-first fixed-choice design.
- [ ] Specify and owner-accept Cyberexam separately; verify the actual bank/attempt model before assigning O09 or claiming 8/8/8 and 12-question behavior.
- [ ] Add strict server-only versioned question registry with separate Cyberexam and Workspace pre/post-answer projections.
- [ ] Add proposed administrator-offboarding case only after ID/version/scoring/content review; preserve explicit no-internal-access/offboarding boundary.
- [ ] Add GLOBAL user-owned popup preference/progress to ADR-0010, persistence and account export/delete policy; store no Organization/customer data.
- [ ] Add authenticated/CSRF-protected current-user next/list/answer/defer/preference API with concurrency, cooldown and idempotency controls.
- [ ] Add manual Question Center before the optional automatic desktop card/mobile sheet; keep the global rollout disabled until release evidence.
- [ ] Add privacy-safe coarse analytics without selected answers, correctness, question text or user/organization identity.
- [ ] Pass projection confidentiality, cross-user/privacy, score/finding/notification isolation, API abuse and WCAG suites before enablement.
- [ ] Keep ORGANIZATION questions, internal identity ingestion, Admin/CMS editing, runtime AI and organization reporting disabled.

## Phase 3D — Action Center foundation after B2

- [x] Document staged Action Center/Change/Triage/Monitoring/Emerging Threat/Lifecycle boundaries and blocking suites without changing Gate B1 priority.
- [ ] Add `RemediationAction` to ADR-0010 and implement tenant/RLS/audit persistence only after durable Findings and B2.
- [ ] Add one active action per Finding with assignment, due date, server-owned transitions and no free-form notes in the first slice.
- [ ] Keep `REPORTED_COMPLETE` separate from Finding RESOLVED; close as verified only from compatible canonical coverage/FindingEvent.
- [ ] Route request-recheck through server-derived target plus current EXACT_HOST VerifiedScope, entitlement, ScanAuthorization and ADR-0012 policy.
- [ ] Add bounded tenant Action list/detail/create/update/recheck API and action-oriented Workspace projection.
- [ ] Pass tenant, membership, concurrency/idempotency, recheck authorization and Finding/Risk/Score isolation suites.

## Phase 4 — TI/Risk/Monitoring

- [ ] NVD/KEV/EPSS.
- [ ] recurrence-aware Risk Engine.
- [ ] targeted CVE via same authorization.
- [ ] explicit MonitoringEnrollment.
- [ ] Organization Security Score monitored set.
- [ ] posture snapshots.
- [ ] Customer technical email/Telegram preferences, delivery history and secure endpoint lifecycle.
- [ ] Separate platform Ops Telegram delivery for worker/queue/scanner/TI/notification health.
- [ ] Add closed preset MonitoringRulePreference catalog after MonitoringEvent + notification persistence; no custom DSL/scripts.
- [ ] Add EmergingThreatEvaluation without scan bypass or unsupported clean/not-affected claims.
- [ ] Add source/version/freshness-aware TechnologyLifecycleObservation separate from CVE Finding state.

### Weekly Security Digest (ADR-0016 Proposed)

- [x] Document deterministic product, data, security and integration boundaries for later implementation.
- [ ] Owner-accept ADR-0016 after Organization/RLS, notification persistence and canonical TI shapes are available for consistency review.
- [ ] Add organization settings: explicit enablement, IANA timezone, weekday/local time and locale; disabled by default.
- [ ] Add tenant/RLS-backed generation attempt, immutable issue and closed typed item/source-watermark snapshots.
- [ ] Add deterministic priority/section selection and safe plain-text/HTML rendering from canonical Monitoring/Finding/Risk/TI data.
- [ ] Extend Capability Registry with reviewed release timestamps and organization entitlement projection before enabling the capability section.
- [ ] Add `WEEKLY_SECURITY_DIGEST_READY` as a MONITORING tenant event and connect transactional outbox/current-recipient resolution/email delivery.
- [ ] Add tenant settings/history API and WCAG UI; keep manual send/preview/regeneration absent from V1.
- [ ] Pass the blocking tenant, recipient, idempotency, stale-source, content, entitlement and operations suites before enablement.
- [ ] Consider bounded AI editorial V2 only through a separate accepted decision after deterministic V1 evidence.

## Phase 4B — Promotions and Access Grants after B2

- [x] Document corrected product/data/API/security/operations/UI boundaries and blocking tests without changing Gate B1 priority.
- [x] Preserve `entitlement != verification != VerifiedScope != ScanAuthorization != MonitoringEnrollment`; reject the supplied `ADMIN_ATTESTED` shortcut under current ADR-0009.
- [ ] Accept ADR-0010 classifications/retention plus a closed versioned AccessPreset/effective-entitlement composition decision after Subscription and tenant foundations exist.
- [ ] Implement standard `TRIAL`/`CAMPAIGN_TRIAL`, keyed-hash promo secrets, one grant per organization/promotion and immutable entitlement snapshots.
- [ ] Add transactional redemption capacity/idempotency, direct commercial grant/revoke and timestamp-authoritative expiry without rewriting paid Subscription.
- [ ] Add tenant read projection and separately authorized/audited Platform Admin operations; Support denied by default.
- [ ] Add accurate accessible Workspace/admin UI, notification events and privacy-safe campaign analytics only through canonical boundaries.
- [ ] Pass `PROMOTIONS_ACCESS_GRANTS_TESTING.md` plus Product/Legal/claim review before rollout.
- [ ] Keep administrative proof-of-control override absent; any future exception requires a separate ADR amending ADR-0009 and dedicated security evidence.

## V1.5

- [ ] Change Intelligence deterministic compatible-snapshot diff/significance/timeline/alerts per accepted ADR-0007.
- [ ] Extend canonical MonitoringEvent before considering a parallel change-event entity.
- [ ] Add AssetTriage with declared ownership/environment/responsibility/criticality/tags; none establish verification or monitoring.
- [ ] Feed meaningful change/action items into the existing Weekly Security Digest, maximum three actions.
- [ ] Keep visual preview deferred: HEADLESS_BROWSER remains denied in V1 and preview requires a separate later ADR/isolation gate.

## Later

Marketing consent/campaign email, EASM/Asset Graph, Agency/API, dedicated IP/CIDR ADR before network scan, AppSec/API, Supply Chain, Cloud/private scanner, Attack Paths, CTEM, Enterprise/Managed. Brand Protection, DMARC aggregate-report ingestion, credential exposure, visual preview, custom monitoring DSL and ticket integrations require their documented separate security/legal/product decisions.

## Gate C

- [ ] security suites/build.
- [ ] retention/export/delete/residency.
- [ ] backup+restore.
- [ ] runbooks.
- [ ] Admin MFA/step-up.
- [ ] disclosure contact.
- [ ] privacy/terms/РФ legal review.
- [ ] production claim inventory approval.
