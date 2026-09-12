# OUTSCAN — UX / Accessibility Design Acceptance

**Status:** Canonical Gate A evidence
**Review date:** 2026-09-03
**Owner:** Product / Design

## Accepted visual direction

- dark hero;
- light lower content;
- data-first layout;
- `TEXT + NUMBER + STATUS + LINE + TABLE`;
- no globe/radar hero decoration;
- no glow/neon/shield/lock/hacker imagery;
- no unsupported logos/claims;
- minimal cardization.

## Guest input

Required:

- permanent label `Домен`;
- helper `Введите домен без https://, пути и порта.`;
- placeholder only as example;
- invalid state;
- blocked/unavailable state;
- submitting/progress state;
- visible keyboard focus.

## Guest Result

Dedicated full screen:

1. target/status;
2. Infrastructure;
3. Domain;
4. Mail;
5. Certificate;
6. coverage states;
7. `N дополнительных потенциальных рисков`;
8. registration/verification CTA.

Statuses:

- `Норма`;
- `Требует внимания`;
- `Не проверено`;
- `Не определено`;
- `Неприменимо`.

Do not expose CVE details, discovered subdomains, endpoints, vulnerable versions or raw evidence.

## Canonical onboarding

`Guest Scan → Registration → Organization → Add exact host / Create Asset → DNS TXT Verification → Verified Baseline → Asset Security Score → optional MonitoringEnrollment`.

## Scan language

- Guest Safe — safe/non-intrusive.
- Verified Baseline — exact-host approved SAFE capabilities.
- Controlled Deep — exact-host + explicit per-run consent.
- Active — disabled V1.
- IP/CIDR/raw TCP — disabled V1.

Use `passive` only for genuinely passive sources such as CT/RDAP/passive intelligence.

## Accessibility design evidence

Gate A design must support:

- WCAG 2.2 AA target;
- intended normal text contrast ≥4.5:1 where required;
- visible focus;
- keyboard-reachable form/CTA;
- semantic label/error/help plan;
- status text in addition to color;
- live-region plan for scan progress/result;
- 320px reflow;
- zoom/reflow;
- no essential hover-only information.

Before V1.5, any Change Intelligence diff shown in a concept/prototype must be labelled `Концепт будущей возможности V1.5`, not as a feature unlocked by enabling monitoring.

Actual CSS/DOM/keyboard/screen-reader conformance is Gate B1/B2 evidence, not something a PNG can prove.

## Information hierarchy

Follow [Product Simplicity](PRODUCT_SIMPLICITY_UX.md): conclusion → why it matters → action → authorized technical detail/evidence. Curate the canonical public capability projection rather than dumping internal taxonomy. Review critical surfaces against 10s state / 30s action / deep-dive understanding as usability targets, not measured SLAs or current evidence.

Progressive disclosure operates within existing permissions. Guest still omits CVE details, discovered subdomains/endpoints/versions/raw evidence; no expandable panel may reveal them. Uncertainty, coverage and limitations stay visible. Future Workspace actions/changes and Creator/AI copy require their own gates, implementation and claim review; design documentation does not enable them.

## Current reference handling

The current `public/maket.png` does not satisfy this contract and must not be treated as accepted design evidence. It may remain temporarily as reference-only material for the first-screen build; blocked claims/nonconforming elements must not be copied, and it must be removed/excluded from served assets before Gate B1/public deployment if still present.

## Planned Trust and Proof UX

[Trust surface](TRUST_PUBLIC_SURFACE.md) stays outside the Guest critical form.
“Почему OUTSCAN так считает?” uses keyboard-accessible disclosure, textual freshness/
unknown labels, visible coverage/limitations and mobile-readable dates without hover-only
interaction. Guest cannot reveal hidden evidence. Proof Scan explains included/excluded
scope and separate monitoring without fake urgency. These require future WCAG/browser
checks, not documentation acceptance as runtime evidence.
