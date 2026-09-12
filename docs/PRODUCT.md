# Product specification

## Positioning

**OUTSCAN — платформа мониторинга внешних киберрисков.**

OUTSCAN shows external digital posture, meaningful risks and changes without promising absolute security.

The [mission](OUTSCAN_MISSION.md), [positioning](COMPETITIVE_POSITIONING_AND_OBJECTIONS.md) and [AI-era strategy](AI_ERA_PRODUCT_STRATEGY.md) preserve `Assets → Changes → Risks → Priority → Remediation → Recheck → Monitoring`. The system that created a change must not be the only source assessing its safety: **Создать можно автоматически. Контролировать нужно независимо.** These are planning principles, not production claims.

## Audience and Creator acquisition

AI-enabled Builders include entrepreneurs, designers/vibe coders, product managers, freelancers, studios, agencies and small teams without a dedicated security engineer. [Creator GTM](CREATOR_VIBE_CODING_GTM.md) is the early self-service acquisition focus, with a path toward Studio/Agency/MSP/SMB/EASM; it does not replace the long-term market.

Telegram/YouTube partnerships, referral attribution and possible Creator packaging are commercial hypotheses, not active channels/pricing or scan authority. There is no separate AI tariff. Web Guest campaigns wait for B1; direct Telegram scans additionally require reviewed channel/session/abuse controls. Workspace/Monitoring/AI Handoff wait for their own B2/phase prerequisites.

## Product simplicity

[Product Simplicity](PRODUCT_SIMPLICITY_UX.md) keeps complexity inside OUTSCAN: state → importance → action → authorized technical detail → evidence. The 10s state / 30s action / deep-dive target is a UX goal, not a performance SLA. Preserve uncertainty, coverage and Guest redaction. Product Capability Registry stays canonical, with curated user-oriented presentation instead of an automatic feature wall.

## Canonical user journey

```text
OUTSCAN.ru
→ domain input
→ Guest Safe Scan
→ Network & Domain Posture + N potential risks
→ Registration
→ Organization
→ Add exact host / Create Asset
→ DNS TXT Verification
→ VerifiedScope(EXACT_HOST)
→ Verified Baseline
→ SufficientBaselineV1?
→ Asset Security Score / Findings
→ optional MonitoringEnrollment
→ next comparable snapshot
→ Organization monitoring / Change Intelligence
```

Asset creation explicitly precedes verification because verification is an Asset subresource.

## Public

No registration/verification.
Guest checks are **safe/non-intrusive**.

They may use direct DNS/TLS/HTTP requests and genuinely passive/public sources such as RDAP/CT/intelligence.

Do not call the entire Guest flow passive.

Guest shows Infrastructure, Domain, Mail, Certificate posture, honest coverage states and potential-risk aggregate.

Guest hides discovered subdomains, CVE details, endpoints, vulnerable versions and raw evidence.

Guest uses Baseline posture, not Security Score.

## Product Capability Registry

One code-first `ProductCapability` catalog supplies public capability surfaces and later Workspace, report and tariff presentation. It represents supported OUTSCAN behavior, not the raw feature list of an upstream scanner.

A public capability is a product claim and requires an active rollout, approved copy and valid production evidence. Availability does not prove asset-specific coverage and cannot authorize execution; `VerifiedScope`, `ScanAuthorization`, entitlement, consent and ADR-0012 scanner policy remain separate.

## Security Glossary

The planned post-B1 Security Glossary is one reviewed Russian-first vocabulary for public term pages and explicit product help. It is descriptive content only: a term or related-capability link cannot assert feature availability, coverage, Risk, verification or scan authority. Seed copy must pass claim/security review before publication.

## Security Check-ins

Planned post-B2 Check-ins are optional fixed-choice KNOWLEDGE questions for the current authenticated user. They do not assess the Organization, verify internal controls, create Findings or affect technical scores. The supplied administrator-offboarding case remains proposed until a canonical Cyberexam/question-bank decision and content review exist.

## Workspace

After registration:

1. create Organization;
2. add exact host Asset;
3. DNS TXT verification;
4. Verified Baseline;
5. Asset Security Score only if SufficientBaselineV1.

Monitoring is separate explicit enrollment.

## Promotions and Access Grants

The proposed post-B2 commercial layer may add temporary standard/campaign/direct-admin entitlements without rewriting paid Subscription. Grant state never creates ownership, DomainVerification, VerifiedScope, consent, MonitoringEnrollment or ScanAuthorization. `ADMIN_ATTESTED` is not an accepted verification method under ADR-0009 and remains absent pending a separate future ADR.

### Scan modes

- Guest Safe: safe/non-intrusive.
- Verified Baseline: EXACT_HOST + approved SAFE capabilities.
- Controlled Deep: EXACT_HOST + per-run consent.
- Active: disabled.
- IP/CIDR/Naabu/raw TCP: disabled V1.

## Platform Admin

Separate privileged surface. Support detail access requires SupportAccessGrant.

## Findings

Condition: OPEN|RESOLVED.
Events: OPENED|RESOLVED|REOPENED.
Occurrences: each accepted positive comparable detection.
Disposition: NONE|ACKNOWLEDGED|ACCEPTED_RISK|FALSE_POSITIVE.
Coverage independent.

Automatic RESOLVED disabled until compatible-coverage rules exist.

## Scores

Asset Security Score: sufficient verified baseline only.
Organization Security Score: explicitly monitored asset set only.

## Monitoring / Change Intelligence

V1 stores versioned snapshots/provenance.
V1.5 provides diff/significance/timeline/alerts.

After B2, Action Center may add assignment/due/report-complete/recheck workflow over canonical Findings. Reported remediation is never verified resolution; recheck uses current server-derived EXACT_HOST authorization. V1.5 asset triage is customer metadata only and cannot establish ownership verification or monitoring.

Any pre-V1.5 hero diff is labelled `Концепт будущей возможности V1.5` and must not imply that enabling monitoring unlocks it today.

## Claims

[Reporting](REPORTING.md) is a proposed post-B2 projection of immutable canonical data, with JSON first, then MD/AI Handoff, PDF/bundle and Workspace history. It cannot start scans, change Finding/Risk/Score, resolve remediation or grant tools. Automatic RESOLVED and score gating remain governed by ADR-0013; full change presentation remains V1.5. The promo game and glossary seed are documentation-only/DRAFT.

Canonical public claims: CLAIM_INVENTORY.md.
Blocked claims/customer logos must not appear in accepted runtime design.

The owner-supplied [OUTSCAN manifesto](OUTSCAN_MANIFESTO.md) is a draft narrative source, not current capability evidence. Publication is section-by-section: brand copy may use existing approved lines, while discovery, Change Intelligence, remediation/recheck, Monitoring, Threat Intelligence and AI wording waits for its implemented release state and Product/Security/Legal review.

## Differentiation

- useful Guest posture;
- explainable exact-host trust model;
- recurrence-aware Risk Engine;
- Change Intelligence;
- Asset relations/provenance;
- business summary + technical drill-down;
- Agency delegated tenancy;
- monitored-asset billing.

## Communication

Allowed:

- `Обнаружен риск`;
- `Потенциальный риск`;
- `Требует внимания`;
- `Проверка завершена`;
- `Мониторинг активен`.

Forbidden:

- `100% безопасно`;
- `защищено от взлома`;
- guaranteed protection;
- full automatic pentest claim.

## Trust and pre-payment evidence — proposed

Users should be able to evaluate methodology before payment and, after the required
Workspace/verification/entitlement foundations, run one bounded verified Proof Scan.
[Trust](TRUST_METHODOLOGY_AND_EVIDENCE.md) explains observation, confidence, TI freshness,
coverage and Risk without granting authority. [Proof Scan and Demo Report](PROOF_SCAN_AND_DEMO_REPORT.md)
remain future; paid value remains explicit monitoring, history, changes and remediation
workflow. No pricing, monitoring enrollment or publication is activated by this design.
