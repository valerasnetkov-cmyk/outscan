# ADR 0007: Change Intelligence is a first-class capability

Status: Accepted  
Date: 2026-09-02

## Context

Публичные DNS/TLS/header проверки и scheduled vulnerability scans уже широко представлены на рынке. Для OUTSCAN недостаточно хранить только текущее состояние актива.

## Decision

OUTSCAN рассматривает security-relevant change как самостоятельный продуктовый объект.

Система должна сохранять достаточную историю, чтобы определять изменения:

- asset discovery/disappearance;
- IP / ASN;
- NS / MX;
- certificate / CA;
- CDN/WAF;
- TLS;
- DMARC;
- RPKI;
- technology;
- finding state;
- Security Score.

Изменение может создавать `MonitoringEvent` и иметь собственный приоритет независимо от наличия CVE.

## Consequences

- Нельзя безвозвратно overwrite security-relevant posture.
- Data model должен поддерживать versioned/snapshotted observations.
- Workspace должен иметь change timeline/diff.
- Notifications строятся не только на новых vulnerabilities, но и на значимых configuration/infrastructure changes.
- Change significance может быть input для Risk Engine, но не должна искусственно превращаться в CVE severity.
