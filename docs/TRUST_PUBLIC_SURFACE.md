# OUTSCAN Public Trust Surface

Status: proposed documentation only; no runtime, publication or gate evidence. [Proposed ADR 0019](adr/0019-trust-methodology-evidence.md), accepted ADRs and [integration decisions](TRUST_PACKAGE_INTEGRATION.md) govern this specification.

## 1. Purpose

`/trust` — публичная техническая страница OUTSCAN, которая позволяет до оплаты понять методологию, источники знаний, ограничения и принципы формирования результатов.

Trust page не должна быть рекламной витриной с недоказуемыми цифрами.

## 2. Recommended information architecture

Минимальный V1:

1. Что проверяет OUTSCAN.
2. Уровни проверки и authorization boundary.
3. Откуда берутся данные.
4. Как OUTSCAN различает факт, предположение и подтверждение.
5. Как формируется risk priority.
6. Актуальность источников.
7. Ограничения автоматизированной проверки.
8. Как идентифицировать scanner traffic, когда production identity реально существует.
9. Demo Report, когда готов controlled lab.

Не размещать длинный Trust-контент внутри Guest Scan critical flow.

## 3. Canonical public message

Рекомендуемая смысловая формула:

> Мы не просим верить оценке OUTSCAN. Мы показываем, на каких данных она основана.

Допустимая supporting copy:

> Каждый существенный результат должен быть связан с наблюдением, технической проверкой, используемыми источниками, уровнем уверенности и контекстной оценкой OUTSCAN.

Публикация текста подчиняется `CLAIM_INVENTORY.md`.

## 4. Methodology block

Публично показывать high-level pipeline:

```text
Asset
 -> safe/verified observation
 -> normalized detection
 -> evidence
 -> threat intelligence
 -> confidence
 -> OUTSCAN Risk
 -> recommendation
```

Не показывать как публичную архитектуру:

- worker topology;
- queue names;
- internal service URLs;
- secret providers;
- policy thresholds;
- command-line invocations;
- exact template allowlists.

## 5. Scan levels

Публичная страница должна честно различать:

### Guest / safe non-intrusive

Описывать только фактически реализованные Guest capabilities.

Не называть Guest scan passive, если выполняются HTTP/TLS/DNS requests.

### Verified Baseline

Показывать, что расширенная проверка требует подтвержденного EXACT_HOST и server-side ScanAuthorization.

### Controlled Deep

Показывать только после фактической реализации и claim review.

### Active / intrusive

Не изображать как доступную функцию V1. Действующая scanning policy сохраняет запреты.

## 6. Sources block

Каждый source row должен иметь минимум:

- public name;
- role;
- current support state;
- last successful update label, если реально доступен;
- data effective date, если семантически важна;
- limitations;
- link to methodology details, если есть.

Пример безопасной структуры:

| Source           | Role                               | State                                            | Data freshness                          |
| ---------------- | ---------------------------------- | ------------------------------------------------ | --------------------------------------- |
| NVD              | CVE metadata / CVSS                | PLANNED until runtime evidence                   | current timestamp from normalized state |
| CISA KEV         | known exploited signal             | PLANNED until runtime evidence                   | current timestamp from normalized state |
| FIRST EPSS       | exploitation probability           | PLANNED until runtime evidence                   | score date                              |
| Nuclei Templates | approved technical detection logic | ACTIVE only if production-approved bundle exists | approved bundle validation date         |
| OSV              | dependency/SBOM intelligence       | PLANNED until implemented                        | not shown as live                       |

Не использовать hardcoded `OK` без фактического health state.

## 7. Safe source health model

Recommended public enum:

```text
CURRENT
STALE
UNAVAILABLE
UNKNOWN
```

`CURRENT` означает только, что source sync соответствует утвержденной freshness policy. Это не означает, что источник полон или безошибочен.

`STALE` означает, что последняя успешная информация старше допустимого watermark.

`UNAVAILABLE` означает известную проблему получения/обработки source.

`UNKNOWN` используется при недостатке данных для честного вывода.

## 8. Public status endpoint

Опциональный endpoint:

`GET /v1/public/trust/status`

Точный path должен быть встроен в существующий API contract.

Пример projection:

```json
{
  "methodology_version": "...",
  "sources": [
    {
      "id": "nvd",
      "name": "NVD",
      "status": "CURRENT",
      "data_effective_at": "...",
      "last_success_at": "..."
    }
  ]
}
```

## 9. Endpoint security requirements

Endpoint:

- read-only;
- anonymous only if public surface approved;
- strict closed schema;
- bounded response;
- cacheable according to public freshness policy;
- no tenant-specific data;
- no secrets;
- no internal errors/stack traces;
- fail-safe when internal health data is unavailable.

Не отдавать:

- importer credentials;
- private URLs;
- detailed upstream error payloads;
- queue depth;
- worker hostnames;
- internal version inventory unless separately approved;
- scanner template identifiers/digests;
- policy config;
- production secret/key versions.

## 10. Finding explainability UX

В Workspace рядом с существенным finding предусмотреть действие:

**Почему OUTSCAN так считает?**

Панель показывает:

- observation date;
- capability/detection class;
- confidence;
- safe evidence summary;
- CVE/CVSS where applicable;
- KEV status/freshness;
- EPSS + score date where applicable;
- major Risk Engine factors;
- scan coverage/limitations;
- next action.

Не перегружать default view. Детали открываются по запросу опытного пользователя.

## 11. Scanner identification

Этот раздел публикуется только после стабилизации production egress.

Допустимые данные:

- documented User-Agent format;
- approved source IP/CIDR ranges, если они действительно стабильны;
- abuse/security contact;
- high-level scanning policy;
- verification reference.

Обязательное правило:

> Не публиковать placeholder или предполагаемые source IPs как реальные.

Если egress динамический, страница должна честно описывать доступный способ идентификации либо не публиковать этот блок.

## 12. Limitations block

Обязательная публичная формулировка по смыслу:

- автоматизированная проверка не доказывает отсутствие всех уязвимостей;
- отсутствие findings не означает абсолютную безопасность;
- часть результатов может быть предположительной; labels требуют принятого confidence mapping;
- coverage зависит от разрешенного profile и состояния проверки;
- некоторые sources могут временно быть stale/unavailable;
- OUTSCAN не выполняет запрещенные/destructive методы ради подтверждения finding.

Не использовать запугивающий copy.

## 13. Claim inventory additions

После интеграции добавить как минимум:

| Claim                                       | Status before runtime evidence   |
| ------------------------------------------- | -------------------------------- |
| `Методология OUTSCAN`                       | CONDITIONAL                      |
| `Источники знаний OUTSCAN`                  | CONDITIONAL                      |
| source freshness timestamps                 | CONDITIONAL                      |
| `Почему OUTSCAN так считает?` provenance UI | CONDITIONAL                      |
| `Proof Scan до оплаты`                      | CONDITIONAL                      |
| public Demo Report                          | CONDITIONAL                      |
| detection/false-positive percentage         | BLOCKED                          |
| `полное покрытие`                           | BLOCKED                          |
| external certification                      | BLOCKED unless actually obtained |

## 14. Demo report CTA

Когда controlled lab существует, `/trust` может содержать:

**Посмотреть пример реального отчета OUTSCAN**

Нельзя называть статический mockup реальным сканированием.

## 15. Accessibility and UX

Следовать текущему WCAG 2.2 AA target.

Обязательное:

- semantic headings;
- keyboard accessible disclosure panels;
- text status in addition to color;
- timestamps readable on mobile;
- no horizontal overflow at 320px;
- source status must not rely only on green/red icons;
- technical details understandable without hover-only interaction.

## 16. Analytics

Если продуктовая аналитика существует, допустимо измерять:

- trust page views;
- source methodology expands;
- demo report opens;
- transition from Trust page to Guest Scan/registration.

Не собирать через Trust page дополнительные sensitive scanner data.

## 17. Acceptance

Public Trust surface готова только когда:

- все shown capabilities/sources имеют реальное production evidence;
- claims прошли Claim Inventory review;
- stale/unknown states отображаются честно;
- public endpoint проходит disclosure negative tests;
- scanner identification соответствует фактической infrastructure;
- limitations видимы пользователю;
- страница не расширяет scanner execution и authorization semantics.
