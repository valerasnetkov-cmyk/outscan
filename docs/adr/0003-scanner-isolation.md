# ADR 0003: Scanner workers are a separate security boundary

Status: Accepted  
Date: 2026-09-02

## Decision

Scanner execution does not happen in the trusted API process. Jobs execute in isolated, resource-limited workers/containers.

## Required properties

Worker has no direct access to:

- production PostgreSQL;
- private application network;
- cloud metadata;
- platform master secrets;
- Docker host socket.

## Rationale

OUTSCAN accepts user-controlled external targets and invokes complex third-party security engines. Treating the worker as equally trusted as the API would amplify SSRF, scanner and supply-chain risk.

## Consequences

- queue/job contract required;
- scanner images/profiles pinned;
- result channel must be narrow and authenticated;
- operations must monitor resource-limit and policy denials.
