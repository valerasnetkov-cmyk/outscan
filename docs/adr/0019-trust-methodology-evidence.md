# ADR 0019 — Trust Methodology, Finding Provenance and Pre-Payment Proof

**Status:** Proposed

## Context

OUTSCAN позиционируется как платформа постоянного контроля внешнего цифрового периметра, а не как black-box scanner.

Для технического и опытного пользователя критично понимать до оплаты и после получения finding:

- что реально было проверено;
- каким методом получен результат;
- какие внешние источники использованы;
- насколько свежи эти данные;
- какой confidence у finding;
- почему OUTSCAN присвоил конкретный risk priority;
- какие ограничения были у scan.

Существующая архитектура уже содержит:

- scanner policy и `ScanAuthorization`;
- `ScannerResultEnvelope`/`ResultEnvelope`;
- Finding/FindingOccurrence/Coverage;
- Threat Intelligence provenance;
- Risk Engine explainability requirement;
- Product Capability Registry;
- immutable Report Snapshot proposal/architecture;
- Claim Inventory.

Нужен единый Trust/Provenance слой без создания параллельной security model.

Также продукту нужен способ показать качество verified проверки до оплаты, не превращая verification в scan-authorization bypass.

## Decision

### 1. Trust layer is projection, not authority

Создать Trust/Methodology/Evidence layer как explainability/public projection поверх существующих canonical domain data.

Trust layer не владеет:

- target authorization;
- scanner capabilities;
- scan profile;
- finding identity;
- threat intelligence truth;
- risk semantics;
- report truth.

### 2. Canonical evidence chain

Зафиксировать пользовательскую цепочку:

`Source -> Observation -> Detection -> Evidence -> Intelligence -> Context -> Confidence -> Risk -> Action`.

Каждый существенный finding должен быть способен сформировать эту цепочку из существующих данных.

### 3. Public/internal provenance split

Хранить/формировать достаточный internal provenance для воспроизводимости и диагностики, но публиковать отдельную safe projection.

Public/user-safe projection не раскрывает:

- scanner commands;
- template IDs/digests;
- worker images;
- internal policy configuration;
- queue/job/lease/fence identifiers;
- credentials/secrets;
- unredacted raw scanner output;
- private evidence references;
- cross-tenant data.

### 4. Intelligence freshness is first-class

Normalized TI provenance сохраняет source identifiers и timestamps согласно текущему Threat Intelligence contract.

Trust projection различает как минимум:

`CURRENT | STALE | UNAVAILABLE | UNKNOWN`.

Unknown/stale никогда не преобразуется в definitive negative.

### 5. Confidence remains canonical

Не вводить новую шкалу уверенности.

Сохранить canonical confidence. GUEST_SAFE input сейчас использует integer 0–100,
который не раскрывается Guest. Potential/probable/confirmed — editorial wording,
а не новый enum; versioned label mapping требует отдельного решения и evidence.

Добавить только explainable basis codes/projection, если это необходимо UI/API/reporting.

### 6. Risk remains owned by Risk Engine

Trust layer показывает major risk factors и model version, но не вычисляет альтернативный score.

CVSS, KEV и EPSS остаются отдельными signals.

### 7. Report Snapshot freezes evidence context

Immutable Report Snapshot должен фиксировать provenance/intelligence/confidence/risk values, использованные на момент формирования.

Renderer не должен silently подменять их live TI state.

### 8. Public `/trust` surface

После соответствующего public gate создать отдельную Trust surface с:

- methodology;
- scan levels;
- supported source classes;
- source health/freshness;
- confidence semantics;
- Risk explainability;
- limitations;
- scanner identification, когда production identity фактически существует;
- demo report, когда существует owned lab.

Публичные claims подчиняются Claim Inventory и production evidence.

### 9. Proof Scan is a bounded entitlement, not a bypass

После реализации Organization + Verification + Verified Baseline допускается один pre-payment Proof Scan.

Proof Scan:

- требует authenticated organization context;
- требует current `EXACT_HOST` verification;
- использует только existing `VERIFIED_BASELINE`;
- проходит fresh `ScanAuthorization`;
- использует ADR-0012 policy;
- имеет server-owned one-result grant;
- не создает MonitoringEnrollment;
- не разрешает `CONTROLLED_DEEP`, `ACTIVE` или V1-denied capabilities.

Если существующая entitlement модель не способна выразить это безопасно, сначала принимается отдельное entitlement/data decision. Нельзя добавлять boolean bypass.

### 10. Demo Report uses owned lab only

Публичный real Demo Report строится через обычный scanner/normalizer/Risk Engine/Report Snapshot pipeline на owned/authorized OUTSCAN lab target.

Customer data и случайные third-party vulnerable targets запрещены.

### 11. Validation metrics are deferred

Detection rate, false-positive rate и другие accuracy claims запрещены до versioned reproducible Validation Lab с known truth corpus и reviewable methodology.

## Security invariants

1. Trust metadata cannot grant scan authority.
2. Product/public capability cannot mutate scanner capability policy.
3. Source health cannot enable an engine/template.
4. Public provenance is tenant-safe and secret-safe.
5. Stale/missing intelligence is not converted into a negative fact.
6. Proof Scan cannot change target/profile/capabilities client-side.
7. One Proof grant cannot yield more than one accepted Proof result.
8. Proof Scan never extends verification lifecycle.
9. Demo Report contains no customer data.
10. Accuracy claims require validation evidence.

## Consequences

### Positive

- опытный пользователь получает проверяемую прозрачность результатов;
- Risk Engine становится объяснимым без раскрытия внутренних control details;
- Report Snapshot становится воспроизводимее;
- появляется честный путь попробовать verified baseline до оплаты;
- Trust page может стать B2B due-diligence surface;
- source freshness становится видимой частью качества продукта.

### Cost / complexity

- понадобится versioned provenance schema/projection;
- Report Snapshot schema расширяется;
- потребуется source-health public projection;
- Proof Scan требует аккуратной entitlement/idempotency model;
- Claim Inventory и public review становятся обязательными;
- Validation Lab потребует отдельной инфраструктуры и поддержки.

## Alternatives rejected

### Marketing-only Trust page

Отклонено: логотипы NVD/OWASP без finding-level provenance не доказывают качество результата.

### Publish raw scanner output

Отклонено: создает disclosure, secret, hostile-content и usability risks.

### Treat CVSS as OUTSCAN Risk

Отклонено: противоречит действующему Risk Engine.

### Verification implies free scan

Отклонено: смешивает verification, entitlement и ScanAuthorization.

### `payment_required=false` bypass

Отклонено: создает опасную параллельную authorization ветку.

### Public accuracy percentage without lab

Отклонено: невоспроизводимый marketing claim.

## Rollout

1. Documentation/ADR integration.
2. Provenance contract aligned with existing Finding/Report data.
3. Report Snapshot provenance freeze.
4. Workspace explainability.
5. Public `/trust` after claim/evidence gate.
6. Proof Scan after Organization/Verification/Verified Baseline/entitlement prerequisites.
7. Owned Demo Lab + real Demo Report.
8. Validation Lab and measured claims later.

## Status handling

Reconciled on 2026-09-12 against the working tree. [Report ADR 0018](0018-report-engine.md)
already occupies 0018 and remains Proposed. This decision occupies 0019 and also
remains Proposed; documentation integration is not owner acceptance or runtime evidence.
See [integration decisions](../TRUST_PACKAGE_INTEGRATION.md).
