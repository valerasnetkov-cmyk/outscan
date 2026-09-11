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

Owner clarification, 2026-09-10: the current OUTSCAN deployment target is Ubuntu + Docker Compose. B1 isolation/egress implementation is designed for that environment. Scanner execution workers may subsequently move to Kubernetes while retaining the original security boundary, credential exclusions and bounded result contract; this does not approve a shared scanner/trusted-service security context. See [deployment target](../DEPLOYMENT_TARGET.md). The accepted isolation decision remains unchanged.

- queue/job contract required;
- scanner images/profiles pinned;
- result channel must be narrow and authenticated;
- operations must monitor resource-limit and policy denials.
