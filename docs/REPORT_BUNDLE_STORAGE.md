# Report Bundle and Artifact Storage

Status: proposed post-B2 design/tests; no runtime or release evidence. [Reporting scope and prerequisites](REPORTING.md) and accepted ADRs govern this document.

## 1. Назначение

Report Bundle объединяет V1 artifacts одного Report Snapshot в переносимый проверяемый пакет.

Канонический bundle:

```text
OUTSCAN-company.ru-2026-09-11/
|-- report.pdf
|-- report.ru.md
|-- report.en.md
|-- report.ai.md
|-- report.json
`-- manifest.json
```

Фактическое имя target должно проходить filename normalization.

## 2. Bundle invariant

Bundle не создает новые факты.

Все включенные artifacts должны ссылаться на один:

- report ID;
- scan ID;
- schema version;
- snapshot content identity.

Если artifact относится к другому snapshot, bundle generation должен fail.

## 3. Manifest schema

Идентификатор:

`outscan.report-bundle.v1`

Минимальная структура:

```json
{
  "schema": "outscan.report-bundle.v1",
  "report_id": "rpt_...",
  "scan_id": "scan_...",
  "report_schema": "outscan.report.v1",
  "generated_at": "...",
  "files": [
    {
      "name": "report.json",
      "content_type": "application/json",
      "size_bytes": 1234,
      "sha256": "..."
    }
  ]
}
```

## 4. Hashing

Использовать SHA-256 для integrity metadata V1.

Hash вычисляется по финальным bytes artifact после rendering и перед упаковкой.

Manifest не должен включать собственный hash внутрь себя, если это создает рекурсивную зависимость. Hash ZIP можно хранить отдельно в ReportArtifact metadata или download response.

## 5. Missing/failed artifact

Не помещать пустой файл, выдавая его за готовый.

Допустимые стратегии:

- bundle generation блокируется до готовности обязательных artifacts;
- manifest содержит explicit status и bundle строится как partial только если продукт явно поддерживает partial bundle.

Для V1 рекомендовано: только complete bundle.

## 6. Deterministic contents

При одинаковых:

- report snapshot;
- renderer versions;
- locale;
- branding profile;

содержимое logical report должно совпадать.

Binary PDF bytes могут отличаться из-за metadata/timestamps конкретного renderer-а, поэтому integrity относится к конкретному созданному artifact, а не обещает cross-build byte reproducibility без отдельной настройки.

## 7. Object storage

Artifacts хранить как private objects.

Рекомендуемый logical key:

```text
reports/<organization-id>/<report-id>/<artifact-id>
```

Не использовать user-controlled filename как storage path.

Если текущая storage abstraction имеет другую модель, сохранить ее.

## 8. Download authorization

Перед выдачей artifact:

1. аутентифицировать actor;
2. загрузить report metadata в tenant scope;
3. проверить membership/permission;
4. проверить entitlement при необходимости;
5. выдать stream или short-lived signed URL.

Signed URL не заменяет permission check перед его созданием.

## 9. Revocation

Если пользователь теряет доступ к organization, новые download requests должны немедленно fail.

Уже выданный signed URL имеет ограниченный TTL. Выбрать короткий срок, достаточный для скачивания, а не дни/недели по умолчанию.

Если архитектура требует почти мгновенного revoke, отдавать artifact через authenticated proxy вместо долгого signed URL.

## 10. Guessing resistance

Report/artifact IDs должны быть непредсказуемыми, но это defense-in-depth.

Даже знание валидного ID другого tenant должно приводить к authorization deny без утечки существования объекта.

## 11. Filename sanitation

Download filename может содержать target для удобства, но должен строиться из normalized display value.

Запрещать/удалять:

- `/` и `\\`;
- control chars;
- NUL;
- CR/LF;
- path traversal sequences;
- слишком длинные values;
- неоднозначные reserved names, если платформа чувствительна к ним.

Content-Disposition формировать через безопасную library/platform primitive.

## 12. ZIP security

Bundle builder должен:

- создавать только файлы из allowlisted artifact set;
- не принимать arbitrary filesystem paths от пользователя;
- не следовать symlinks;
- не включать temp files;
- не включать secrets/logs;
- задавать bounded total size;
- очищать temp workspace после завершения;
- использовать isolated temp directory.

## 13. Zip Slip prevention

Имена entries формируются самим OUTSCAN.

Никогда не копировать произвольный path из report data в ZIP entry name.

Все entries должны быть flat или иметь фиксированную internal structure.

## 14. Bundle idempotency

Idempotency key:

```text
report_id + bundle_version + included_renderer_versions + branding_profile
```

Повторный parallel request не должен создавать неконтролируемое количество ZIP.

## 15. Storage encryption

Использовать encryption at rest, если она доступна в выбранном object storage и соответствует текущей инфраструктурной политике.

Не внедрять custom cryptography для V1.

Передача - только по защищенному transport, согласованному с общей платформой.

## 16. Retention

Разделять:

- Report Snapshot retention;
- individual artifact retention;
- ZIP retention.

ZIP можно хранить короче и пересобирать из отдельных artifacts/snapshot.

Удаление bundle не должно удалять canonical snapshot.

## 17. Deletion

Если data-retention policy требует удаления организации/отчетов:

- удалить/поставить на удаление artifacts;
- учесть object versions/backups согласно общей policy;
- удалить signed-link access;
- сохранить только то, что требуется audit/legal policy;
- не оставлять orphan objects.

Конкретные сроки определяются общей data policy OUTSCAN.

## 18. Audit events

Рекомендуемые события:

```text
REPORT_ARTIFACT_GENERATED
REPORT_ARTIFACT_GENERATION_FAILED
REPORT_ARTIFACT_DOWNLOAD_AUTHORIZED
REPORT_ARTIFACT_DOWNLOAD_DENIED
REPORT_BUNDLE_GENERATED
REPORT_BUNDLE_GENERATION_FAILED
```

Не включать в event payload sensitive evidence.

## 19. MIME types

Минимум:

- PDF: `application/pdf`;
- Markdown: `text/markdown; charset=utf-8`;
- JSON: `application/json`;
- ZIP: `application/zip`.

Добавлять `X-Content-Type-Options: nosniff` на download responses, если это согласуется с web layer.

## 20. Caching

Tenant reports не должны попадать в shared public cache.

Download responses должны иметь private/no-store policy согласно выбранной delivery модели.

Signed object storage URL также не должен использовать public cache policy, раскрывающую client artifacts.

## 21. Resource limits

Установить:

- max artifact size;
- max bundle size;
- max concurrent bundle jobs per tenant;
- generation timeout;
- queue priority;
- retry count.

Retry не должен создавать duplicate objects без cleanup/deduplication.

## 22. Observability

Метрики:

- artifact bytes by format;
- bundle bytes;
- generation duration;
- failed uploads;
- orphan cleanup count;
- denied downloads;
- signed URL issuance count;
- retention cleanup failures.

## 23. White Label future

Для будущего White Label предусмотреть `branding_profile` в artifact identity.

V1 значение фиксировано:

`OUTSCAN_DEFAULT`

Не строить editable template engine в V1.

## 24. Share-link future

Share-link не реализуется как permanent public object URL.

Будущая модель должна иметь:

- opaque share token;
- report/artifact scope;
- expiry;
- revoke;
- optional password/recipient policy;
- audit;
- rate limits.

## 25. Done criteria

Bundle готов, если manifest hashes совпадают с фактическими bytes, cross-tenant download закрыт, filenames безопасны, ZIP не может включить произвольный path, а повторные запросы generation контролируются idempotency и quotas.
