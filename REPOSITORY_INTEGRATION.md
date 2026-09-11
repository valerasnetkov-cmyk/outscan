# Repository Integration - Reporting V1

## 1. Цель

Этот файл не задает фиксированные пути исходного кода. Он описывает, какие существующие документы и domain boundaries Codex должен синхронизировать при внедрении Reporting V1.

Перед применением сопоставить названия ниже с фактическим working tree.

## 2. Не создавать параллельную архитектуру

Переиспользовать существующие:

- Scan;
- Finding;
- FindingEvidence;
- Risk Engine;
- Asset;
- Monitoring/Change entities;
- Organization/tenant model;
- authorization helpers;
- queue/job abstraction;
- object storage abstraction;
- Audit Log;
- Capability Registry;
- Notifications, если позднее reports доставляются по расписанию.

Report Engine не должен иметь собственную копию findings или scanner policy вне immutable snapshot projection.

## 3. README.md

Добавить кратко:

- наличие Reports subsystem;
- назначение immutable Report Snapshot;
- V1 форматы;
- где находится документация;
- команды тестов/report fixtures, если появились;
- ограничения: report generation не запускает сканирование.

README не превращать в полную спецификацию renderer-ов.

## 4. CHANGELOG.md

Записать фактически выполненное, а не весь roadmap пакета.

Пример категории изменений:

- canonical Report Snapshot;
- JSON contract;
- Markdown/PDF/AI renderers;
- private artifact storage;
- Report Bundle;
- security hardening AI export;
- authorization/negative tests.

Если реализован только первый slice, не заявлять готовыми остальные.

## 5. plan.md

Добавить actionable stages:

1. snapshot/data contract;
2. JSON renderer;
3. RU/EN Markdown;
4. AI Handoff security projection;
5. PDF;
6. bundle/storage;
7. Reports Workspace UI;
8. future SARIF/share/White Label/API delivery.

Отдельно записать blockers/риски, обнаруженные в фактической архитектуре.

## 6. Architecture documentation

Зафиксировать dependency direction:

```text
Scanners
  -> Normalizer
  -> Findings/Risk Engine
  -> Report Snapshot
  -> Renderers
  -> Artifact Storage
```

Запретить reverse dependency, при которой renderer вызывает scanner или меняет Finding truth.

Указать, где выполняется asynchronous generation.

## 7. Data model

Синхронизировать существующую `Report` entity.

Добавить/уточнить только необходимые сущности:

- Report;
- ReportSnapshot или эквивалент immutable payload;
- ReportArtifact;
- schema/renderer versions;
- artifact hash;
- status/timestamps.

Не создавать новую Finding table ради reports.

Если snapshot хранится JSON/JSONB, документировать validation/versioning и объемные ограничения.

Если snapshot нормализован по таблицам, доказать immutability и historical reconstruction.

## 8. Finding model

Проверить, существует ли stable canonical ID/fingerprint.

Если да - Report Engine обязан использовать его.

Если нет - создать versioned identity mechanism в Finding domain, не внутри PDF renderer-а.

Сохранить existing lifecycle states и добавить новые только если это действительно требуется.

## 9. API contract

V1 internal/user-facing endpoints должны соответствовать текущему API style.

Логически понадобятся операции:

- list reports;
- get report metadata/snapshot view;
- request/get artifact;
- artifact status;
- authorized download;
- request bundle;
- optional retry renderer.

Не копировать эти названия endpoint-ов буквально, если API проекта использует другие conventions.

Все protected operations tenant-scoped server-side.

## 10. Security model

Добавить trust boundaries:

- Report Snapshot Builder;
- renderer inputs;
- artifact storage;
- download authorization;
- AI Handoff external-content boundary.

Зафиксировать invariants из `docs/AI_HANDOFF_SECURITY.md` и `docs/REPORT_BUNDLE_STORAGE.md`.

## 11. Scanning policy

Добавить явное правило:

`Reporting capability does not grant or expand ScanAuthorization.`

Report coverage является описанием выполненных checks, а не permission source.

AI export не запускает recheck автоматически.

## 12. Capability Registry

Если Reports отображают coverage по capabilities:

- ссылаться на stable capability IDs;
- использовать safe public/product projection;
- не раскрывать internal engine commands/template IDs без необходимости;
- capability publication не влияет на scanner authorization.

Не создавать отдельный Reports Capability Registry.

## 13. UI/UX docs

Добавить:

- Reports list;
- historical snapshot view;
- current state indicator;
- download menu;
- AI export explanation;
- coverage/limitations;
- artifact errors;
- responsive/accessibility требования.

Использовать `docs/REPORT_UI_UX.md`.

## 14. Testing docs

Добавить suites из `docs/REPORT_ACCEPTANCE_TESTS.md` и обязательные negative suites из `docs/REPORT_SECURITY_TESTS.md`.

Особенно сохранить negative security tests:

- wrong tenant;
- known foreign report ID;
- known foreign artifact ID;
- injection evidence;
- secret redaction;
- filename/path abuse;
- duplicate concurrent generation;
- report action cannot start unauthorized scan.

## 15. Operations docs

Если в проекте есть OPERATIONS/RUNBOOKS, добавить:

- report queue health;
- PDF renderer failures;
- object storage failures;
- artifact cleanup;
- orphan detection;
- retention job;
- bundle failures;
- metrics/alerts.

## 16. Privacy/data documentation

Reporting может содержать sensitive technical data организации.

Синхронизировать существующие документы по:

- retention;
- deletion;
- tenant access;
- admin break-glass access;
- external AI transfer.

Этот пакет не придумывает юридические сроки хранения и не разрешает автоматическую передачу внешним AI providers.

## 17. Notifications integration

Scheduled email/report delivery не входит в первый slice.

Когда появится:

```text
Report READY
  -> domain event
  -> Notifications policy
  -> authorized recipient
  -> delivery link / attachment policy
```

Не отправлять client report как marketing mail.

Не прикладывать sensitive ZIP/PDF к email без отдельной политики; предпочтительно authenticated download link.

## 18. Agency/White Label future

Не реализовывать template CMS в V1.

Заложить `branding_profile` в artifact identity, default:

`OUTSCAN_DEFAULT`.

White Label позже обязан сохранять фактическую attribution/schema metadata внутри machine formats, даже если визуальный PDF брендируется агентством согласно будущей политике.

## 19. International OUTLYRA future

Не хардкодить RU-only domain/brand assumptions в canonical report schema.

Product core может поддерживать разные deployment realms.

Branding/localization renderer layer должен позволить позднее использовать OUTLYRA без смешивания RU/GLOBAL tenant data realms.

Не создавать cross-realm report access.

## 20. ADR

Reporting содержит долговременное архитектурное решение: immutable canonical snapshot + renderer projections + safe AI projection.

Пакет включает `docs/adr/ADR-NEXT-report-engine.md`.

Codex обязан:

1. найти следующий свободный ADR number;
2. проверить project ADR naming/status rules;
3. переименовать `NEXT`;
4. сохранить смысл решения;
5. не создавать duplicate ADR, если аналогичное решение уже принято.

Пользователь подтвердил модель Reporting; если governance проекта допускает такую фиксацию, ADR можно сохранить как `Accepted`. Иначе применить статус, требуемый repository policy, и явно сообщить отличие.

## 21. Documentation boundaries

Durable details хранить в `/docs`, а не раздувать README.

Каждый authored MD <=400 строк согласно действующему project gate.

## 22. Suggested implementation order

```text
Inspect current tree
  -> reconcile ADR
  -> data model/snapshot
  -> JSON fixture/schema
  -> auth tests
  -> RU/EN MD
  -> AI security projection/tests
  -> PDF
  -> artifact storage/bundle
  -> Workspace UI
  -> full verification
  -> docs/changelog/plan
```

## 23. Verification before handoff

Codex должен фактически запустить доступные:

- format/lint;
- typecheck;
- targeted tests;
- security negative tests;
- full relevant test suite;
- production build;
- line count;
- `git diff --check` или эквивалент.

Проверить финальный diff на:

- accidental source duplication;
- secrets;
- debug code;
- public storage exposure;
- stale docs;
- renderer access to live state;
- scope creep.

## 24. Handoff format

В финальном сообщении Codex должен указать:

- какие slices реально реализованы;
- какие файлы/модули затронуты;
- какие проверки запущены и их результат;
- что осталось unverified;
- security status только для измененного scope;
- оставшиеся follow-ups.