# UI / UX direction

Canonical design evidence:

- `UX_ACCEPTANCE.md`
- `CLAIM_INVENTORY.md`
- ADR 0014

## Art direction

Calm, strict, data-first:
`TEXT + NUMBER + STATUS + LINE + TABLE`.

Dark hero + light lower content.

Do not use globe/radar/glow/neon/shield/lock/hacker decoration, excessive cards or fear marketing.

## Public input

Permanent label: `Домен`.
Helper: `Введите домен без https://, пути и порта.`

States:

- normal;
- invalid;
- blocked/unavailable;
- submitting/progress;
- visible keyboard focus.

Placeholder never replaces label.

## Public capabilities

`Возможности OUTSCAN` is rendered only from the safe Product Capability Registry projection. The page has no second capability array.

Each visible item presents outcome-first copy and a textual access label distinguishing Guest-safe, verified, controlled and system capabilities. Visibility never implies that a Guest can execute verified-only checks or that a particular asset has coverage.

If registry validation fails or no claim/evidence-approved production capabilities exist, hide the block while keeping the Guest flow usable. Do not fall back to unrelated hardcoded content.

## Guest Result

Dedicated page:

1. target/completion;
2. Infrastructure;
3. Domain;
4. Mail;
5. Certificate;
6. coverage;
7. potential-risk aggregate;
8. registration/verification CTA.

Statuses:

- Норма;
- Требует внимания;
- Не проверено;
- Не определено;
- Неприменимо.

No subdomain list/CVE/endpoints/vulnerable versions/raw evidence.

## Onboarding

`Guest → Registration → Organization → Add exact host/Create Asset → DNS Verification → Verified Baseline → Asset Security Score → optional MonitoringEnrollment`.

Verification does not start monitoring/billing.

## Scan copy

Guest Safe = safe/non-intrusive.
Use `passive` only for truly passive sources.
Controlled Deep requires per-run consent.
Active/IP/CIDR/raw TCP disabled.

## Score UI

Do not show Asset Security Score until SufficientBaselineV1.

If insufficient:

- show missing/failed detector groups;
- no fake score;
- zero findings ≠ safety.

Organization Security Score is explicitly monitored-asset scope.

## Findings

Condition, occurrence, transition and disposition are distinct.
Technical drill-down may show recurrence/coverage when it changes priority.

## Change Intelligence

V1.5:
`before → after → when → why it matters → action`.

Before V1.5, hero diff label:
`Концепт будущей возможности V1.5`.

## Claims

Follow CLAIM_INVENTORY.
Existing public/maket.png is reference-only and must not be treated as Gate A evidence. It may inform first-screen layout, but blocked claims/nonconforming motifs must not be copied; remove/exclude it before Gate B1/public deployment if it would be served.

## Brand

Separate mark/wordmark/lockups.
Tagline normally HTML.
Use outscan.ru consistently.
No stale 2024.

## Accessibility

Target WCAG 2.2 AA.

Gate A design evidence:

- intended ≥4.5:1 text contrast where applicable;
- visible focus;
- keyboard reachability;
- semantic label/error plan;
- non-color-only status;
- live-region plan;
- 320px reflow.

Gate B1/B2 prove actual CSS/DOM/keyboard/screen-reader behavior.
