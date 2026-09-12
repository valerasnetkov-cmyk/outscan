# OUTSCAN Gate C Production Evidence Checklist

Use together with `PRODUCTION_READINESS.md`.

This checklist evaluates existing Gate C, not a parallel gate. B1 is mandatory before any Guest exposure and B2 before Workspace; all applicable Gate C requirements still apply. Existing PR-* IDs are retained for evidence continuity. No criterion or gate is marked passed by documentation sync.

## 1. Release header

```yaml
release: <version-or-name>
commit: <git-sha>
realm: RU | GLOBAL
reviewed_at: <ISO-8601>
reviewers:
  engineering: <name-or-id>
  security: <name-or-id>
  operations: <name-or-id>
overall: PASS | FAIL
```

For each criterion record:

```yaml
status: PASS | WARN | FAIL | N/A
evidence: <link/path/run-id>
owner: <name-or-id>
note: <required for WARN/FAIL/N/A>
```

`BLOCKER` means `FAIL` or missing evidence forces overall `FAIL`.

## 2. Security Boundaries

| ID         | Level    | Criterion                                                                                                 | Minimum evidence             |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------- | ---------------------------- |
| PR-SEC-001 | BLOCKER  | Authentication does not imply scan authorization.                                                         | Authorization/negative tests |
| PR-SEC-002 | BLOCKER  | Public capability visibility or tariff entitlement cannot expand scanner scope.                           | Policy tests / code review   |
| PR-SEC-003 | BLOCKER  | Ownership verification and verified scope are enforced server-side for protected scan modes.              | Verification + bypass tests  |
| PR-SEC-004 | BLOCKER  | Guest mode cannot invoke verified, deep or intrusive operations.                                          | Negative tests               |
| PR-SEC-005 | BLOCKER  | Target canonicalization rejects malformed/ambiguous targets safely.                                       | Validator tests              |
| PR-SEC-006 | BLOCKER  | Private, loopback, link-local, reserved and metadata destinations are blocked.                            | SSRF test suite              |
| PR-SEC-007 | BLOCKER  | Destination is revalidated after redirects and relevant DNS resolution changes.                           | Redirect/DNS rebinding tests |
| PR-SEC-008 | BLOCKER  | Critical security headers, CORS/CSRF and injection controls applicable to the deployed UI/API pass tests. | Security test evidence       |
| PR-SEC-009 | REQUIRED | Security-sensitive administrative actions are auditable.                                                  | Audit event tests            |

Domain status: `PASS | WARN | FAIL`

## 3. Identity & Access

| ID         | Level    | Criterion                                                                            | Minimum evidence            |
| ---------- | -------- | ------------------------------------------------------------------------------------ | --------------------------- |
| PR-IAM-001 | BLOCKER  | Tenant isolation prevents cross-organization read access.                            | Cross-tenant negative tests |
| PR-IAM-002 | BLOCKER  | Tenant isolation prevents cross-organization mutation or job triggering.             | Cross-tenant negative tests |
| PR-IAM-003 | BLOCKER  | Server-side RBAC protects privileged platform operations.                            | Authorization tests         |
| PR-IAM-004 | BLOCKER  | Production secrets are not committed or exposed to unauthorized components.          | Secret scan + config review |
| PR-IAM-005 | REQUIRED | Privileged/admin access is logged with actor and action.                             | Audit log test              |
| PR-IAM-006 | REQUIRED | Session/token expiration and revocation behavior is tested where applicable.         | Auth tests                  |
| PR-IAM-007 | REQUIRED | Break-glass or elevated support access, if enabled, requires reason and audit trail. | Negative/positive tests     |

Domain status: `PASS | WARN | FAIL`

## 4. Scanner Isolation

| ID         | Level    | Criterion                                                                                                                                               | Minimum evidence                 |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| PR-SCN-001 | BLOCKER  | Disposable scanner has no DB/Redis/result-ingress/admin credentials; scoped persistence/queue/result credentials belong only to the trusted supervisor. | Runtime/config evidence          |
| PR-SCN-002 | BLOCKER  | Workers cannot reach protected internal/private networks.                                                                                               | Network isolation test           |
| PR-SCN-003 | BLOCKER  | Workers cannot reach cloud metadata endpoints.                                                                                                          | Egress test                      |
| PR-SCN-004 | BLOCKER  | Supervisor secrets are scoped and never passed to scanner; no Docker socket, privileged mode or host network reaches scanner.                           | Secret/config and runtime review |
| PR-SCN-005 | REQUIRED | CPU, RAM, runtime and concurrency limits exist for scanner workloads.                                                                                   | Runtime config/test              |
| PR-SCN-006 | REQUIRED | Scanner/tool/template versions used by production are identifiable and controlled.                                                                      | Build manifest / inventory       |
| PR-SCN-007 | BLOCKER  | Untrusted or unsigned executable scanner logic cannot silently become production-active.                                                                | Supply-chain policy test         |
| PR-SCN-008 | REQUIRED | Worker failure cannot corrupt another tenant's job/result.                                                                                              | Isolation/failure test           |
| PR-SCN-009 | BLOCKER  | Effective IPv4/IPv6 DNS/egress, read-only filesystem and CPU/RAM/PID/time/request limits are proven on the deployment target.                           | Target runtime negative tests    |
| PR-SCN-010 | BLOCKER  | Cancel/TERM-KILL/cleanup and crash/orphan reconciliation preserve job/fence identity.                                                                   | Target lifecycle/failure tests   |

Domain status: `PASS | WARN | FAIL`

## 5. Jobs & Reliability

| ID         | Level    | Criterion                                                                                                          | Minimum evidence                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| PR-JOB-001 | BLOCKER  | Scan execution is asynchronous where request duration would otherwise couple HTTP availability to scanner runtime. | Architecture/integration test        |
| PR-JOB-002 | BLOCKER  | Critical jobs have explicit lifecycle states and terminal failure state.                                           | Integration tests                    |
| PR-JOB-003 | BLOCKER  | Duplicate user/API actions do not unintentionally create duplicate expensive scans.                                | Idempotency/concurrency tests        |
| PR-JOB-004 | REQUIRED | Timeouts exist for external calls and scanner execution.                                                           | Timeout tests/config                 |
| PR-JOB-005 | REQUIRED | Retries are bounded and use an appropriate backoff policy.                                                         | Retry tests/config                   |
| PR-JOB-006 | BLOCKER  | Exhausted/failed critical jobs remain visible and actionable; they cannot disappear silently.                      | DLQ/equivalent test                  |
| PR-JOB-007 | REQUIRED | Queue/concurrency limits prevent scanner overload and uncontrolled fan-out.                                        | Load/backpressure test               |
| PR-JOB-008 | REQUIRED | Reprocessing a failed job does not violate tenant or scan authorization.                                           | Replay negative test                 |
| PR-JOB-009 | BLOCKER  | CAS lease, monotonic fence, deadline and terminal same-digest no-write replay obey ADR-0011.                       | Concurrency/stale-fence/expiry tests |

Domain status: `PASS | WARN | FAIL`

## 6. Data & Recovery

| ID         | Level    | Criterion                                                                                   | Minimum evidence         |
| ---------- | -------- | ------------------------------------------------------------------------------------------- | ------------------------ |
| PR-DAT-001 | BLOCKER  | Production schema changes are versioned migrations.                                         | Migration inventory      |
| PR-DAT-002 | BLOCKER  | Release migrations have been tested against a production-representative schema/data volume. | CI/staging evidence      |
| PR-DAT-003 | REQUIRED | Critical query paths have suitable indexes or measured acceptable performance.              | Query plan/load evidence |
| PR-DAT-004 | REQUIRED | Database connections have bounded pools/timeouts.                                           | Config/test              |
| PR-DAT-005 | BLOCKER  | Backups exist for required production data.                                                 | Backup job evidence      |
| PR-DAT-006 | BLOCKER  | Restore from backup has been successfully tested within operations policy.                  | Restore exercise record  |
| PR-DAT-007 | REQUIRED | Retention/deletion rules are defined for sensitive operational data.                        | Policy/config            |
| PR-DAT-008 | REQUIRED | Failure during result persistence cannot create misleading "scan succeeded" state.          | Transaction/failure test |

Domain status: `PASS | WARN | FAIL`

## 7. Delivery

| ID         | Level    | Criterion                                                                                                                                         | Minimum evidence          |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| PR-DEL-001 | BLOCKER  | Release candidate passes required CI tests.                                                                                                       | CI run                    |
| PR-DEL-002 | BLOCKER  | Required security checks/negative tests pass on the release candidate.                                                                            | CI/security run           |
| PR-DEL-003 | REQUIRED | Build is reproducibly tied to a commit/version.                                                                                                   | Build metadata            |
| PR-DEL-004 | BLOCKER  | Deployment includes post-deploy health/smoke verification.                                                                                        | Deploy runbook/pipeline   |
| PR-DEL-005 | BLOCKER  | Harmful release can be rolled back, disabled or otherwise recovered within documented procedure.                                                  | Rollback exercise/runbook |
| PR-DEL-006 | REQUIRED | Dependency changes are reviewed/scanned according to project policy.                                                                              | Dependency scan           |
| PR-DEL-007 | REQUIRED | Feature/capability rollout cannot bypass Scan Policy.                                                                                             | Rollout/policy tests      |
| PR-DEL-008 | REQUIRED | A protected production release path or documented equivalent approval control binds exact commit, lockfile, images, migrations and configuration. | Release-control evidence  |

Domain status: `PASS | WARN | FAIL`

## 8. Observability

| ID         | Level    | Criterion                                                                                       | Minimum evidence       |
| ---------- | -------- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| PR-OBS-001 | BLOCKER  | API/service health is externally observable.                                                    | Health check evidence  |
| PR-OBS-002 | BLOCKER  | Scanner worker health is observable.                                                            | Dashboard/metric/test  |
| PR-OBS-003 | BLOCKER  | Queue depth/stalled work is observable and alertable.                                           | Metric + alert test    |
| PR-OBS-004 | REQUIRED | Scan duration and failure rate are measured.                                                    | Metrics evidence       |
| PR-OBS-005 | REQUIRED | Finding normalization/processing failures are visible.                                          | Logs/metrics           |
| PR-OBS-006 | REQUIRED | Threat Intelligence freshness is monitored when production decisions depend on it.              | Freshness metric/alert |
| PR-OBS-007 | REQUIRED | Critical notification delivery failures are observable where notification channels are enabled. | Delivery metric/test   |
| PR-OBS-008 | BLOCKER  | At least one real alert path to an operator has been tested.                                    | Alert delivery test    |
| PR-OBS-009 | REQUIRED | Logs include correlation identifiers sufficient to trace a scan/job without exposing secrets.   | Log sample/test        |

Domain status: `PASS | WARN | FAIL`

## 9. Abuse Protection

| ID         | Level    | Criterion                                                                                                                            | Minimum evidence        |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| PR-ABU-001 | BLOCKER  | Public/Guest endpoints have server-side rate limits.                                                                                 | Rate-limit tests        |
| PR-ABU-002 | BLOCKER  | Per-tenant/user scan quotas or equivalent resource controls prevent unbounded workload.                                              | Quota tests/config      |
| PR-ABU-003 | BLOCKER  | Target validation occurs before expensive scanner work is queued.                                                                    | Integration test        |
| PR-ABU-004 | REQUIRED | Repeated invalid/blocked targets are visible to abuse monitoring.                                                                    | Event/log test          |
| PR-ABU-005 | REQUIRED | Platform can block abusive targets/accounts without code redeploy when operationally required.                                       | Runbook/config evidence |
| PR-ABU-006 | REQUIRED | Promo/Creator/referral grants are entitlement-only: no verification bypass, VerifiedScope, ScanAuthorization or implicit monitoring. | Grant negative tests    |
| PR-ABU-007 | BLOCKER  | No public or client role can enable intrusive/destructive scanning without the separately required authorization.                    | Negative tests          |

Domain status: `PASS | WARN | FAIL`

## 10. Incident Response

| ID         | Level    | Criterion                                                                      | Minimum evidence     |
| ---------- | -------- | ------------------------------------------------------------------------------ | -------------------- |
| PR-INC-001 | BLOCKER  | Production incident owner/escalation path is documented.                       | Runbook              |
| PR-INC-002 | REQUIRED | Scanner compromise/abuse has a containment procedure.                          | Runbook/tabletop     |
| PR-INC-003 | REQUIRED | Credential/token compromise has a rotation/revocation procedure.               | Runbook              |
| PR-INC-004 | REQUIRED | Failed Threat Intelligence synchronization has an operator response procedure. | Runbook              |
| PR-INC-005 | REQUIRED | Critical platform security events are retained in audit evidence.              | Audit test           |
| PR-INC-006 | REQUIRED | Significant production incidents require a postmortem and follow-up actions.   | Process doc/template |

Domain status: `PASS | WARN | FAIL`

## 11. Recovery & Resilience

| ID         | Level    | Criterion                                                                                       | Minimum evidence         |
| ---------- | -------- | ----------------------------------------------------------------------------------------------- | ------------------------ |
| PR-RES-001 | BLOCKER  | Service can recover from loss/restart of a scanner worker without losing critical job state.    | Failure test             |
| PR-RES-002 | REQUIRED | Temporary scanner/tool failure degrades gracefully and produces an explicit state.              | Failure test             |
| PR-RES-003 | REQUIRED | Temporary external provider failure has timeout/retry/fallback or explicit degradation policy.  | Failure test/runbook     |
| PR-RES-004 | REQUIRED | Queue backlog behavior under peak scheduled scanning has been tested at a representative level. | Load test                |
| PR-RES-005 | BLOCKER  | Database restore procedure is executable by the operating team.                                 | Restore exercise         |
| PR-RES-006 | BLOCKER  | Emergency rollback/disable procedure is executable by the operating team.                       | Exercise/runbook         |
| PR-RES-007 | REQUIRED | Recovery does not silently change security policy, verification state or tenant ownership.      | Recovery integrity tests |

Domain status: `PASS | WARN | FAIL`

## 12. Guest Scan launch subset

Gate B1 must pass before any Guest exposure. These priority criteria cannot be WARN/N/A for Guest and do not waive the rest of B1 or applicable Gate C:

- PR-SEC-004
- PR-SEC-005
- PR-SEC-006
- PR-SEC-007
- PR-SCN-002
- PR-SCN-001
- PR-SCN-004
- PR-SCN-009
- PR-SCN-010
- PR-SCN-003
- PR-JOB-003
- PR-JOB-006
- PR-JOB-007
- PR-OBS-001
- PR-OBS-002
- PR-OBS-003
- PR-OBS-008
- PR-ABU-001
- PR-ABU-003
- PR-ABU-007
- PR-RES-001
- PR-RES-006

## 13. Final summary

```text
SECURITY       PASS | WARN | FAIL
IDENTITY       PASS | WARN | FAIL
SCANNERS       PASS | WARN | FAIL
RELIABILITY    PASS | WARN | FAIL
DATA           PASS | WARN | FAIL
DELIVERY       PASS | WARN | FAIL
OBSERVABILITY  PASS | WARN | FAIL
ABUSE          PASS | WARN | FAIL
INCIDENTS      PASS | WARN | FAIL
RECOVERY       PASS | WARN | FAIL

BLOCKERS FAILED: <0..N>
WARNINGS: <0..N>

GATE C EVIDENCE PROFILE: PASS | FAIL
```

## 14. Warning register

For every `WARN` add an entry:

| Criterion | Owner | Impact | Temporary mitigation | Due date | Tracking issue |
| --------- | ----- | ------ | -------------------- | -------- | -------------- |
| `<ID>`    |       |        |                      |          |                |

## 15. Sign-off

```text
Engineering:  <approved / rejected>
Security:     <approved / rejected>
Operations:   <approved / rejected>
Release owner:<approved / rejected>
```

A release cannot be approved while any `BLOCKER` criterion remains `FAIL` or lacks required evidence.

## 16. Public, UX and administration evidence

| ID         | Level    | Criterion                                                                                                                                       | Minimum evidence                                |
| ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| PR-PUB-001 | BLOCKER  | No unresolved Critical/High, missing applicable B1/B2 or skipped/failed required candidate CI stage.                                            | Exact-candidate evidence                        |
| PR-PUB-002 | BLOCKER  | Claims, privacy/terms/disclosure and runtime WCAG 2.2 AA match the exposed release scope.                                                       | Product/Security/Legal and accessibility review |
| PR-PUB-003 | REQUIRED | State/action precede taxonomy; authorized evidence remains reachable under PRODUCT_SIMPLICITY_UX.                                               | 10s/30s/deep-dive usability review              |
| PR-PUB-004 | BLOCKER  | Simplified UI preserves material coverage/uncertainty and never exposes hidden Guest data.                                                      | Projection/claim/UX negatives                   |
| PR-IAM-008 | BLOCKER  | Exposed Admin has MFA/step-up and separately scoped SupportAccessGrant with audit.                                                              | Privileged-auth negative tests                  |
| PR-DAT-009 | BLOCKER  | Applicable delete/export/residency and separate metadata/artifact retention are implemented.                                                    | Data lifecycle evidence                         |
| PR-ABU-008 | BLOCKER  | Any Telegram Guest entry has a reviewed ADR-0011 session binding; chat/user/referral IDs never replace Guest-cookie ownership or token privacy. | Channel/auth/abuse/idempotency negatives        |
