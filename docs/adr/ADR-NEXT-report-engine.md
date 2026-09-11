# ADR-NEXT: Canonical Report Snapshot and Safe Export Projections

- Status: Accepted
- Date: 2026-09-11
- Decision scope: OUTSCAN Reporting

## Context

OUTSCAN должен формировать отчеты для разных получателей:

- Workspace;
- руководитель/заказчик в PDF;
- администратор/разработчик в Markdown RU;
- международная техническая команда в Markdown EN;
- coding assistants через AI Handoff Markdown;
- внешние системы через JSON;
- полный переносимый Report Bundle.

Если каждый формат будет собирать данные самостоятельно из live tables, один и тот же report_id может показывать разные значения в зависимости от времени генерации, языка и renderer-а.

Кроме того, scanner обрабатывает недоверенный внешний контент. Передача raw scanner output в AI document создает риск indirect prompt injection и утечки секретоподобных значений.

## Decision

OUTSCAN использует один immutable canonical Report Snapshot для каждого финализированного отчета.

```text
Completed Scan
  -> Normalized Findings / Risk Engine
  -> Immutable Report Snapshot
  -> controlled projections/renderers
```

Все V1 представления строятся только из snapshot:

- Workspace historical projection;
- PDF;
- Markdown RU;
- Markdown EN;
- AI Handoff Markdown;
- JSON;
- ZIP Bundle.

## Stable Finding identity

Reports используют canonical stable Finding ID из Finding domain.

Finding identity не зависит от severity, языка, report date, ordering или renderer-а.

Если текущая Finding model не имеет stable fingerprint, versioned identity mechanism создается в Finding domain до завершения Reporting V1.

## Immutability

После финализации snapshot не меняется вслед за live state.

Текущий Workspace может отдельно показывать current state рядом с historical snapshot state.

Изменение renderer-а не изменяет factual snapshot.

## Schema versioning

Canonical schema имеет explicit version, начиная с:

`outscan.report.v1`.

AI Handoff и bundle manifest имеют отдельные версии:

- `outscan.ai-report.v1`;
- `outscan.report-bundle.v1`.

Breaking semantic changes требуют новой major schema. Historical snapshots не переписываются in-place ради новой версии.

## Renderer boundary

Renderer не читает arbitrary live Findings/Assets/ThreatIntel tables для построения historical artifact.

Все данные получает из canonical snapshot или строго определенной projection snapshot.

## AI Handoff

AI Handoff является отдельной minimized projection.

Обязательные правила:

- scanned external content считается untrusted data;
- raw scanner output не становится trusted prompt instructions;
- secrets/tokens/cookies/private keys не экспортируются;
- untrusted evidence структурно отделено;
- confidence не повышается AI renderer-ом;
- model output не считается подтверждением remediation;
- V1 export не вызывает внешнюю модель и не получает tool permissions.

## Scan authorization

Reporting не меняет и не расширяет scanner permissions.

```text
ReportCapability != ScanAuthorization
```

Наличие capability в coverage сообщает, что выполнялось, но не разрешает новый scan.

Recheck остается отдельным явно авторизованным действием существующего scanning workflow.

## Artifact storage

Generated artifacts являются производными объектами.

Они:

- хранятся private;
- tenant-authorized на download;
- имеют hash/renderer version;
- могут быть регенерированы из snapshot;
- не являются источником истины.

## Report Bundle

Bundle содержит только artifacts одного snapshot и manifest с SHA-256 каждого включенного файла.

V1 bundle complete-only: обязательный отсутствующий/failed artifact блокирует готовый bundle, если продукт отдельно не вводит partial bundle semantics.

## Lifecycle

Reports отражают finding lifecycle.

Заявление пользователя об исправлении не равно подтвержденному устранению.

`RESOLVED` требует успешного OUTSCAN recheck или другого уже утвержденного deterministic proof.

## Consequences

### Positive

- все форматы согласованы;
- historical reports воспроизводимы;
- локализация не меняет факты;
- проще API/интеграции;
- AI export получает отдельную security boundary;
- White Label/SARIF/API delivery можно добавлять без изменения core truth;
- можно доказуемо сравнивать отчеты во времени.

### Costs

- snapshot требует хранения frozen data;
- schema нужно версионировать;
- renderer parity нужно тестировать;
- stable Finding identity становится обязательной domain capability;
- artifact generation требует queue/storage observability.

## Alternatives considered

### Renderer reads live tables

Rejected: historical data может изменяться между exports и форматы расходятся.

### PDF as source of truth

Rejected: presentation format плохо подходит для API, AI и deterministic comparison.

### Markdown as source of truth

Rejected: текстовая структура не является достаточно строгим canonical data contract.

### Raw scanner output for AI

Rejected: избыточные данные, секреты, unstable format и indirect prompt injection risk.

### AI-generated report facts

Rejected: factual state должен формироваться Normalizer/Risk Engine и проверяемыми structured sources. AI может объяснять/редактировать позднее, но не определять truth.

## Security invariants

1. User A cannot read/download User B/tenant report.
2. Artifact ID or signed URL does not grant report ownership.
3. Report generation cannot expand scan scope.
4. Snapshot cannot silently mutate after finalization.
5. AI export cannot contain raw secret values.
6. Prompt injection in evidence cannot change trusted instructions or tool authority.
7. Renderer failure cannot corrupt canonical snapshot.
8. Accepted risk is not represented as resolved.
9. Report with incomplete scope must disclose limitations.

## Verification

Implementation must pass acceptance and negative tests defined in `REPORT_ACCEPTANCE_TESTS.md` before Reporting V1 is considered production-ready.

## Future

The same architecture may later support:

- SARIF;
- scheduled report delivery;
- signed/revocable share links;
- Agency/White Label;
- direct ChatGPT/Codex/Claude integrations;
- API delivery;
- OUTLYRA branding in GLOBAL realm.

Future integrations remain projections/delivery mechanisms and do not replace canonical Report Snapshot.