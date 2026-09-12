# OUTSCAN Trust, Methodology & Evidence

Status: proposed documentation only; no runtime, publication or gate evidence. [Proposed ADR 0019](adr/0019-trust-methodology-evidence.md), accepted ADRs and [integration decisions](TRUST_PACKAGE_INTEGRATION.md) govern this specification.

## 1. Назначение

OUTSCAN должен позволять пользователю проверить качество и происхождение результатов до оплаты и понимать происхождение каждого существенного finding после сканирования.

Главный принцип:

> Мы не просим верить оценке OUTSCAN. Мы показываем, на каких данных она основана.

Trust layer не является отдельным scanner, Risk Engine или Threat Intelligence Service. Он объясняет и безопасно проецирует данные существующих систем.

## 2. Каноническая цепочка доказательства

```text
SOURCE
  ↓
OBSERVATION
  ↓
DETECTION
  ↓
EVIDENCE
  ↓
INTELLIGENCE
  ↓
CONTEXT
  ↓
CONFIDENCE
  ↓
RISK
  ↓
ACTION
```

### Source

Внешний источник знаний или внутренний scanner/detector, из которого получен конкретный факт.

### Observation

То, что OUTSCAN фактически наблюдал на конкретном активе или получил из утвержденного внешнего источника.

### Detection

Правило/класс проверки, которое связывает observation с потенциальной проблемой.

### Evidence

Достаточные технические данные, подтверждающие observation в пределах разрешенного disclosure.

### Intelligence

CVE metadata, CVSS, KEV, EPSS и другие нормализованные external threat signals.

### Context

Internet exposure, asset criticality, coverage, recency, recurrence, change context и другие факторы существующего Risk Engine.

### Confidence

Насколько OUTSCAN уверен, что finding относится к активу.

### Risk

Контекстная оценка OUTSCAN. Не копия scanner severity и не копия CVSS.

### Action

Следующее рекомендуемое действие, не являющееся автоматическим доказательством remediation.

## 3. Терминологические границы

Нельзя смешивать:

- внешний факт и решение OUTSCAN;
- availability capability и фактически выполненное coverage;
- technology fingerprint и доказанную уязвимость;
- CVSS и OUTSCAN Risk;
- EPSS и risk score;
- KEV `unknown` и `no`;
- user-reported remediation и подтвержденное `RESOLVED`;
- публичную Trust-информацию и scan authorization.

Пример объяснения:

```text
NVD
  -> CVSS 9.1

CISA KEV
  -> known exploited signal

FIRST EPSS
  -> exploitation probability signal

OUTSCAN detector
  -> observation/evidence on this asset

OUTSCAN Risk Engine
  -> CRITICAL because of confirmed detection,
     public exposure, KEV and asset context
```

## 4. Источники знаний

Публичная Trust-страница обязана различать `ACTIVE`, `PLANNED` и `NOT_APPLICABLE` источники.

Нельзя публично объявлять source активным только потому, что он описан в документации.

### Current canonical V1 source classes

Согласно текущей OUTSCAN Threat Intelligence модели:

- NVD — CVE metadata, CVSS, CWE, product identifiers, published/modified timestamps;
- CISA KEV — known exploited signal;
- FIRST EPSS — exploitation probability signal;
- Nuclei Templates — technical detection logic, только через утвержденный release pipeline.

### Later / gated

- OSV — repositories/dependencies/SBOM;
- vendor advisories — только после появления нормализованного ingest/reference policy;
- иные feeds — только после отдельного review, schema validation и source provenance.

OWASP может указываться как testing/methodology reference, но не должен изображаться как live Threat Intelligence feed.

## 5. Freshness semantics

Каждый нормализованный intelligence record должен сохранять существующий provenance минимум:

- `source`;
- `source_record_id` или source version, если есть;
- `source_updated_at`;
- `ingested_at`;
- `parser_schema_version`.

Trust layer может добавлять safe derived state:

- `CURRENT`;
- `STALE`;
- `UNAVAILABLE`;
- `UNKNOWN`.

Правила:

1. Stale source не превращается в false negative.
2. Missing EPSS не равен `0`.
3. Unknown KEV не равен `No`.
4. Source outage не должен автоматически ломать customer scan, если текущая TI policy допускает scan без enrichment.
5. Finding/report обязан явно показывать отсутствующее или устаревшее enrichment, если оно влияет на интерпретацию.

## 6. Confidence model

Сохраняется текущий canonical confidence; существующий GUEST_SAFE parser принимает
целое число 0–100 и не раскрывает его в Guest projection. Trust не вводит enum,
числовые пороги или автоматическое преобразование в подтвержденное finding.

Potential/probable/confirmed — объяснительные продуктовые термины, а не принятые
машинные состояния. Versioned mapping и достаточный evidence для каждого label
должны быть отдельно определены и проверены до UI/API/report rollout.
Fingerprint/version-range match сам по себе не подтверждает уязвимость.
Техническое подтверждение в пределах разрешенной policy не означает эксплуатацию.

## 7. Explainability Risk Engine

Risk Engine уже отвечает на вопрос: `how important is this risk for this asset now?`

Trust layer показывает основные факторы, но не раскрывает внутренние security-sensitive policy details.

Публично/в Workspace допустимо объяснять:

- confirmed vs inferred;
- Internet exposure;
- CVSS source/value;
- KEV signal;
- EPSS value + date;
- asset criticality label, если она доступна пользователю;
- recurrence/reopen context;
- coverage/reference quality;
- intelligence freshness;
- major change context;
- final OUTSCAN priority;
- risk model version.

Не публиковать внутренние weighting constants, bypass thresholds или machine policy rules, если они могут облегчить обход/манипуляцию.

## 8. Coverage и limitations

Trust layer обязан объяснять не только `что найдено`, но и `что не было проверено`.

Для каждого scan/report нужны:

- scan profile;
- authorized scope;
- capability/check groups attempted;
- complete/partial/unavailable/not-applicable states;
- failed/skipped groups;
- known limitations;
- timestamps.

`ACTIVE ProductCapability` не означает, что asset был успешно проверен этой capability.

`N=0 findings` не означает `safe`.

Asset Security Score остается доступен только при существующем `SufficientBaselineV1=true`.

## 9. Public versus internal provenance

Нужны минимум две projection:

### Internal provenance

Достаточная для correlation, audit, report reproducibility и engineering diagnosis.

Может содержать internal detector/version/profile references в пределах действующей data/security policy.

### User-safe provenance

Показывает смысл и доказательства пользователю, но исключает:

- scanner commands;
- raw template IDs/digests;
- worker image names/digests;
- internal queue/job/lease/fence identifiers;
- internal policy configuration;
- credentials/secrets;
- unredacted raw scanner output;
- data другого tenant;
- internal evidence references, недоступные пользователю.

## 10. Trust surface lifecycle

Публичный Trust content существует только когда его claims подтверждены фактическим production evidence.

Рекомендуемые состояния публикации:

```text
DRAFT
 -> REVIEWED
 -> EVIDENCED
 -> PUBLIC
 -> STALE/REVIEW_REQUIRED
```

Это content/evidence lifecycle, а не scanner authorization state.

## 11. Scanner identification

После появления стабильного production egress OUTSCAN может публиковать способ отличить легитимный scanner traffic:

- stable User-Agent convention;
- утвержденные source CIDR/IP ranges, если operationally stable;
- security/abuse contact;
- краткую scanning policy;
- reference на Trust page.

До появления фактического production egress нельзя публиковать вымышленные IP ranges или обещать стабильный source identity.

## 12. Demo / Validation

### Demo Report

Допустим только на owned OUTSCAN lab и должен генерироваться настоящим Report Engine.

### Validation Lab

Отдельный будущий этап.

Accuracy metrics можно публиковать только если:

- test corpus versioned;
- cases имеют known truth;
- методика подсчета опубликована;
- scanner/profile/version зафиксированы;
- тест воспроизводим;
- false-positive и false-negative definitions однозначны;
- результат прошел review.

До этого любые количественные accuracy claims блокируются.

## 13. Security invariants

1. Trust metadata никогда не предоставляет scan authority.
2. Source health никогда не активирует scanner capability.
3. Product Capability Registry остается metadata layer.
4. Scanner policy ADR-0012 остается authoritative.
5. VerifiedScope/ScanAuthorization остаются authoritative.
6. Upstream feed/template считается untrusted input.
7. Public projection fail-closed по неизвестным/неразрешенным полям.
8. Tenant evidence никогда не попадает в public Trust status.
9. Report historical provenance immutable после snapshot finalization.
10. Public demo не содержит customer data.

## 14. Non-goals V1

Не входят:

- публичный dashboard внутренних scanner versions;
- arbitrary customer access к raw scanner output;
- publication of internal Nuclei template inventory;
- public exploit proof;
- automatic source ingestion from arbitrary blogs/social feeds;
- runtime AI как источник security facts;
- accuracy guarantee;
- certification claim без внешней сертификации;
- promise of full OWASP/CVE coverage.

## 15. Acceptance

Trust layer считается корректно спроектированным, когда пользователь может для каждого существенного finding ответить:

1. Что OUTSCAN наблюдал?
2. Когда это наблюдалось?
3. Каким классом проверки получено?
4. Какой confidence?
5. Какие внешние intelligence signals использованы?
6. Насколько они свежие?
7. Почему OUTSCAN присвоил такой приоритет?
8. Какие ограничения были у scan?
9. Что рекомендуется сделать дальше?

При этом ответы не должны раскрывать внутренние секреты, расширять scan authority или создавать ложное ощущение абсолютной безопасности.
