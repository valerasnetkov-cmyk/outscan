# ADR 0014: Public UX, claims and accessibility

**Status:** Accepted
**Accepted:** 2026-09-03
**Date:** 2026-09-03
**Owner:** Product / Design

Canonical evidence:

- `../CLAIM_INVENTORY.md`
- `../UX_ACCEPTANCE.md`

## Visual

Dark hero, light lower content, data-first, minimal cards, no globe/radar/glow/shield/hacker clichés.

## Domain input

Permanent `Домен` label, helper, format/error/progress/focus states.

Helper:
`Введите домен без https://, пути и порта.`

## Guest Result

Full page: target, Infrastructure, Domain, Mail, Certificate, coverage states, potential-risk aggregate, CTA.

No CVE/subdomain/endpoints/vulnerable versions/raw evidence.

## Onboarding

`Guest → Registration → Organization → Add exact host/Create Asset → DNS TXT Verification → Verified Baseline → Asset Security Score → optional MonitoringEnrollment`.

Asset creation explicitly precedes verification.

## Terminology

Guest = safe/non-intrusive.
Use `passive` only for truly passive CT/RDAP/intelligence sources.
Controlled Deep requires per-run consent.
Active/IP/CIDR/raw TCP disabled V1.

## Claims

Accepted public/runtime design must comply with CLAIM_INVENTORY.
Blocked claims/customer logos are prohibited.

## Change example

Before V1.5, diff examples are labelled:
`Концепт будущей возможности V1.5`.

## Accessibility

Target WCAG 2.2 AA.
Gate A = design contract/evidence.
Gate B1/B2 = actual CSS/DOM/keyboard/screen-reader/reflow verification.

## Current maket

`public/maket.png` may remain temporarily as a reference for constructing the first screen. It is not accepted Gate A evidence, and blocked claims/nonconforming visual decisions inside it must not be copied into implementation. Before Gate B1/public deployment, it must be moved outside served runtime assets or excluded from deployment if still present.
