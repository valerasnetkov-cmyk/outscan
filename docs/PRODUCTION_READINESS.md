# OUTSCAN Production Readiness — Gate C evidence profile

Status: evidence profile for existing Gate C; no release PASS asserted
Scope: OUTSCAN production releases
Owner: Platform / Security / Engineering

## 1. Purpose

This profile supplies evidence for the existing Gate C in [PRE_SCAFFOLD_GATE](PRE_SCAFFOLD_GATE.md). It answers:

> Is the implemented OUTSCAN release safe, recoverable, observable and operable in production?

A design can be accepted while its implementation is not ready. This document creates no additional release gate and cannot advance A/B1/B2/C.

Canonical sequence:

```text
Architecture / documentation accepted
    -> implementation
    -> tests
    -> applicable B1/B2 PASS
    -> Gate C evidence review
    -> production release
    -> monitoring
    -> post-release review
```

Gate A governs scaffold, B1 any Guest exposure, B2 Workspace and C production. Evidence must match the exact commit, lockfile, artifact/migration/configuration identity and deployment realm. Ubuntu + Docker Compose is the current target; local offline tests or a different realm cannot substitute for target-runtime evidence.

## 2. Core principle

Production readiness is not a technology checklist.

The absence of Kubernetes, Terraform, gRPC, sharding, multi-region deployment or chaos engineering is not a failure by itself.

A criterion passes when the required property is demonstrated with evidence. For example, if Docker-based deployment provides sufficient isolation, rollback, health checks and recovery for the current scale, that is acceptable.

The gate therefore evaluates capabilities and invariants, not fashionable infrastructure choices.

## 3. Gate domains

The gate contains ten mandatory domains:

1. Security Boundaries
2. Identity & Access
3. Scanner Isolation
4. Jobs & Reliability
5. Data & Recovery
6. Delivery
7. Observability
8. Abuse Protection
9. Incident Response
10. Recovery & Resilience

The detailed criteria and stable IDs are defined in `PRODUCTION_READINESS_CHECKLIST.md`.

## 4. Status model

Each criterion has one of four states:

- `PASS` - requirement is demonstrated by current evidence.
- `WARN` - requirement is substantially met, but a non-blocking deficiency remains.
- `FAIL` - requirement is not met, evidence contradicts it, or required evidence is missing.
- `N/A` - criterion does not apply to this release or deployment realm and has a written justification.

`N/A` must never be used merely because implementation is inconvenient.

The profile assessment is binary; the canonical gate matrix alone records actual gate status:

- `GATE C EVIDENCE PROFILE: PASS`
- `GATE C EVIDENCE PROFILE: FAIL`

There is no `conditional PASS` state.

## 5. Decision rules

Overall result is `FAIL` when any of the following is true:

- a `BLOCKER` criterion is `FAIL`;
- a `BLOCKER` criterion has no evidence;
- a required security negative test fails;
- an unresolved Critical/High defect is known in release scope;
- required B1/B2 evidence is absent or the release-candidate CI/build/security stages fail or were skipped;
- required privacy/legal/disclosure, retention/export/delete, privileged MFA/step-up or public-claim evidence is absent;
- release scope changed after the gate without re-evaluation of affected criteria.

A non-blocking `WARN` is allowed only when all are recorded:

- owner;
- impact;
- temporary mitigation;
- due date;
- tracking issue or task.

Warnings must not weaken scanner authorization, tenant isolation, secrets handling, recovery or other security invariants.

## 6. Automatic release blockers

The following conditions force the gate to `FAIL`.

### 6.1 Scan authorization is unsafe

A signed-in user, public endpoint, entitlement, capability publication or administrative grant must not implicitly authorize scanning of an arbitrary target.

Authentication, authorization, ownership verification and scan authorization remain distinct controls.

### 6.2 Tenant isolation is not proven

A tenant must not be able to read, mutate, enumerate or trigger operations on another tenant's protected resources.

Tests must cover direct object references, guessed identifiers and background jobs.

### 6.3 Scanner isolation is insufficient

The disposable scanner must have no DB/Redis/result-ingress/admin credentials, Docker socket, privileged mode or host-network authority. Only the trusted supervisor may own scoped persistence/queue/result credentials. The scanner cannot reach:

- primary application database;
- platform secrets;
- internal/private networks;
- cloud metadata endpoints;
- management interfaces.

Prove read-only/minimal filesystem, CPU/memory/PID/time/request limits, artifact approval/revocation, cancellation/TERM-to-KILL/cleanup and crash/orphan reconciliation. This applies to the effective runtime, not just Compose syntax.

### 6.4 SSRF / target validation protections are incomplete

Target canonicalization and public-address validation must be enforced server-side.

Resolve the complete A/AAAA set and fail closed on any forbidden/ambiguous candidate, including configured internal IPv4/IPv6. Pin actual connections to validated IPs while preserving Host/SNI/certificate checks; re-resolve and revalidate every retry/redirect under ADR-0009. DNS/egress policy must be enforced on the deployment target.

### 6.5 Production secrets are handled insecurely

Hard-coded credentials, secrets committed to source control, broad secret exposure to workers or untracked privileged credentials block release.

### 6.6 Recovery is unproven

Having a backup job is not sufficient.

A production-representative restore procedure must have been executed successfully within the period defined by operations policy, and the result must be recorded.

### 6.7 Critical jobs may disappear silently

Scan jobs and other critical asynchronous work must have explicit states, failure handling and visibility. A failure must not silently lose the job.

Where retries are used, retry limits and terminal failure handling must be defined. A DLQ or equivalent terminal failure mechanism is required when appropriate to the queue design.

### 6.8 No operational health visibility

Production must expose enough health, metrics, logs and alerting to detect at minimum:

- API/service unavailability;
- scanner worker degradation;
- queue saturation or stalled work;
- abnormal scan failure rate;
- Threat Intelligence freshness failures when that data is used;
- notification delivery failures for critical channels where applicable.

### 6.9 No emergency rollback or recovery path

The team must have a documented way to stop or revert a harmful deployment or disable the affected capability.

### 6.10 Critical negative tests fail

Security negative tests that protect trust boundaries are release blockers, even when all happy-path and unit tests pass.

## 7. OUTSCAN-specific invariants

The gate must preserve the existing OUTSCAN model:

```text
ProductCapability / public visibility
    != scanner permission
    != verified scope
    != scan authorization
```

Guest, verified/controlled and intrusive modes remain separate server-side security boundaries.

A marketing/public capability, tariff entitlement or UI state must never directly expand scan scope.

Administrative trusted access must remain target-bound, auditable and unable to become a universal ownership-verification bypass.

## 8. Evidence requirements

A reviewer must be able to verify the release without relying on statements such as "it should work".

Acceptable evidence includes:

- CI run and test artifacts;
- security negative test results;
- dependency / secret scan reports;
- migration dry-run or migration test evidence;
- backup and restore exercise record;
- deployment and rollback exercise;
- health-check and alert test evidence;
- queue failure/retry test;
- scanner network-isolation test;
- target validator / SSRF tests;
- tenant isolation tests;
- logs or screenshots from staging when needed;
- approved runbooks and incident procedures.

Evidence must correspond to the release candidate being approved.

## 9. Release process

### Step 1. Freeze gate scope

Record:

- release/version/commit;
- deployment realm;
- affected capabilities;
- schema changes;
- scanner/worker changes;
- external dependency changes;
- security-boundary changes.

### Step 2. Run automated checks

Run applicable CI checks and security tests. Automated results should be linked from the checklist rather than copied manually.

### Step 3. Complete manual evidence

Perform checks that cannot be proven by unit tests, especially restore, rollback, alert delivery and selected isolation tests.

### Step 4. Review blockers first

A blocker failure ends the release decision. Do not spend time polishing optional evidence while a release blocker remains open.

### Step 5. Record gate result

Use the checklist summary format:

```text
SECURITY       PASS
IDENTITY       PASS
SCANNERS       PASS
RELIABILITY    PASS
DATA           PASS
DELIVERY       PASS
OBSERVABILITY  PASS
ABUSE          PASS
INCIDENTS      PASS
RECOVERY       PASS

PRODUCTION READINESS: PASS
```

### Step 6. Deploy and observe

After production deployment, verify health and defined smoke checks. A successful pre-release gate does not remove the need for post-deploy monitoring.

### Step 7. Post-release review

If the release causes an incident or unexpected rollback, record the failure mode and update the gate criterion or runbook when the existing checklist did not detect it.

## 10. Deployment realms

Production readiness is evaluated per deployment realm.

A future `GLOBAL` deployment cannot inherit a `PASS` result from the `RU` deployment merely because both use the same product/security core.

Shared code can reuse automated evidence, but realm-specific infrastructure, data handling, providers, secrets, networking, recovery and operations require their own evidence.

## 11. Guest Scan release rule

Before any Guest exposure, Gate B1 must be PASS; before production, Gate C must pass all applicable criteria. The following priority domains are not an alternative or reduced launch gate:

- Security Boundaries;
- Scanner Isolation;
- Jobs & Reliability;
- Observability;
- Abuse Protection;
- Recovery & Resilience.

Particular attention is required for target canonicalization, DNS/redirect revalidation, public-IP enforcement, rate limiting, worker egress, queue pressure and abuse telemetry.

Creator/referral/Telegram entry points inherit the same boundaries. Direct bot execution requires its own reviewed authenticated Guest-session binding; chat/user IDs cannot replace the cookie-based ADR-0011 ownership model. Progressive disclosure follows PRODUCT_SIMPLICITY_UX within authorized data access, preserves coverage/uncertainty and needs runtime WCAG evidence. The 10s/30s target is a usability goal, not an SLA or Gate shortcut.

## 12. Non-goals

This gate does not require premature adoption of:

- Kubernetes;
- service mesh;
- gRPC;
- sharding;
- distributed transactions;
- multi-region active-active;
- chaos engineering.

They become requirements only when a documented production property cannot be met reliably without them or when scale/availability objectives explicitly require them.

## 13. Ownership

No single role should self-certify every domain for a high-risk release.

At minimum:

- engineering owns implementation evidence;
- security owns trust-boundary and negative-test review;
- operations owns deployment, observability, rollback and recovery evidence;
- product/release owner makes the final release decision after blockers are resolved.

For a small team, one person may hold several roles, but the evidence and criteria remain separate.

## 14. Repository integration

This document should be linked from the canonical architecture/testing/operations documentation rather than duplicated.

Recommended related updates:

- `TESTING.md` - classify production-readiness security negative tests;
- `OPERATIONS.md` - restore, rollback, alerts and runbooks;
- `SECURITY_MODEL.md` - reference blocking trust-boundary criteria;
- `SCANNING_POLICY.md` - reference scan-authorization and target-validation blockers;
- `plan.md` - reference this evidence profile within existing Gate C before production;
- `CHANGELOG.md` - record documentation integration.

Do not create a new ADR solely because this checklist exists unless the repository's actual ADR policy or current architecture review determines that a new architectural decision is required.
