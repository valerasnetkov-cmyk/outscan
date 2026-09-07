# Promotions and Access Grants testing

**Status:** Required future blocking suite  
**Parent:** [Promotions and Access Grants](PROMOTIONS_ACCESS_GRANTS.md)

Documentation is not implementation evidence. No test below is currently claimed as runtime PASS.

## Registry and lifecycle

- Reject unknown promotion/grant types, states, preset versions, eligibility/stacking values and fields.
- Permit only valid state transitions; ACTIVE target/preset/terms snapshots are immutable.
- Evaluate start/expiry/revoke at authorization time without depending on scheduler state.
- Disabling a promotion prevents new redemption but preserves existing grants until explicit revoke/expiry.
- Expiry/revoke removes future grant entitlement without deleting Subscription, scans, Findings or reports.

## Verification and scanner isolation

- Standard, campaign and direct-admin grants cannot create/update `DomainVerification` or `VerifiedScope`.
- `ADMIN_ATTESTED`, `skip_verification`, target, scan mode, profile, template, consent and scanner capability input are rejected.
- An unverified exact host remains denied for verified scanning despite the highest promo entitlement.
- A verified host still recomputes current ADR-0009 `ScanAuthorization` at dispatch.
- Expired/stale/revoked scope, missing consent or ADR-0012 DENY wins over entitlement.
- Guest policy/output and `HEADLESS_BROWSER`/ACTIVE/IP/CIDR/raw-TCP denials remain unchanged.

## Tenant and platform authorization

- Anonymous and non-member redemption fail without revealing code validity.
- Tenant A cannot redeem, list or infer Tenant B grants; guessed UUIDs and body organization IDs do not bypass route-derived scope.
- Viewer/customer roles cannot create/revoke grants unless explicitly allowed by canonical RBAC.
- Support cannot manage commercial grants by default.
- Platform operations require separate platform permission, step-up where required and PlatformAuditLog.
- Removed/suspended membership loses access immediately; service principals do not use customer membership shortcuts.

## Secret handling and abuse

- Code generation has required entropy and secure randomness; plaintext is never persisted or logged.
- Lookup digest is versioned/keyed and constant-time where comparison applies; unavailable/revoked key fails closed.
- Responses, errors, traces, analytics, tenant/platform audit and notifications contain no full code or lookup digest.
- Invalid-code attempts use bounded uniform responses and rate limits without allowing account/code enumeration.
- Campaign attribution is allowlisted and cannot inject log/HTML/CSV/formula content or imply marketing consent.

## Transactionality and idempotency

- Concurrent use of the final activation produces exactly one valid winner and never exceeds capacity.
- Same organization/promotion cannot receive duplicate benefit from parallel users or request retry.
- Same idempotency key and same canonical request returns the original result without extending grant expiry.
- Same key with different request conflicts; another tenant cannot replay the winner.
- Transaction failure writes no partial redemption, grant, activation count or audit event.
- Direct grant/revoke races converge to one valid auditable state.

## Effective entitlements

- Paid-only, grant-only, paid+grant, multiple independent scopes and expiry fallback use deterministic closed composition.
- Numeric limits are not accidentally summed; a temporary grant cannot reduce paid rights.
- Unknown fields/preset versions and malformed snapshots deny contribution rather than widening access.
- Client payload cannot set effective limits, plan labels, internal capability IDs or usage counters.
- Grant capacity does not create Assets, MonitoringEnrollment, scans, notification endpoints or billing state.

## API and projection

- Route schemas reject unknown/query/body fields and require auth/session/CSRF/idempotency as applicable.
- Organization identity is route/auth derived; redemption does not accept target or verification/scanner fields.
- Tenant list exposes only safe label/status/start/expiry/limits/usage; no code, internal reason, actor privilege or other-tenant data.
- Platform projection redacts secret material and enforces pagination/filter bounds.
- Safe stable errors do not expose eligibility, capacity, membership or code-existence distinctions to unauthorized callers.
- Promo routes remain absent until B2/data/security prerequisites and rollout approval are complete.

## UI, accessibility and claims

- Trial/promo is visually and textually distinct from paid Subscription and shows an exact expiry.
- Status and remaining limits do not rely on color; keyboard/focus/error/live-region behavior and 320px reflow meet WCAG 2.2 AA target.
- Expiry/upgrade copy is calm and accurate; no dark patterns, fake urgency or unavailable-plan claims.
- No `DNS verified`, monitoring-active or scan-availability wording appears from grant state alone.
- Public/Workspace surfaces stay hidden until Claim Inventory, Product and Legal approval.

## Notifications, analytics and operations

- Notification events reuse ADR-0015 typed outbox/current-recipient policy; delivery failure cannot prolong entitlement.
- Mandatory service notice is independent from marketing consent; campaign attribution cannot subscribe a user.
- Analytics contains bounded campaign/grant IDs and coarse lifecycle events, not codes or tenant security content.
- Metrics cover redemption decisions, capacity conflicts, expiry/revoke and authorization denials without high-cardinality secrets.
- Retention/export/delete and backup/restore behavior follow accepted data/legal policy.

## Release blockers

The feature remains disabled if any test above fails, if the entity matrix/retention is unaccepted, or if transactional persistence, auth/RLS/audit, secret management, entitlement composition, legal terms or claim evidence is missing.

Any implementation of administrative verification bypass remains blocked until a separate accepted ADR and dedicated proof-of-control security suite exist.
