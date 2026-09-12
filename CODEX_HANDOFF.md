# OUTSCAN Reporting - Codex handoff

Status: historical Reporting package reference, reconciled 2026-09-12. Implementation instructions below are deferred; [current Reporting scope](docs/REPORTING.md), [Proposed ADR 0018](docs/adr/0018-report-engine.md) and accepted repository ADRs/gates take precedence. This file is not an instruction to start runtime work or acceptance evidence.

## Цель

Реализовать подсистему отчетности OUTSCAN поверх существующих сущностей Scan, Asset, Finding, Risk Engine и Monitoring, не создавая параллельную модель данных и не расширяя права сканирования.

Каноническая модель:

`Scan -> Normalized data -> Risk Engine -> immutable Report Snapshot -> renderers/export artifacts`.

Один Report Snapshot является зафиксированным результатом конкретного сканирования. Из него формируются разные представления для разных получателей.

## V1 scope

Обязательные представления:

- Workspace - интерактивное представление текущего и исторического отчета;
- PDF - для руководителя, заказчика и передачи вне OUTSCAN;
- Markdown RU - для администратора и разработчика;
- Markdown EN - для англоязычной технической команды;
- AI Handoff Markdown - для Codex, Claude, ChatGPT и других coding assistants;
- JSON - канонический машинно-читаемый экспорт;
- ZIP Report Bundle - полный пакет артефактов с manifest и SHA-256.

Не входит в V1:

- SARIF;
- публичные share-links;
- White Label;
- автоматическая отправка отчета во внешний AI;
- автоматическое изменение репозитория или инфраструктуры;
- API delivery во внешние системы;
- подпись PDF квалифицированной электронной подписью.

Эти направления должны быть архитектурно возможны позднее, но не должны усложнять первый slice.

## Зафиксированные продуктовые инварианты

1. Источник истины - Report Snapshot, а не PDF или Markdown.
2. Snapshot после финализации неизменяем.
3. Все renderer-ы получают одинаковый набор фактов из одного snapshot.
4. Перевод RU/EN не может менять severity, confidence, status, identifiers, score или remediation semantics.
5. Finding имеет стабильный identity между сканами; severity не является частью identity.
6. Report Snapshot не может разрешить новый scan или изменить scanner policy.
7. Public/verified/controlled/intrusive authorization остается отдельной server-side boundary.
8. Tenant isolation проверяется при создании snapshot и при каждом скачивании артефакта.
9. AI Handoff не содержит сырой scanner output как доверенные инструкции.
10. Любой внешний контент считается недоверенными данными.
11. Секреты, cookies, bearer tokens, authorization headers, env values и закрытые учетные данные не экспортируются.
12. Отчет обязан явно показывать scan scope, coverage и limitations.
13. Отсутствие findings не означает и не формулируется как "ресурс безопасен".
14. Исправление считается подтвержденным только после успешной перепроверки OUTSCAN.
15. Historical report должен воспроизводить состояние на момент snapshot, даже если текущий Workspace изменился.

## Перед изменениями

Codex должен сначала прочитать фактический working tree и использовать существующие имена модулей и сущностей.

Минимально проверить:

- `AGENTS.md` и локальные инструкции, если есть;
- `README.md`;
- `CHANGELOG.md`;
- `plan.md`;
- архитектурную документацию;
- модель данных;
- API contract;
- scanning policy;
- security model;
- testing policy;
- UI/UX documentation;
- текущие ADR;
- реализацию Scan, Finding, Risk Engine, object storage и authorization helpers;
- текущий статус Capability Registry и Notifications.

Не копировать названия файлов из этого пакета в source tree механически. Сначала сопоставить пакет с реальной архитектурой.

## Архитектурный порядок реализации

### Slice 1 - Canonical snapshot

- определить Report и ReportSnapshot;
- привязать snapshot к завершенному scan;
- сохранить immutable factual projection;
- добавить schema/report version;
- зафиксировать stable Finding IDs;
- добавить tenant-scoped authorization.

### Slice 2 - JSON renderer

JSON реализовать первым renderer-ом.

Причина: он становится проверяемым контрактом, на котором затем можно тестировать parity остальных форматов.

### Slice 3 - Markdown RU/EN

- стабильная структура заголовков;
- полный технический контекст;
- одинаковые identifiers;
- локализован только человекочитаемый текст.

### Slice 4 - AI Handoff

- отдельная projection;
- только необходимые данные;
- sanitization/redaction;
- явное разделение trusted instructions и untrusted evidence;
- acceptance criteria для каждого finding, когда они доступны.

### Slice 5 - PDF

- Executive Summary в начале;
- Technical Appendix далее;
- обязательные scope/limitations;
- пригодность для печати и передачи клиенту.

### Slice 6 - Report Bundle

- собрать артефакты;
- создать manifest;
- вычислить SHA-256;
- обеспечить idempotent generation;
- tenant-safe download.

### Slice 7 - Workspace UI

- список historical reports;
- экран отчета;
- download menu;
- diff/current-vs-snapshot indicators;
- recheck workflow остается отдельной domain action.

## Finding lifecycle

Use the existing independent axes: Finding condition OPEN/RESOLVED, ADR-0013 disposition, and ACTION_CHANGE RemediationAction workflow including REPORTED_COMPLETE. Do not combine them into a new Finding FSM. Automatic RESOLVED stays disabled until compatible-coverage policy and negative tests exist; user/AI completion claims and successful execution alone never resolve a Finding. Report generation only reads canonical state.

## Security requirements

Подсистема считается production-sensitive.

Обязательны negative tests:

- cross-tenant report read/download;
- guessed artifact ID;
- stale signed URL after authorization revoke;
- indirect prompt injection in evidence;
- secret-like content in scanner output;
- oversized evidence;
- renderer escaping failures;
- duplicate concurrent export request;
- malformed snapshot data;
- report generation for unauthorized scan;
- attempt to use report generation to trigger or expand scanning.

AI-specific требования описаны в `docs/AI_HANDOFF_SECURITY.md`; обязательные security negative tests вынесены в `docs/REPORT_SECURITY_TESTS.md`.

## Documentation gate

В том же изменении обновить фактические:

- `README.md`;
- `CHANGELOG.md`;
- `plan.md`;
- architecture;
- data model;
- API contract;
- security model;
- testing documentation;
- UI/UX documentation.

Использовать `REPOSITORY_INTEGRATION.md` как checklist, но адаптировать пути к реальному репозиторию.

## 400-line gate

Все authored source и Markdown-файлы, к которым применяется действующее правило проекта, должны оставаться не более 400 физических строк. Не сжимать код или документацию искусственно ради лимита - делить по ответственности.

## Definition of Done

Работа завершена только если:

- immutable snapshot реализован и протестирован;
- JSON schema/versioning определены;
- PDF/MD RU/MD EN/AI MD/JSON генерируются из одного snapshot;
- Report Bundle проверяет hashes;
- stable Finding IDs сохраняются между повторными scans одной проблемы;
- cross-tenant access отрицательно протестирован;
- AI injection/redaction tests проходят;
- повторный запрос экспорта идемпотентен;
- ошибки renderer-а не портят snapshot;
- relevant lint/typecheck/tests/build проходят;
- line-count gate проходит;
- документация синхронизирована.

Не сообщать `PASS`, если security-sensitive тесты или build не были фактически выполнены.
