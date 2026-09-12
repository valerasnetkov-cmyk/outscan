# ADR 0018: Canonical Report Snapshot and Safe Export Projections

- Status: Proposed
- Date: 2026-09-11
- Reconciled: 2026-09-12
- Decision scope: OUTSCAN Reporting

The imported placeholder asserted Accepted; no separate acceptance evidence was found in the reviewed plan/changelog/audits. Documentation-sync approval does not accept this persistence decision. This is the same proposal with the next free number, not a second Reporting ADR. Implementation waits for applicable B2, durable Finding/Risk data and owner acceptance including the ADR-0010 matrix and retention decisions.

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

Proposed decision; no source, migration, API or scanner capability is enabled by this document.

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

Использовать fingerprint/version, scope и detector/profile provenance по ADR-0013; Reporting не создаёт параллельную identity-модель. Confidence сохраняется в каноническом типе; редакционные Potential/Probable/Confirmed не определяют новые машинные enum.

## Proposed persistence classification

`Report` already has TENANT/RESTRICTED classification in ADR-0010. Proposed `ReportSnapshot` and `ReportArtifact` are also TENANT/RESTRICTED, with mandatory `organization_id`, server-owned identity, composite tenant FKs through Report/snapshot and default-deny RLS. Binary object keys do not grant access. Before migration, owner acceptance must add the new rows to ADR-0010 and define snapshot/artifact retention, deletion/export and privilege rules. No nullable tenant or generic AuditLog is introduced; tenant actions use TenantAuditLog and platform actions use separately scoped PlatformAuditLog.

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

Finding condition and disposition remain those of ADR-0013; RemediationAction `REPORTED_COMPLETE` is a separate user workflow under ACTION_CHANGE. Automatic RESOLVED stays disabled until the compatible-coverage policy is implemented and negative-tested. Future resolution must prove scope, detector/profile and fingerprint-version compatibility plus SUCCESS/COMPLETE coverage. Report generation only projects canonical state and never causes a transition.

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

Implementation must pass [Reporting prerequisites and tests](../REPORTING_TESTING.md), including [acceptance](../REPORT_ACCEPTANCE_TESTS.md) and [security cases](../REPORT_SECURITY_TESTS.md). Reporting evidence contributes to existing B2/C; it is not a new release gate.

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
