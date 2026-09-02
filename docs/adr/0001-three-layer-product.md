# ADR 0001: Three-layer product model

Status: Accepted  
Date: 2026-09-02

## Decision

OUTSCAN has three logical product layers:

1. Public Guest Scan.
2. Customer Workspace.
3. Platform Admin.

## Rationale

Guest Scan is acquisition + safe public diagnostics. Workspace contains verified customer assets and deeper analysis. Platform Admin operates the SaaS and must not share the customer authorization model implicitly.

## Consequences

- separate route/policy boundaries;
- guest data is sanitized;
- full Security Score appears only after verified baseline;
- admin authorization is server-side and privileged actions are audited.
