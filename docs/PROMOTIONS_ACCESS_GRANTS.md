# Promotions and Access Grants

**Status:** Proposed post-B2 commercial capability  
**Priority:** after Gate B1 and Workspace/Organization/Subscription foundations  
**Runtime status:** no entity, migration, route, entitlement change, UI or promotion is active

## Decision boundary

Promotions provide temporary commercial entitlements. They do not create ownership, verification, consent, monitoring enrollment or scan authorization.

```text
Paid Subscription + active time-bounded Access Grants
  → server-calculated Effective Entitlements
  ≠ DomainVerification
  ≠ VerifiedScope
  ≠ ScanAuthorization
  ≠ MonitoringEnrollment
```

Every execution still requires the intersection defined by ADR-0009:

`current EXACT_HOST VerifiedScope ∩ profile policy ∩ effective entitlement ∩ consent ∩ current verification/asset state`.

The module does not affect Gate A/B1 and is not Gate B2/C evidence. Guest behavior and scanner capability policy remain unchanged.

## Accepted planning scope

The first future slice may support:

- `TRIAL`: temporary access to a versioned named entitlement preset;
- `CAMPAIGN_TRIAL`: the same grant semantics plus bounded campaign attribution;
- `DIRECT_ADMIN`: a privileged platform-issued commercial entitlement using the same grant engine, without a redeemable code.

It is not a discount/payment engine. Percentage/fixed discounts, affiliate settlement, referral payouts, arbitrary stacking, feature expressions and automatic paid conversion remain outside the first slice.

## Verification exception is not accepted

The supplied package labels `ADMIN_TRUSTED_TRIAL` and `ADMIN_ATTESTED` as approved, but they conflict with accepted ADR-0009, where persistent DNS TXT verification creates `VerifiedScope(EXACT_HOST)` and is revalidated for verified execution.

Therefore the current proposal explicitly forbids:

- setting `verification_status=VERIFIED` from a promotion or grant;
- creating `VerifiedScope` without the canonical DNS challenge lifecycle;
- a `skip_verification`, `ADMIN_ATTESTED` or equivalent client/server shortcut;
- accepting `allowed_scan_modes`, scanner profiles/templates or consent through promo input;
- treating Platform Admin, Support or a sales decision as proof of target control.

A future owner request for an administrative proof-of-control exception requires a separate security/architecture ADR that explicitly amends ADR-0009, defines stronger authorization, expiry/revalidation, incident response and negative evidence. Until that ADR is accepted and implemented, the behavior is `DENY`.

## Proposed ownership and data

Before migration, every entity must enter ADR-0010 with final sensitivity, retention, composite tenant keys and RLS:

- `Promotion`: PLATFORM commercial definition;
- `PromoCode`: PLATFORM RESTRICTED redeemable-secret record;
- `PromotionRedemption`: TENANT SENSITIVE organization-keyed transaction/history;
- `AccessGrant`: TENANT SENSITIVE organization-keyed entitlement grant;
- `AccessPresetVersion`: GLOBAL or PLATFORM immutable allowlisted entitlement schema, decided before migration.

`AccessGrant` freezes the exact preset/version and bounded entitlement snapshot active at redemption. It never stores arbitrary scanner flags or open-ended JSON. Unknown fields/capabilities fail closed.

Promo secrets are generated with cryptographic randomness, normalized only by a documented versioned rule and stored as keyed lookup digest plus non-secret display hint. Plaintext is shown only at controlled creation where required and never logged, audited, analyzed or returned after redemption.

## Lifecycle

Promotion states:

`DRAFT → ACTIVE → EXHAUSTED | EXPIRED | DISABLED`.

Grant states:

`ACTIVE → EXPIRED | REVOKED | CONVERTED`.

Authorization always evaluates `starts_at <= now < expires_at` and revocation directly; correctness does not depend on a scheduler materializing `EXPIRED`. Disabling a promotion prevents new redemption but does not silently revoke existing grants. Revocation is explicit and audited.

Expiry/revocation removes future entitlement only. It does not delete historical scans, Findings, reports or paid Subscription state and does not cancel unrelated rights.

## Redemption and effective entitlements

Redemption requires authenticated active Organization membership plus bounded RBAC/CSRF, current promotion/code state, eligibility and atomic capacity consumption. Organization identity comes from the route and authenticated context, not an arbitrary body field.

The first slice uses one grant per organization/promotion and one active trial per defined entitlement scope. Client retry uses an idempotency key; a unique transactional winner is reread. Activation count cannot exceed the configured maximum under concurrency.

One server-owned service calculates effective entitlements. It snapshots inputs once, rejects unknown preset versions/fields and combines paid plus grant limits using a documented closed per-field rule. Numeric ceilings are not blindly added, and a grant cannot reduce paid access. Scanner policy, verification and consent denials always win after entitlement calculation.

Grant capacity never creates `MonitoringEnrollment`, adds an Asset, triggers a scan or enrolls discovered candidates. Those remain explicit authorized operations.

## Future API surface

No route exists today. After B2 prerequisites, a bounded contract may add:

- `POST /v1/organizations/:organizationId/access-grants/redeem`;
- `GET /v1/organizations/:organizationId/access-grants`;
- Platform Admin create/list/activate/disable Promotion operations;
- Platform Admin direct-grant and revoke operations with explicit permission and reason.

Redemption accepts a promo secret and header idempotency key only. It does not accept target, verification method, scanner mode, entitlement snapshot, organization ownership or result state. Responses expose safe grant/preset label, status, exact expiry and effective limits—never secret lookup data, other tenants, internal reasons or privilege metadata.

Platform operations use separate platform authz and `PlatformAuditLog`; customer reads use tenant composite lookup/RLS. Support has no grant-management permission by default.

## UI and communications

Workspace may show `Промодоступ`, exact expiry, remaining duration and usage against effective limits without calling it a paid subscription. Expiry time must not rely on color alone. Upgrade is a normal CTA, not a forced or fear-based flow.

Platform Admin UI follows backend permission checks and cannot be treated as a security control. Secret reveal is one-time and target/verification override fields are absent.

Future activation/expiry/revocation notices reuse ADR-0015 notification/outbox boundaries and current-recipient resolution. They are not required to make entitlement expiry effective. Campaign attribution does not establish marketing consent.

## Claims and legal

No public trial, plan, limit, duration, conversion or availability claim is approved by this proposal. Before activation, Product/Legal must approve terms, eligibility, expiry/revocation wording, personal-data/analytics handling and Claim Inventory entries.

## Implementation order

1. Finish Gate B1, then Organization/auth/RLS/audit and canonical Subscription/entitlement decisions.
2. Accept data classification and a versioned closed entitlement-composition contract.
3. Implement standard `TRIAL`/`CAMPAIGN_TRIAL` definitions, hashed codes, transactional redemption and AccessGrant history.
4. Add effective-entitlement calculation, dispatch-time consumption and expiry/revocation.
5. Add Platform Admin commercial operations, tenant read projection and safe UI.
6. Add notifications/analytics only through their canonical consent and event boundaries.
7. Pass [Promotions and Access Grants testing](PROMOTIONS_ACCESS_GRANTS_TESTING.md) and claim/legal review before rollout.

The administrative verification exception remains absent unless a later separate ADR is accepted.
