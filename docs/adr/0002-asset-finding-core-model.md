# ADR 0002: Asset and Finding as core abstractions

Status: Accepted  
Date: 2026-09-02

## Decision

Use `Asset` as the primary resource abstraction and normalized `Finding` as the common result of all scanners.

Add `AssetRelation` from the start even if V1 uses only a subset of relation types.

## Rationale

OUTSCAN is expected to grow from domains/websites into APIs, repositories, mobile, cloud, internal services and Asset Graph/Attack Paths.

A website-specific schema would create expensive migrations and duplicated logic.

## Consequences

- scanner-specific raw output is normalized;
- Risk Engine consumes Finding/domain data, not scanner CLI format;
- UI can expand to new asset types without replacing the core model.
