# OUTSCAN Reporting Codex Package

Status: historical Reporting package reference, reconciled 2026-09-12. Implementation instructions below are deferred; [current Reporting scope](docs/REPORTING.md), [Proposed ADR 0018](docs/adr/0018-report-engine.md) and accepted repository ADRs/gates take precedence. This file is not an instruction to start runtime work or acceptance evidence.

## Purpose

Documentation package for implementing Reporting V1 in OUTSCAN.

The package formalizes the confirmed product model:

`one immutable Report Snapshot -> multiple audience-specific projections`.

## Files

### Start here

- `CODEX_HANDOFF.md` - implementation order, invariants, scope and Definition of Done.

### Core architecture

- `docs/REPORT_ENGINE.md` - Report Engine boundaries, entities, state, storage and lifecycle.
- `docs/REPORT_SCHEMA_VERSIONING.md` - canonical snapshot schema, stable Finding IDs and versioning.
- `docs/REPORT_FORMATS.md` - Workspace, PDF, MD RU/EN, AI MD, JSON and ZIP semantics.
- `docs/REPORT_RENDERING_RULES.md` - shared localization, references, output bounds and renderer parity rules.
- `docs/REPORT_SCHEMA_COMPATIBILITY.md` - provenance, JSON serialization, validation and backward compatibility.

### Security

- `docs/AI_HANDOFF_SECURITY.md` - indirect prompt injection, redaction, trust classes and negative tests.
- `docs/REPORT_BUNDLE_STORAGE.md` - private artifact storage, hashes, ZIP security and downloads.

### Product/UI

- `docs/REPORT_UI_UX.md` - Reports UI, historical/current distinction and download UX.

### Verification

- `docs/REPORT_ACCEPTANCE_TESTS.md` - functional, schema, renderer and lifecycle acceptance tests.
- `docs/REPORT_SECURITY_TESTS.md` - authorization, AI injection, storage, ZIP, concurrency and abuse negative tests.

### Architecture decision

- `docs/adr/0018-report-engine.md` - Proposed; normalized from the imported placeholder, with owner acceptance and data classification still pending.

### Repository integration

- `REPOSITORY_INTEGRATION.md` - checklist for README, CHANGELOG, plan, architecture, data model, API, security, testing and operations documentation.

## V1 outputs

- Workspace;
- PDF;
- Markdown RU;
- Markdown EN;
- AI Handoff Markdown;
- JSON;
- ZIP Report Bundle.

## Deferred

- SARIF;
- public/revocable share-link;
- White Label;
- scheduled delivery;
- direct external AI action;
- API push delivery.

## Critical invariants

- snapshot immutable;
- stable Finding ID;
- renderer parity;
- tenant isolation;
- reporting does not grant scan permissions;
- AI evidence is untrusted;
- no secret values in AI export;
- `RemediationAction.REPORTED_COMPLETE != Finding.RESOLVED`; automatic resolution stays disabled under ADR-0013 until compatible-coverage evidence;
- historical state is not silently replaced by current state.

## Recommended Codex instruction

`Начни с CODEX_HANDOFF.md. Сначала проинспектируй фактический working tree и ADR, затем интегрируй Reporting V1 по минимальным вертикальным slices. Не создавай параллельные модели Scan/Finding/Authorization и не расширяй scanning permissions. После каждого slice запускай relevant tests; перед завершением выполни полный verification gate и синхронизируй README/CHANGELOG/plan/docs.`
