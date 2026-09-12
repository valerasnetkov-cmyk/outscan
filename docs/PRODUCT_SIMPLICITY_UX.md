# OUTSCAN Product Simplicity & Information Hierarchy

**Status:** Product/UX design principle; implementation and acceptance evidence pending

**Scope:** public site, Guest Scan, onboarding, Workspace, Action Center, reports, notifications, Agency/MSP surfaces

**Type:** product/UX invariant; not ADR, Gate, scanner policy, capability evidence or authorization

## 1. Canonical principle

> **Сложность должна находиться внутри OUTSCAN, а не перед пользователем.**

OUTSCAN may use complex scanners, Threat Intelligence, correlation, authorization and evidence pipelines internally. The user should see that complexity only when it is necessary to understand a decision or verify evidence.

The product simplifies presentation, not truth.

> **OUTSCAN скрывает техническую сложность, но не скрывает важную информацию.**

## 2. User questions before security terminology

The primary product surfaces should answer these questions before exposing specialist vocabulary:

1. **Что у меня доступно из интернета?**
2. **Есть ли что-то опасное или требующее внимания?**
3. **Что изменилось?**
4. **Что нужно сделать сейчас?**
5. **Исправлена ли проблема?**

Terms such as EASM, ASM, CTEM, CVSS, EPSS, KEV, Nuclei, scanner profile or capability identifiers may appear in technical detail, documentation and evidence views, but should not be required to understand the primary flow.

## 3. Progressive disclosure

Canonical information order:

```text
Понятный вывод
→ почему это важно
→ что сделать
→ технические детали
→ evidence / provenance
→ machine export when needed
```

Do not invert this order on primary user surfaces.

A specialist must be able to reach authorized detail without the owner/manager being forced to read it first. Progressive disclosure never expands permissions: Guest retains its sanitized posture/coverage and aggregate-only result, without CVE details, subdomains, endpoints, vulnerable versions or raw evidence. Tenant evidence requires current organization authorization; see [UX acceptance](UX_ACCEPTANCE.md).

## 4. 10 / 30 / deep-dive invariant

Every critical product screen should be reviewable against this target:

- **10 seconds:** understand current state;
- **30 seconds:** understand what requires action and why;
- **a few minutes:** reach full technical evidence, provenance and remediation detail.

This is a UX acceptance target, not a security or performance SLA.

## 5. Public site rule

The public site should be linear and task-oriented rather than structured like a large enterprise cybersecurity catalog.

Preferred top-level narrative:

```text
Hero / domain input
→ what OUTSCAN sees
→ what requires attention
→ Find / Explain / Monitor
→ how it works
→ for whom
→ pricing
→ CTA
```

The hero should not begin with a taxonomy of EASM/ASM/CTEM, scanner names, large feature grids or a full Capability Registry dump.

A concise public grouping is preferred:

- **Ресурсы** — что доступно снаружи;
- **Риски** — что требует внимания;
- **Изменения** — что появилось или изменилось;
- **Исправления** — что сделать и подтверждён ли результат.

A separate technical-capabilities surface may expose deeper terminology after publication/claim evidence is valid.

## 6. Capability Registry projection

`ProductCapability` remains the canonical product capability source, but public presentation is a curated projection.

The public UI must not mechanically render every internal capability, engine binding, scanner name or low-level check as equal-weight marketing content.

Publication still requires Claim Inventory approval and production evidence. Simplifying the presentation cannot create or broaden a claim.

```text
Capability Registry
→ approved public projection
→ user-oriented grouping/copy
```

Never:

```text
Capability Registry
→ automatic public feature wall
```

## 7. Workspace hierarchy

The paid product should not behave like a GUI wrapper around scanner output.

Primary dashboard priority:

1. **Что требует действий сегодня?**
2. **Что изменилось?**
3. **Какие новые активы требуют решения?**
4. **Какие исправления ждут перепроверки?**
5. **Каково текущее состояние?**

Raw scan count and a large `Run scan` action must not become the conceptual center of the paid Workspace.

## 8. Role-based depth

The same canonical Finding may have multiple presentations without changing the underlying evidence.

**Owner / manager**

What happened, business relevance, priority, responsibility, remediation state.

**Administrator / developer**

Affected asset, cause, remediation, verification method, relevant technical context.

**Security specialist**

Evidence, confidence, CVE/CVSS/EPSS/KEV where applicable, provenance, scanner/coverage details.

**AI / coding agent export**

Bounded deterministic technical handoff from canonical report/finding data under `AI_HANDOFF_SECURITY.md`.

Presentation layers must not alter canonical severity, confidence, Finding state, coverage, verification or authorization.

## 9. Language rules

Prefer decision language:

- `Требует внимания`;
- `Новый внешний ресурс`;
- `Исправление ожидает проверки`;
- `Что изменилось`;
- `Что сделать сейчас`.

Expose specialist terms where they improve accuracy, not to demonstrate technical depth.

Do not replace uncertainty with a green checkmark. Canonical confidence/uncertainty and coverage/limitations remain visible where permitted and material; editorial potential/probable/confirmed wording does not create machine enums.

## 10. Non-goals

Simplicity does **not** mean:

- hiding risk or evidence;
- claiming `всё безопасно` from incomplete coverage;
- removing specialist detail;
- suppressing uncertainty or limitations;
- collapsing distinct canonical confidence or uncertainty values into a misleading assurance label;
- omitting verification/authorization boundaries;
- replacing security review with marketing copy;
- exposing fewer details to conceal product limitations.

## 11. Competitive interpretation

OUTSCAN should compete on usability of continuous control, not on making the public site look more technically complex than enterprise competitors.

Internal shorthand:

> **Enterprise-возможности без enterprise-сложности.**

This is a product-direction statement, not automatically approved public marketing copy.

## 12. Acceptance criteria for new surfaces

Before accepting a major public/Workspace surface, verify:

- the primary user task is obvious without security jargon;
- the first screen does not dump raw capability/scanner taxonomy;
- action priority is visible before raw technical volume;
- deeper evidence remains reachable;
- limitations and uncertainty are not hidden by simplification;
- public statements remain within Claim Inventory/evidence;
- the surface can be explained using the 10/30/deep-dive hierarchy;
- accessibility and existing security boundaries remain unchanged.

## 13. Security boundary

This document changes presentation and information hierarchy only.

It does not create or modify:

- `DomainVerification`;
- `VerifiedScope`;
- `ScanAuthorization`;
- entitlement;
- `MonitoringEnrollment`;
- scanner capabilities;
- Finding confirmation/resolution;
- Gate status;
- release sequencing.
