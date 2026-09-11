# Report Engine

## 1. Назначение

Report Engine превращает подтвержденные данные OUTSCAN в воспроизводимый, неизменяемый отчетный snapshot и затем строит из него пользовательские и машинные представления.

Report Engine не является scanner-ом, Risk Engine или Notifications subsystem. Он потребляет их результаты и не может расширять их полномочия.

## 2. Канонический поток

```text
Scan completed
    |
    v
Normalized scan data
    |
    v
Risk Engine / Finding correlation
    |
    v
Report Snapshot Builder
    |
    v
Immutable Report Snapshot
    |
    +--> Workspace projection
    +--> JSON renderer
    +--> Markdown RU renderer
    +--> Markdown EN renderer
    +--> AI Handoff renderer
    +--> PDF renderer
    +--> Bundle builder
```

## 3. Основные сущности

### Report

Логическая запись отчета.

Рекомендуемые поля:

- `id`;
- `organization_id`;
- `primary_target_id` или эквивалент scope reference;
- `scan_id`;
- `snapshot_id`;
- `status`;
- `created_at`;
- `created_by` - system/user, если проект различает источник;
- `report_version`;
- `schema_version`.

### ReportSnapshot

Неизменяемая factual projection результатов scan на момент генерации.

Snapshot должен хранить достаточно данных, чтобы historical report не менялся вслед за текущими Asset/Finding/ThreatIntel records.

### ReportArtifact

Отдельный сгенерированный файл или представление.

Рекомендуемые поля:

- `id`;
- `report_id`;
- `format`;
- `locale`;
- `renderer_version`;
- `storage_key`;
- `content_type`;
- `size_bytes`;
- `sha256`;
- `status`;
- `created_at`;
- `expires_at`, только если политика хранения это требует.

Artifact не является источником истины. Его допустимо регенерировать из snapshot.

## 4. Состояния

Для Report generation достаточно компактной state machine:

```text
PENDING -> BUILDING -> READY
                    -> FAILED
```

Snapshot финализируется атомарно до перехода Report в `READY` либо на выделенном этапе `SNAPSHOT_READY`, если существующая архитектура требует асинхронного рендеринга.

Для каждого artifact допускается собственный статус:

```text
PENDING -> RENDERING -> READY
                      -> FAILED
```

Ошибка PDF renderer-а не должна инвалидировать JSON или сам snapshot.

## 5. Когда создается snapshot

Базовый V1 сценарий:

1. Scan завершен.
2. Normalizer завершил обработку.
3. Risk Engine сформировал итоговые statuses/confidence/severity.
4. Создается Report Snapshot.
5. Snapshot получает immutable identifier и version metadata.
6. Запускаются renderer jobs.

Не создавать финальный snapshot из частично завершенного scan, если это не отдельный явно обозначенный тип partial report.

## 6. Immutability

После финализации нельзя silently update:

- score;
- finding severity/status/confidence;
- evidence;
- affected assets;
- Threat Intelligence значения;
- recommendations;
- scan coverage;
- limitations;
- timestamps;
- report schema version.

Если требуется исправить ошибку формирования отчета, создается новая revision/export artifact либо новый Report Snapshot согласно принятой модели. Исторический объект не переписывается незаметно.

## 7. Snapshot versus live state

Workspace может показывать одновременно:

- snapshot state - что было зафиксировано в отчете;
- current state - что известно OUTSCAN сейчас.

UI обязан визуально различать их.

Пример:

```text
Report 2026-09-11
Finding OUT-FND-...
Snapshot status: OPEN
Current status: RESOLVED
Resolved after report: 2026-09-12
```

Исторический PDF остается прежним.

## 8. Stable Finding identity

Report Engine использует canonical Finding ID из доменной модели, а не создает номера `HIGH-1`, `HIGH-2`.

Identity finding не должен зависеть от:

- текущей severity;
- сортировки;
- номера отчета;
- языка;
- renderer-а.

Если existing Finding model уже имеет fingerprint/deduplication key, переиспользовать ее. Не создавать второй механизм identity внутри Reports.

## 9. Renderer boundary

Рекомендуемая абстракция:

```text
ReportSnapshot
    |
    v
ReportRenderer
    |
    +-- JSON
    +-- Markdown RU
    +-- Markdown EN
    +-- AI Handoff
    +-- PDF
```

Renderer получает только snapshot/projection и не читает произвольные live tables в обход Report Engine.

Это предотвращает ситуацию, когда PDF и JSON одного report_id содержат факты из разных моментов времени.

## 10. Idempotency

Повторный запрос:

`generate PDF for report X, renderer version Y, locale ru`

не должен создавать бесконечное число идентичных артефактов.

Рекомендуемый idempotency key:

```text
report_id + format + locale + renderer_version + branding_profile
```

`branding_profile` пока фиксирован как OUTSCAN default, но поле можно заложить для будущего White Label.

Concurrent duplicates должны сводиться к одному artifact либо безопасно дедуплицироваться после генерации.

## 11. Authorization

Проверять server-side:

- принадлежность report организации;
- membership текущего пользователя;
- permission на просмотр report;
- permission на экспорт/download;
- статус организации/доступа, если он влияет на export entitlement.

Нельзя считать наличие `report_id`, object-storage URL или artifact ID доказательством доступа.

Platform Admin не получает автоматически неограниченное чтение клиентских technical reports, если действующая модель OUTSCAN уже использует ограниченный/break-glass доступ.

## 12. Artifact storage

Хранить артефакты в private object storage или эквивалентном закрытом хранилище.

Запрещено:

- public bucket by default;
- предсказуемая permanent public URL;
- полагаться только на случайность имени файла;
- помещать tenant data в публичный CDN без отдельной политики.

Download должен проходить через authorization boundary или короткоживущий signed URL, выданный после server-side проверки.

## 13. Retention

Не смешивать две политики:

- retention snapshot metadata;
- retention binary artifacts.

Snapshot может храниться дольше, чем PDF/ZIP, если артефакты всегда можно регенерировать.

Точная политика retention должна следовать тарифам, законодательным требованиям и текущей data policy проекта; этот пакет ее не придумывает.

## 14. Scope и coverage

Каждый snapshot обязан содержать:

- что было разрешено проверять;
- какие assets вошли в scope;
- какие capability/check groups выполнялись;
- какие проверки не выполнялись;
- failed/skipped checks;
- временной интервал scan;
- ограничения интерпретации.

Если capability registry существует, report coverage должен ссылаться на public/product capability IDs, а не на внутренние scanner commands.

Capability в отчете не дает разрешения запускать scanner.

## 15. Risk data freeze

При необходимости воспроизводимости snapshot фиксирует используемые на момент формирования значения:

- CVE identifier;
- CVSS value/source;
- EPSS value и дата;
- KEV status и дата получения;
- confidence;
- severity;
- risk priority;
- официальные references.

Позднее Threat Intelligence может измениться, но historical report остается доказуемым снимком того, что система знала тогда.

## 16. Error handling

Report generation должен fail safely.

- renderer timeout -> artifact FAILED;
- storage upload failure -> artifact FAILED;
- malformed snapshot -> generation rejected and logged;
- missing optional enrichment -> report may continue с явным `unknown`, если это допускает schema;
- missing required tenant/scope/scan identity -> hard fail.

Не заменять неизвестные значения догадками.

## 17. Auditability

Логировать как минимум:

- snapshot created;
- export requested;
- artifact generated;
- artifact download authorized;
- artifact generation failed;
- bundle generated;
- manual regeneration, если появится.

Не писать в audit/logs сырые secrets или полный sensitive evidence.

## 18. Metrics

Минимум:

- report_build_duration;
- report_build_failures;
- artifact_render_duration by format;
- artifact_render_failures by format;
- artifact_storage_failures;
- bundle_build_failures;
- report_download_denied;
- AI projection redaction count;
- snapshot validation failures.

## 19. V1 implementation principle

Не выделять Report Engine в отдельный microservice только из-за названия.

Сначала использовать существующий backend/job infrastructure, queue и object storage. Выделение сервиса оправдано только фактической нагрузкой или security/operational boundary.

## 20. Acceptance summary

Report Engine готов к V1, когда один завершенный scan создает один валидный immutable snapshot, а все обязательные renderer-ы строят согласованные артефакты без чтения live state в обход snapshot.