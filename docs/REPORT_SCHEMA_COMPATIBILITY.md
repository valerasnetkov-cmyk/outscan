# Report Schema Compatibility and Serialization

This file continues `REPORT_SCHEMA_VERSIONING.md` with provenance, serialization, validation and compatibility rules.

## 20. Provenance

Snapshot должен позволять установить происхождение ключевых фактов без раскрытия внутренних секретов.

Минимально:

- source category;
- observation timestamp;
- capability/check ID;
- risk-engine version;
- report-builder version.

## 21. JSON serialization

Требования:

- UTF-8;
- deterministic field naming;
- ISO 8601 timestamps with timezone;
- explicit nulls where absence significant;
- no NaN/Infinity;
- no locale-formatted numbers;
- stable enums;
- schema identifier at top level.

## 22. Validation

Перед финализацией snapshot выполнить deterministic schema validation.

При ошибке required field generation должен fail closed.

Renderer не должен "чинить" invalid snapshot на лету.

## 23. Backward compatibility tests

Хранить fixture хотя бы одного `outscan.report.v1` snapshot и проверять новые renderer versions против него.

При появлении `v2` сохранить V1 fixture и reader, пока retention policy допускает существование V1 reports.

## 24. Localization

Локализация не применяется к:

- IDs;
- enum values в JSON;
- CVE;
- timestamps в canonical JSON;
- hashes;
- schema/version identifiers;
- URLs/references.

Локализуются:

- titles;
- summaries;
- descriptions;
- remediation text;
- UI/PDF labels.

## 25. Done criteria

Schema V1 считается определенной, когда:

- JSON validation автоматизирована;
- stable Finding ID rule задокументирован и протестирован;
- historical fixture существует;
- all renderers consume snapshot, а не live state;
- limitations/coverage входят в schema;
- AI projection может быть построена без raw scanner output.