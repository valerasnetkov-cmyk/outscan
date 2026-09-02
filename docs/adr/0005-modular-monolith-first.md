# ADR 0005: Modular monolith first

Status: Accepted  
Date: 2026-09-02

## Decision

Start with a small set of deployable components: web, admin, API, PostgreSQL, Redis/queue and isolated scanner workers.

Do not create a microservice per domain module in MVP.

## Rationale

Early microservices increase deployment, observability, schema and distributed-failure complexity before scale requirements are known.

## Extraction criteria

A module becomes a service only for proven independent scaling, security isolation, failure isolation, deployment cadence or ownership needs.

Scanner workers are separate immediately because security isolation is already required.
