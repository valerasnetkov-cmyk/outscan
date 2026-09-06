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

| Claim / content                                                   | Owner            | Evidence / condition                                                                    | Status        | Review     |
| ----------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------- | ------------- | ---------- |
| `OUTSCAN — платформа мониторинга внешних киберрисков`             | Product          | `PRODUCT.md` positioning                                                                | APPROVED_COPY | 2026-09-03 |
| `Внешние риски под контролем.`                                    | Product          | brand slogan, not assurance                                                             | APPROVED_COPY | 2026-09-03 |
| `Проверить домен`                                                 | Product          | only after Guest Scan B1 implementation                                                 | CONDITIONAL   | 2026-09-03 |
| `Без регистрации`                                                 | Product          | only while Guest Scan actually requires no registration                                 | CONDITIONAL   | 2026-09-03 |
| `Базовая проверка`                                                | Product/Security | safe/non-intrusive Guest result only                                                    | CONDITIONAL   | 2026-09-03 |
| `N потенциальных рисков`                                          | Security/Product | Guest-safe observations/passive intelligence + coverage disclosure                      | CONDITIONAL   | 2026-09-03 |
| `Asset Security Score`                                            | Product/Risk     | only when `SufficientBaselineV1=true`                                                   | CONDITIONAL   | 2026-09-03 |
| `Organization Security Score`                                     | Product/Risk     | only explicitly monitored asset set                                                     | CONDITIONAL   | 2026-09-03 |
| Product Capability Registry descriptions                          | Product/Security | only `ACTIVE` rollout + approved copy + valid production evidence                       | CONDITIONAL   | 2026-09-06 |
| `Мониторинг активен`                                              | Product          | only active `MonitoringEnrollment`                                                      | CONDITIONAL   | 2026-09-03 |
| Change example `DMARC reject → none`                              | Product          | may appear only with label `Концепт будущей возможности V1.5` until V1.5 is implemented | FUTURE_LABEL  | 2026-09-03 |
| `120+ проверок`                                                   | Product          | no measured evidence                                                                    | BLOCKED       | 2026-09-03 |
| `35+ источников данных`                                           | Product          | no approved definition/evidence                                                         | BLOCKED       | 2026-09-03 |
| `24/7 мониторинг`                                                 | Product/Ops      | no availability evidence                                                                | BLOCKED       | 2026-09-03 |
| `Мгновенные уведомления`                                          | Product/Ops      | no measured latency SLO                                                                 | BLOCKED       | 2026-09-03 |
| `Нам доверяют`                                                    | Product/Legal    | requires real relationship + permission                                                 | BLOCKED       | 2026-09-03 |
| Selectel / Cloud.ru / Yandex Cloud / Альфа-Банк / Kaspersky logos | Product/Legal    | no permission evidence                                                                  | BLOCKED       | 2026-09-03 |
| `100% безопасно` / `защищено от взлома`                           | Security/Legal   | absolute assurance impossible                                                           | BLOCKED       | 2026-09-03 |
| `Полный автоматический пентест`                                   | Security/Legal   | outside product assurance/scope                                                         | BLOCKED       | 2026-09-03 |

## Design acceptance

Gate A design evidence is valid only if:

1. runtime/public design contains no BLOCKED claim;
2. CONDITIONAL claims are used only after their condition exists;
3. future capabilities are labelled as examples/future;
4. customer/partner logos are absent until separately approved;
5. non-trivial claims retain owner/evidence/review.

## Current mockup decision

`public/maket.png` is **REFERENCE-ONLY** and is not accepted as Gate A design/claim evidence because it contains blocked claims and nonconforming visual elements.

It may remain temporarily as a source of layout ideas for the first screen, but blocked claims, customer logos and rejected visual motifs must not be copied into implementation. Before Gate B1/public deployment, move it outside served runtime assets or exclude it from deployment if it would otherwise be publicly accessible.
