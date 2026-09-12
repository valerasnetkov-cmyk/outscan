# OUTSCAN Proof Scan & Demo Report

Status: proposed documentation only; no runtime, publication or gate evidence. [Proposed ADR 0019](adr/0019-trust-methodology-evidence.md), accepted ADRs and [integration decisions](TRUST_PACKAGE_INTEGRATION.md) govern this specification.

## 1. Purpose

До оплаты опытный пользователь должен иметь возможность оценить качество OUTSCAN на собственной подтвержденной инфраструктуре, не получая при этом обход verification, entitlement или scan policy.

Для этого вводится отдельная продуктовая концепция:

**OUTSCAN Proof Scan** — один ограниченный `VERIFIED_BASELINE` scan для уже подтвержденного `EXACT_HOST` до покупки подписки.

Отдельно создается **Demo Report** на контролируемой инфраструктуре OUTSCAN.

## 2. Critical distinction

`Verification != Payment != Entitlement != ScanAuthorization`.

Подтверждение домена само по себе не разрешает запуск любого scanner profile.

Proof Scan не должен реализовываться так:

```text
if verified:
  payment_required = false
  allow_scan = true
```

Такой подход ломает существующую authorization модель.

## 3. Proof Scan authorization model

Целевая логика:

```text
Authenticated user
  ↓
Organization membership
  ↓
Asset belongs to organization
  ↓
Current EXACT_HOST verification
  ↓
Eligible Proof Scan grant
  ↓
Existing entitlement intersection
  ↓
Fresh ScanAuthorization
  ↓
ADR-0012 scanner policy
  ↓
VERIFIED_BASELINE only
```

## 4. Grant semantics

Нужен server-owned ограниченный grant, условное имя:

`PROOF_SCAN_GRANT`.

Точное имя и storage model должны использовать существующую entitlement architecture, если она к моменту реализации уже существует.

Если безопасной entitlement abstraction еще нет, Proof Scan нельзя внедрять отдельным boolean bypass.

### Minimum grant properties

- `organization_id`;
- `asset_id`;
- exact canonical host reference;
- grant state;
- created/eligible timestamp;
- activation timestamp;
- accepted result reference;
- consumed timestamp;
- expiry, если product policy ее вводит;
- audit metadata.

Не хранить grant как reusable promo code.

## 5. Eligibility

Базовая продуктовая гипотеза V1:

- один Proof Scan для одной организации;
- один выбранный Asset;
- Asset должен иметь текущую успешную DNS verification;
- VerifiedScope строго `EXACT_HOST`;
- запуск доступен только после регистрации/Organization foundation;
- grant нельзя перенести на другой target после активации;
- повторные организации/аккаунты не должны автоматически позволять обход лимита без abuse policy.

Точная коммерческая eligibility policy должна быть отдельно зафиксирована до production rollout.

## 6. Allowed profile

Proof Scan использует только существующий:

`VERIFIED_BASELINE`.

Он может включать только capabilities, которые фактически разрешены этим profile и ADR-0012 policy на момент execution.

Proof Scan не создает новый scanner profile.

## 7. Explicitly forbidden

Proof Scan не разрешает автоматически:

- `CONTROLLED_DEEP`;
- `ACTIVE`;
- raw TCP;
- port enumeration;
- Naabu, пока он запрещен V1 policy;
- authenticated requests;
- brute force;
- fuzzing;
- OOB callback;
- headless browser;
- code execution;
- destructive checks;
- arbitrary customer-selected Nuclei templates;
- DOMAIN_SUBTREE/IP/CIDR scope;
- monitoring enrollment.

## 8. Fresh authorization

Перед каждым execution server обязан заново проверить:

- user/session auth;
- organization membership;
- asset ownership;
- current verification status;
- EXACT_HOST scope;
- grant status;
- entitlement intersection;
- current consent;
- scan profile;
- current machine policy;
- artifact approval;
- budgets;
- target destination policy.

Нельзя использовать eligibility snapshot как вечное разрешение.

## 9. Consumption and idempotency

Право должно расходоваться по **accepted scan result**, а не по нажатию кнопки.

Рекомендуемая семантика:

```text
ELIGIBLE
 -> RESERVED (execution tracked by ScanJob/ScanAttempt)
 -> CONSUMED
```

Ошибка платформы до accepted result должна иметь bounded retry/recovery path без выдачи второго независимого grant.

Concurrent duplicate clicks должны приводить к одному logical Proof Scan execution через текущие idempotency/job semantics.

Если scan завершился policy denial из-за stale verification или revoked authorization, grant не должен автоматически становиться CONSUMED.

Это Proposed grant lifecycle, не новый ScanJob FSM. Reservation привязывается
к одному logical ScanRequest. Accepted-result commit и grant consumption должны
быть атомарны: RUNNING job, current fence, unexpired lease/deadline по ADR 0011.
Terminal same-digest replay — no-write acknowledgement: не расходует grant повторно,
не создает новый result или request. Different digest conflicts/audits.
Crash/retry/reservation-expiry semantics требуют решения и concurrency tests до rollout.
Точная retry policy должна быть детерминированной и протестированной.

## 10. Result visibility

После successful Proof Scan пользователь может получить полный verified-baseline result в рамках реально реализованных Workspace/Report capabilities:

- actual coverage;
- findings;
- canonical confidence и утвержденное объяснение его basis;
- safe evidence;
- provenance;
- relevant CVE/CVSS;
- KEV/EPSS when available;
- Risk Engine priority/explanation;
- limitations;
- recommendations.

Нельзя обещать Attack Surface, CVE, Report formats или other features, которые к моменту rollout не реализованы.

## 11. No dark pattern

Proof Scan нужен для проверки качества продукта, а не для искусственного hiding.

После результата пользователь должен четко видеть:

- что проверено;
- что не проверено;
- что будет доступно в платном мониторинге;
- что Proof Scan не включает continuous monitoring;
- что отсутствие findings не означает абсолютную безопасность.

## 12. Commercial boundary

После Proof Scan платный продукт продает не повтор этой же проверки, а дальнейший процесс:

`Monitoring -> Changes -> New risks -> Priority -> Remediation -> Recheck -> History`.

Это соответствует текущему positioning OUTSCAN как постоянного контроля, а не оплаты за единичный scan.

## 13. Demo Report

Публичный Demo Report решает другую задачу: пользователь может увидеть структуру и прозрачность результата вообще без регистрации.

Demo Report должен быть построен на **owned OUTSCAN lab target**.

Не использовать:

- customer domain;
- случайный public vulnerable target;
- third-party demo site без явного разрешения;
- production secrets;
- копию customer report с замененным названием.

## 14. Lab target requirements

Контролируемая demo infrastructure должна:

- принадлежать OUTSCAN или использоваться с явным разрешением;
- иметь versioned configuration;
- иметь known expected findings;
- быть изолирована от production customer data;
- не содержать реальных credentials;
- быть безопасно сбрасываемой/reproducible;
- иметь documented owner;
- иметь lifecycle/maintenance policy.

## 15. Demo Report pipeline

```text
Owned lab target
 -> authorized scan
 -> normalized findings
 -> Risk Engine
 -> immutable Report Snapshot
 -> public-safe Demo Report projection
```

Не собирать demo вручную в Figma/HTML и не называть это real report.

## 16. Public demo fields

Допустимо показывать:

- target label clearly marked as demo;
- scan date;
- scope;
- coverage;
- selected findings;
- provenance;
- confidence;
- safe evidence summaries;
- TI references;
- risk explanation;
- limitations;
- recommendations;
- report/methodology version.

## 17. Demo disclosure controls

Даже на owned lab не публиковать без необходимости:

- operational exploit payloads;
- reusable credentials;
- internal scanner commands;
- template digests/allowlists;
- exact production worker topology;
- signing/authentication metadata;
- evidence that creates an avoidable abuse recipe.

## 18. Demo refresh

Demo Report должен иметь понятную versioning policy.

Например:

- current demo snapshot;
- generated_at;
- methodology_version;
- report_schema_version;
- optional artifact SHA-256;
- previous demo report archived or replaced according to explicit policy.

Нельзя quietly change historical demo snapshot while keeping the same report identity.

## 19. Validation Lab later

Demo Lab не равен Validation Lab.

### Demo Lab

Показывает, как выглядит OUTSCAN result.

### Validation Lab

Измеряет качество detectors на known-truth corpus.

Validation Lab должен появиться позже, когда scanner profiles стабильны.

## 20. Validation metrics gate

До появления reproducible Validation Lab запрещено публиковать:

- detection rate;
- false-positive rate;
- false-negative rate;
- coverage percentage as scanner accuracy;
- comparative claims vs competitors.

После появления Lab metric обязательно связывается с:

- corpus version;
- scanner/profile version;
- test date;
- methodology version;
- exact definition of TP/FP/FN/TN;
- limitations.

## 21. Audit events

Для Proof Scan потребуются audit events в существующей audit model, например по смыслу:

- proof grant eligible/created;
- proof grant activated/reserved;
- proof execution authorized/denied;
- proof result accepted;
- proof grant consumed;
- proof grant revoked/expired;
- proof retry due platform failure.

Exact names должны соответствовать текущему event naming.

Не писать target secrets/raw evidence в audit.

## 22. Abuse cases

Обязательно рассмотреть:

- создание множества аккаунтов для бесплатных scans;
- попытку сменить asset после grant activation;
- replay consumed grant;
- concurrency race;
- stale verification;
- cross-tenant asset selection;
- direct API call to choose Controlled Deep;
- attempt to pass arbitrary target/template/profile;
- retry abuse after successful accepted result.

Abuse controls не должны превращать IP/NAT fingerprint в ownership/authorization identity.

## 23. Rollout order

1. Document/ADR.
2. Organization/auth foundation.
3. Verification implementation.
4. Entitlement/grant decision.
5. Verified Baseline runtime.
6. Provenance/report explainability.
7. Proof Scan controlled rollout.
8. Demo Lab + Demo Report.
9. Validation Lab later.

Gate B1 Guest work остается отдельным critical path.

## 24. Acceptance

Proof Scan готов только если пользователь может безопасно выполнить один verified baseline до оплаты, а negative tests подтверждают, что функция не расширяет scope/profile/capabilities и не превращается в reusable free scanning bypass.
