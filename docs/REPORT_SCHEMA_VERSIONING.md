# Report Schema and Versioning

## 1. Цель

Определить стабильный машинно-читаемый контракт Report Snapshot и правила его эволюции. Схема должна позволять:

- воспроизводить historical reports;
- строить разные renderers из одного источника;
- сохранять stable Finding IDs;
- сравнивать отчеты во времени;
- безопасно интегрировать внешние системы;
- эволюционировать без скрытого изменения старых reports.

## 2. Version identifiers

Для V1 использовать независимые версии:

- canonical report schema: `outscan.report.v1`;
- AI handoff schema: `outscan.ai-report.v1`;
- bundle manifest schema: `outscan.report-bundle.v1`;
- renderer version: отдельное значение для каждого renderer-а.

`report schema` описывает смысл и структуру snapshot.

`renderer version` описывает конкретное представление и может меняться без изменения factual snapshot.

Пример:

```text
schema_version = outscan.report.v1
pdf_renderer_version = pdf-v3
md_renderer_version = md-v2
```

## 3. Versioning policy

### Compatible change

Допустимо без major schema bump:

- добавить optional field;
- добавить новый enum value только если consumers обязаны обрабатывать unknown;
- добавить новый renderer;
- улучшить typography PDF;
- исправить перевод текста, не меняя factual semantics.

### Breaking change

Требует новой major schema:

- переименовать или удалить обязательное поле;
- изменить смысл существующего поля;
- изменить тип данных;
- изменить lifecycle semantics;
- изменить identity rules finding;
- изменить единицы измерения без нового поля;
- сделать optional поле required для старых snapshots.

Старые snapshots не мигрировать in-place только ради новой схемы.

## 4. Canonical snapshot shape

Минимальная логическая структура:

```json
{
  "schema": "outscan.report.v1",
  "report_id": "rpt_...",
  "scan_id": "scan_...",
  "organization_id": "org_...",
  "generated_at": "2026-09-11T09:00:00Z",
  "scan": {},
  "scope": {},
  "score": {},
  "summary": {},
  "assets": [],
  "changes": [],
  "findings": [],
  "resolved_findings": [],
  "accepted_risks": [],
  "coverage": [],
  "limitations": [],
  "provenance": {}
}
```

Фактическая naming convention должна соответствовать текущему кодстайлу проекта.

## 5. Scan metadata

Хранить как минимум:

- scan identifier;
- scan profile/mode;
- authorization/verification context в безопасной форме;
- started_at;
- finished_at;
- result status;
- partial/complete indicator;
- engine/capability coverage на продуктовом уровне.

Не экспортировать внутренние shell commands, worker secrets, private network metadata или данные, не предназначенные клиенту.

## 6. Scope

Scope должен позволять ответить:

- какой primary target инициировал scan;
- какие assets были разрешены;
- какие assets реально проверены;
- какие assets skipped;
- почему часть проверок не выполнена.

Пример:

```json
{
  "primary_target": "company.ru",
  "asset_count": 14,
  "checked_asset_count": 13,
  "skipped_asset_count": 1
}
```

## 7. Score

Пример:

```json
{
  "current": 74,
  "previous": 80,
  "delta": -6,
  "calculation_version": "risk-v..."
}
```

Если previous score отсутствует, использовать `null`, а не придумывать delta 0.

Если в проекте score имеет отдельную модель/версию, использовать ее canonical identifier.

## 8. Finding schema

Минимум:

```json
{
  "id": "OUT-FND-...",
  "fingerprint": "...",
  "asset_id": "asset_...",
  "asset_display": "api.company.ru",
  "category": "VULNERABILITY",
  "severity": "HIGH",
  "confidence": "CONFIRMED",
  "lifecycle_status": "OPEN",
  "title": "...",
  "description": "...",
  "risk_context": "...",
  "evidence": [],
  "remediation": {},
  "verification": {},
  "threat_intelligence": {},
  "first_seen_at": "...",
  "last_seen_at": "..."
}
```

Не считать этот пример готовой ORM schema. Codex должен адаптировать поля к существующим моделям.

## 9. Stable Finding ID

Canonical Finding ID должен быть стабильным между scans, пока система считает проблему одной и той же logical finding.

Нельзя строить ID из:

- severity;
- индекса сортировки;
- текста перевода;
- даты report;
- renderer-а;
- номера страницы PDF.

Предпочтительный источник - существующая deduplication/fingerprint логика Finding domain.

Если ее нет, внедрять identity отдельно и документировать normalized fingerprint inputs.

## 10. Fingerprint rules

Fingerprint должен использовать минимальный набор устойчивых идентификаторов проблемы, например:

- tenant/asset identity;
- capability/finding type;
- canonical check identifier;
- normalized affected location при необходимости;
- vulnerability identifier, если он является частью сущности проблемы.

Не включать transient evidence или score.

Изменение fingerprint algorithm должно иметь version, например `finding-fingerprint-v1`.

## 11. Confidence

Использовать каноническую терминологию OUTSCAN:

- `POTENTIAL`;
- `PROBABLE`;
- `CONFIRMED`.

Renderer переводит labels, но enum остается стабильным.

Нельзя автоматически переводить `POTENTIAL` в `CONFIRMED` ради более убедительного PDF.

## 12. Severity и priority

Разделять:

- техническую severity;
- бизнес/risk priority, если такая сущность существует.

Например CVSS HIGH и фактический приоритет конкретного актива не обязательно совпадают.

Report должен использовать результат Risk Engine, а не заново вычислять приоритет внутри renderer-а.

## 13. Threat Intelligence freeze

В snapshot сохранять значения, использованные при принятии решения:

```json
{
  "cve": "CVE-2026-XXXX",
  "cvss": 8.8,
  "cvss_source": "NVD",
  "epss": 0.72,
  "epss_as_of": "2026-09-11",
  "kev": true,
  "kev_as_of": "2026-09-11",
  "references": []
}
```

Если OUTSCAN хранит authoritative provenance, сохранять source identifier и fetched/effective timestamp.

## 14. Evidence

Evidence в canonical snapshot должно быть структурированным.

Пример типов:

- HTTP header observation;
- DNS record observation;
- TLS property;
- product/version observation;
- scanner matcher result;
- public service observation;
- derived correlation.

Каждый элемент по возможности содержит:

- `type`;
- `source`;
- `observed_at`;
- `value` или safe summary;
- `trust = UNTRUSTED_EXTERNAL | INTERNAL_DERIVED | AUTHORITATIVE_EXTERNAL`;
- redaction state.

Не хранить в report export full raw response body по умолчанию.

## 15. Remediation

Рекомендуемая структура:

```json
{
  "summary": "...",
  "steps": [],
  "acceptance": [],
  "references": []
}
```

Remediation может быть локализовано, но acceptance criteria должны сохранять одну и ту же техническую семантику.

## 16. Verification

Хранить:

- recheck supported yes/no;
- requested_at;
- last_recheck_at;
- result;
- verified_fixed_at;

Исторический snapshot фиксирует значения на момент отчета.

## 17. Changes

Change entry должна отвечать:

`было -> стало -> почему важно`.

Минимум:

- change id;
- asset;
- type;
- before;
- after;
- observed_at;
- importance/priority;
- related finding IDs, если есть.

Renderer не должен вычислять change diff из текущих live tables.

## 18. Coverage

Пример:

```json
{
  "capability_id": "domain-security",
  "status": "COMPLETED",
  "checks_total": 12,
  "checks_completed": 12,
  "checks_failed": 0
}
```

Допустимые состояния следует согласовать с текущей Scan/Capability моделью.

## 19. Limitations

Limitations являются first-class data, а не footer-текстом PDF.

Примеры:

- active scan not authorized;
- one asset unreachable;
- technology version not reliably identified;
- authenticated area not tested;
- scanner module unavailable;
- partial scan.

Именно snapshot определяет limitations; renderer только отображает.

## 20. Compatibility and serialization

Provenance, JSON serialization, validation, backward compatibility and localization rules continue in `REPORT_SCHEMA_COMPATIBILITY.md`.
