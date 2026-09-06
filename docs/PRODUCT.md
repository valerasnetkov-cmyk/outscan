# Product specification

## Positioning

**OUTSCAN — платформа мониторинга внешних киберрисков.**

OUTSCAN shows external digital posture, meaningful risks and changes without promising absolute security.

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

## Workspace

After registration:

1. create Organization;
2. add exact host Asset;
3. DNS TXT verification;
4. Verified Baseline;
5. Asset Security Score only if SufficientBaselineV1.

Monitoring is separate explicit enrollment.

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

Any pre-V1.5 hero diff is labelled `Концепт будущей возможности V1.5` and must not imply that enabling monitoring unlocks it today.

## Claims

Canonical public claims: CLAIM_INVENTORY.md.
Blocked claims/customer logos must not appear in accepted runtime design.

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
