# OUTSCAN — Claim Inventory

**Status:** Canonical design evidence
**Review date:** 2026-09-03
**Owner:** Product Owner

## Status values

- `APPROVED_COPY` — wording may be used when the referenced feature exists.
- `CONDITIONAL` — use only with the stated condition.
- `FUTURE_LABEL` — only as an explicitly labelled example/future capability.
- `BLOCKED` — must not appear in public/runtime design until evidence and approval exist.

## Inventory

| Claim / content                                                   | Owner                  | Evidence / condition                                                                          | Status        | Review     |
| ----------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- | ------------- | ---------- |
| `OUTSCAN — платформа мониторинга внешних киберрисков`             | Product                | `PRODUCT.md` positioning                                                                      | APPROVED_COPY | 2026-09-03 |
| `Внешние риски под контролем.`                                    | Product                | brand slogan, not assurance                                                                   | APPROVED_COPY | 2026-09-03 |
| `Проверить домен`                                                 | Product                | only after Guest Scan B1 implementation                                                       | CONDITIONAL   | 2026-09-03 |
| `Без регистрации`                                                 | Product                | only while Guest Scan actually requires no registration                                       | CONDITIONAL   | 2026-09-03 |
| `Базовая проверка`                                                | Product/Security       | safe/non-intrusive Guest result only                                                          | CONDITIONAL   | 2026-09-03 |
| `N потенциальных рисков`                                          | Security/Product       | Guest-safe observations/passive intelligence + coverage disclosure                            | CONDITIONAL   | 2026-09-03 |
| `Asset Security Score`                                            | Product/Risk           | only when `SufficientBaselineV1=true`                                                         | CONDITIONAL   | 2026-09-03 |
| `Organization Security Score`                                     | Product/Risk           | only explicitly monitored asset set                                                           | CONDITIONAL   | 2026-09-03 |
| Product Capability Registry descriptions                          | Product/Security       | only `ACTIVE` rollout + approved copy + valid production evidence                             | CONDITIONAL   | 2026-09-06 |
| Security Glossary public definitions                              | Product/Security       | only individually APPROVED reviewed copy consistent with current product/security scope       | CONDITIONAL   | 2026-09-07 |
| Security Check-ins / Cyberexam educational wording                | Product/Security       | only after canonical question/Cyberexam decision, content review and implemented surface      | CONDITIONAL   | 2026-09-07 |
| Action Center / Change Intelligence / Emerging Threat wording     | Product/Security       | only the implemented gated slice with tenant, coverage, authorization and runtime evidence    | CONDITIONAL   | 2026-09-07 |
| OUTSCAN manifesto long-form copy                                  | Product/Security/Legal | section-by-section gate, implementation, evidence and final publication review                | CONDITIONAL   | 2026-09-07 |
| Trial / promo access, limits, duration or availability            | Product/Legal          | only implemented rollout with accepted terms, eligibility and production entitlement evidence | CONDITIONAL   | 2026-09-07 |
| `Мониторинг активен`                                              | Product                | only active `MonitoringEnrollment`                                                            | CONDITIONAL   | 2026-09-03 |
| Change example `DMARC reject → none`                              | Product                | may appear only with label `Концепт будущей возможности V1.5` until V1.5 is implemented       | FUTURE_LABEL  | 2026-09-03 |
| `120+ проверок`                                                   | Product                | no measured evidence                                                                          | BLOCKED       | 2026-09-03 |
| `35+ источников данных`                                           | Product                | no approved definition/evidence                                                               | BLOCKED       | 2026-09-03 |
| `24/7 мониторинг`                                                 | Product/Ops            | no availability evidence                                                                      | BLOCKED       | 2026-09-03 |
| `Мгновенные уведомления`                                          | Product/Ops            | no measured latency SLO                                                                       | BLOCKED       | 2026-09-03 |
| `Нам доверяют`                                                    | Product/Legal          | requires real relationship + permission                                                       | BLOCKED       | 2026-09-03 |
| Selectel / Cloud.ru / Yandex Cloud / Альфа-Банк / Kaspersky logos | Product/Legal          | no permission evidence                                                                        | BLOCKED       | 2026-09-03 |
| `100% безопасно` / `защищено от взлома`                           | Security/Legal         | absolute assurance impossible                                                                 | BLOCKED       | 2026-09-03 |
| `Полный автоматический пентест`                                   | Security/Legal         | outside product assurance/scope                                                               | BLOCKED       | 2026-09-03 |

## Strategy and Creator candidates — 2026-09-12

These entries record candidates and restrictions, not publication approval. Mission/AI-era/Creator strategy and PRODUCT_SIMPLICITY_UX do not activate capabilities or override the inventory above. Editorial potential/probable/confirmed wording never creates machine states.

| Claim / content                                                                                                  | Owner                | Evidence / condition                                                                                   | Status       | Review     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| `Создать можно автоматически. Контролировать нужно независимо.`                                                  | Product/Security     | Narrative candidate; final publication review without implying implemented continuous control          | FUTURE_LABEL | 2026-09-12 |
| `Вы создаёте быстрее. Контроль не должен отставать.` / `Код меняется за минуты. Периметр меняется вместе с ним.` | Product/Security     | Strategy copy; any implied change/monitoring behavior needs actual gated evidence                      | FUTURE_LABEL | 2026-09-12 |
| `OUTSCAN следит за тем, что реально стало доступно снаружи.`                                                     | Product/Security/Ops | Discovery/monitoring implementation and scope/availability evidence required                           | BLOCKED      | 2026-09-12 |
| `Сделал. Запустил. Проверь.` / Creator campaign claims                                                           | Product/Legal        | Candidate campaign wording; implemented B1 flow and publication review required                        | FUTURE_LABEL | 2026-09-12 |
| `AI написал код. OUTSCAN проверяет то, что реально оказалось доступно снаружи.`                                  | Product/Security     | Must not imply source-code audit or application assurance; implemented scope and claim review required | BLOCKED      | 2026-09-12 |
| `Исправить с AI`, AI Handoff, deployment-triggered recheck                                                       | Product/Security     | Deterministic export/recheck prerequisites, authorization, runtime and UX evidence required            | BLOCKED      | 2026-09-12 |
| Telegram Guest Scan integration                                                                                  | Product/Security     | B1 plus separate channel/session/abuse/privacy decision and runtime evidence                           | BLOCKED      | 2026-09-12 |
| Creator `490–990 ₽/мес.`, referral rewards, package limits                                                       | Product/Legal        | Unapproved commercial hypotheses; unit economics, terms and actual entitlements required               | BLOCKED      | 2026-09-12 |
| `Enterprise-возможности без enterprise-сложности`                                                                | Product/Security     | Internal positioning direction only; no unsupported enterprise/continuous-control claim                | FUTURE_LABEL | 2026-09-12 |
| `10s state / 30s action / deep-dive evidence`                                                                    | Product/Design       | Internal usability target only; never an advertised performance/security SLA without evidence          | FUTURE_LABEL | 2026-09-12 |

## Trust candidates — 2026-09-12

Documentation review only; none of these conditions is runtime/publication approval.

| Claim                                      | Owner            | Evidence / condition                                                                         | Status      | Review     |
| ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------- | ----------- | ---------- |
| Методология OUTSCAN                        | Product/Security | Implemented scope, methodology version and public review                                     | CONDITIONAL | 2026-09-12 |
| Источники знаний OUTSCAN                   | Product/Security | Actual supported sources and production provenance                                           | CONDITIONAL | 2026-09-12 |
| Source freshness / last update             | Ops/Security     | Canonical watermarks, bounded cache and honest stale/unknown tests                           | CONDITIONAL | 2026-09-12 |
| Почему OUTSCAN так считает?                | Product/Security | Tenant-safe provenance, canonical confidence and disclosure tests                            | CONDITIONAL | 2026-09-12 |
| Proof Scan до оплаты                       | Product/Security | B2 prerequisites, accepted eligibility/grant model and atomic authorization tests            | CONDITIONAL | 2026-09-12 |
| Реальный Demo Report                       | Product/Security | Owned lab, immutable Report Engine snapshot and reviewed public projection                   | CONDITIONAL | 2026-09-12 |
| Detection / false-positive percentages     | Security/Product | Reproducible Validation Lab, versioned corpus/methodology and reviewed measurements required | BLOCKED     | 2026-09-12 |
| Полное покрытие / все CVE / все уязвимости | Security/Product | Unsupported completeness/assurance claim                                                     | BLOCKED     | 2026-09-12 |
| External certification                     | Security/Legal   | Actual certification and approved scope/wording required                                     | BLOCKED     | 2026-09-12 |

## Design acceptance rules

Gate A design evidence is valid only if:

1. runtime/public design contains no BLOCKED claim;
2. CONDITIONAL claims are used only after their condition exists;
3. future capabilities are labelled as examples/future;
4. customer/partner logos are absent until separately approved;
5. non-trivial claims retain owner/evidence/review.

## Current mockup decision

`public/maket.png` is **REFERENCE-ONLY** and is not accepted as Gate A design/claim evidence because it contains blocked claims and nonconforming visual elements.

It may remain temporarily as a source of layout ideas for the first screen, but blocked claims, customer logos and rejected visual motifs must not be copied into implementation. Before Gate B1/public deployment, move it outside served runtime assets or exclude it from deployment if it would otherwise be publicly accessible.
