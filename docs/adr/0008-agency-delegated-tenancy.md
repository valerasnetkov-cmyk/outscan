# ADR 0008: Agency/MSP uses delegated access between isolated tenants

Status: Accepted  
Date: 2026-09-02

## Context

Agency/MSP/White Label является ранним коммерческим направлением OUTSCAN. Наивная модель, где агентство хранит всех клиентов как записи внутри собственного tenant, увеличивает blast radius и риск cross-client data exposure.

## Decision

Каждый конечный клиент остается отдельной `Organization` и отдельной tenant boundary.

Agency/MSP получает ограниченный delegated access через отдельную связь/permission model.

Партнер не становится владельцем клиентского tenant автоматически и не получает скрытых platform-admin прав.

## Consequences

- Tenant isolation остается одинаковой для direct и agency customers.
- Нужны отдельные partner/delegation сущности и authorization tests.
- White Label и partner billing не должны менять ownership security model.
- Любой bulk action должен проверять право на каждую затронутую organization/scope.
- Revocation delegated access не удаляет клиентские данные и ownership.
