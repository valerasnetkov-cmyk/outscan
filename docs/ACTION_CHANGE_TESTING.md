# Action Center and Change Intelligence testing

**Status:** Planned blocking suites for deferred implementation

**Parent contract:** [Action Center and Change Intelligence](ACTION_CHANGE.md)

## Action Center tenant and workflow tests

- Anonymous/cross-tenant list, guessed IDs and wrong-tenant child references fail under API and RLS tests.
- Assignee must be an active same-organization member; membership removal cannot leave a silently valid assignment.
- Exact schemas reject organization/finding/asset reassignment, verified/close state, scan reference, arbitrary status and unbounded dates/text.
- One active action per Finding is enforced under concurrent create; transition replay is idempotent and invalid/regressive transitions fail.
- `REPORTED_COMPLETE` leaves Finding condition, coverage, Risk and scores unchanged.
- Compatible accepted resolution may close with server-owned reason; failed/partial/unknown/incompatible coverage cannot.
- Finding reopen creates/reopens action without deleting historical transitions/audit.
- Existing ACKNOWLEDGED/ACCEPTED_RISK/FALSE_POSITIVE remains separate from remediation workflow.

## Recheck authorization tests

- Request accepts action plus idempotency only; client target, URL/IP, profile, capability/template, scanner arguments and desired result fields are rejected.
- Server derives the exact Asset target and recomputes active membership/RBAC, EXACT_HOST VerifiedScope, entitlement, ScanAuthorization and ADR-0012 policy immediately before enqueue/execution.
- Stale/revoked verification, unknown capability, ACTIVE/NETWORK/HEADLESS_BROWSER or budget denial creates no job.
- Concurrent/replayed requests follow ADR-0011 and cannot create unintended duplicate jobs.
- Result processing uses the canonical scanner/coverage/Finding pipeline; Action code cannot directly commit resolution.

## Change Intelligence correctness

- Compatible snapshot pairs yield deterministic typed diff, stable order/hash and exactly one idempotent MonitoringEvent.
- Same values yield no event; failed/partial/unknown or incompatible coverage cannot imply removal, improvement or resolution.
- Asset disappearance requires reviewed source/coverage semantics, not one missing observation.
- Finding timeline uses canonical FindingEvent transitions without duplicate OPENED/REOPENED/RESOLVED events.
- Score change requires comparable monitored set, baseline coverage and model versions.
- Significance changes ordering/notification eligibility only and does not overwrite severity or Risk.
- Before/after display values are bounded/escaped and contain no raw scanner evidence, credentials or internal identifiers.

## Asset triage tests

- Only closed ownership declaration/environment values, active same-tenant responsible member and bounded controlled tags are accepted.
- DECLARED_OWNED, environment, criticality, assignment and tags cannot create verification, scope, scan authorization, entitlement or monitoring enrollment.
- Cross-tenant assignment/provenance access fails; mutations are auditable.
- Discovery/creation remains non-billable until explicit MonitoringEnrollment.

## Monitoring rules and delivery

- Only closed rule codes and allowed threshold/channel values are accepted; expressions/scripts/queries/scanner configuration fail.
- Rule evaluation requires applicable organization MonitoringEnrollment and exact tenant event data.
- Recipients/endpoints are resolved by ADR-0015; arbitrary email/chat/Ops destination is rejected.
- Replayed event evaluation/outbox delivery remains idempotent; disabling a rule does not suppress mandatory account/security delivery.
- Weekly Digest continues to use its canonical suite and at most three selected actions.

## Emerging Threat and lifecycle tests

- TI match alone creates no ScanAuthorization, Finding or CONFIRMED result.
- Low/ambiguous version confidence and stale/conflicting TI/lifecycle sources produce qualified UNKNOWN/unverified states.
- `EVALUATED_NO_CONFIRMATION` requires compatible coverage and never renders as `not vulnerable`.
- Targeted execution derives verified Asset target and passes current authz, policy, approval and budget gates; unknown/disallowed behavior launches nothing.
- Accepted compatible detection may create canonical Finding/Occurrence; replay cannot duplicate it.
- EOL observation remains separate from CVE Finding, keeps source/freshness and cannot claim safety from SUPPORTED.

## Preview future gate

No preview code belongs to V1/V1.5. A later ADR/test suite must cover current verified exact-host authorization, full A/AAAA and redirect/subresource revalidation, pinning/egress mediation, private/loopback/link-local/metadata denial, credential-free isolation, no DB/Redis access, browser/request/time/byte limits, inert image storage, retention and abuse/cost controls.

## API, UI and operations

- Organization routes enforce exact tenant lookup/RLS, role policy, CSRF, pagination/filter bounds and stable safe errors.
- Action/Changes/Assets hierarchy is keyboard accessible, reflows at 200%/400%, exposes coverage uncertainty and never relies on color alone.
- UI never labels reported remediation as verified or declared ownership as verified scope.
- Metrics/logs use bounded codes and omit tenant content, evidence, recipients and secrets.
- Public/Guest surfaces expose none of the deferred tenant actions, changes, evaluations or previews.

## Release evidence

For each implemented slice run its unit/integration/RLS/security/UI suites plus scanner-authorization regressions where execution is involved, then lint, typecheck, builds, source-line, Markdown/link/secret and `git diff --check`. PASS is slice-specific and does not advance Gate B1/B2/C automatically.
