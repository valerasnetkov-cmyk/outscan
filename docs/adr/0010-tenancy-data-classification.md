# ADR 0010: Explicit ownership and sensitivity for every persistent entity

**Status:** Accepted
**Accepted:** 2026-09-03
**Date:** 2026-09-03
**Owner:** Architecture / Data

**Amendment:** ADR-0015 supersedes the former generic `Notification` row with explicit account, tenant and platform notification ownership contours.

## Ownership classes

- `GLOBAL`
- `PLATFORM`
- `TENANT_ROOT`
- `TENANT`
- `PUBLIC_GUEST`
- `CROSS_TENANT_GRANT`
- `PLATFORM_GRANT`

## Sensitivity

- `PUBLIC`
- `INTERNAL`
- `SENSITIVE`
- `RESTRICTED`

## Entity matrix

| Entity                       | Ownership          | Sensitivity | Tenant key                      |
| ---------------------------- | ------------------ | ----------- | ------------------------------- |
| User                         | GLOBAL             | SENSITIVE   | none                            |
| Organization                 | TENANT_ROOT        | SENSITIVE   | id is tenant root               |
| OrganizationMember           | TENANT             | SENSITIVE   | organization_id                 |
| Subscription                 | TENANT             | SENSITIVE   | organization_id                 |
| MonitoringEnrollment         | TENANT             | SENSITIVE   | organization_id                 |
| DomainVerification           | TENANT             | RESTRICTED  | organization_id                 |
| VerifiedScope                | TENANT             | RESTRICTED  | organization_id                 |
| Asset                        | TENANT             | SENSITIVE   | organization_id                 |
| AssetRelation                | TENANT             | SENSITIVE   | organization_id                 |
| TechnologyObservation        | TENANT             | SENSITIVE   | organization_id                 |
| ScanRequest                  | TENANT             | SENSITIVE   | organization_id                 |
| ScanJob                      | TENANT             | SENSITIVE   | organization_id                 |
| ScanAttempt                  | TENANT             | SENSITIVE   | organization_id                 |
| Finding                      | TENANT             | RESTRICTED  | organization_id                 |
| FindingOccurrence            | TENANT             | RESTRICTED  | organization_id                 |
| FindingEvent                 | TENANT             | RESTRICTED  | organization_id                 |
| FindingDisposition           | TENANT             | RESTRICTED  | organization_id                 |
| FindingCoverage              | TENANT             | RESTRICTED  | organization_id                 |
| FindingEvidence              | TENANT             | RESTRICTED  | organization_id                 |
| AssetRiskScore               | TENANT             | SENSITIVE   | organization_id                 |
| OrganizationSecurityScore    | TENANT             | SENSITIVE   | organization_id                 |
| AssetPostureSnapshot         | TENANT             | RESTRICTED  | organization_id                 |
| MonitoringEvent              | TENANT             | SENSITIVE   | organization_id                 |
| UserNotificationEndpoint     | GLOBAL             | SENSITIVE   | none                            |
| AccountNotificationEvent     | GLOBAL             | SENSITIVE   | none                            |
| AccountNotificationDelivery  | GLOBAL             | SENSITIVE   | none                            |
| TenantNotificationEvent      | TENANT             | SENSITIVE   | organization_id                 |
| TenantNotificationDelivery   | TENANT             | SENSITIVE   | organization_id                 |
| TenantNotificationPreference | TENANT             | SENSITIVE   | organization_id                 |
| TelegramBinding              | GLOBAL             | SENSITIVE   | none                            |
| PlatformNotificationEvent    | PLATFORM           | INTERNAL    | none                            |
| PlatformNotificationDelivery | PLATFORM           | INTERNAL    | none                            |
| PlatformNotificationEndpoint | PLATFORM           | RESTRICTED  | none                            |
| MarketingConsent             | GLOBAL             | SENSITIVE   | none                            |
| NotificationSuppression      | GLOBAL             | SENSITIVE   | none                            |
| Report                       | TENANT             | RESTRICTED  | organization_id                 |
| TenantAuditLog               | TENANT             | RESTRICTED  | organization_id                 |
| GuestScan                    | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestScanAttempt             | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestObservation             | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestResult                  | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| CVERecord                    | GLOBAL             | PUBLIC      | none                            |
| ThreatIntelObservation       | GLOBAL             | PUBLIC      | none                            |
| ScannerPolicyBundle          | PLATFORM           | INTERNAL    | none                            |
| ScannerTemplateApproval      | PLATFORM           | INTERNAL    | none                            |
| PlatformAuditLog             | PLATFORM           | RESTRICTED  | none                            |
| PartnerDelegation            | CROSS_TENANT_GRANT | RESTRICTED  | partner + client ids            |
| SupportAccessGrant           | PLATFORM_GRANT     | RESTRICTED  | client org + platform principal |

Any new persistent entity must enter this matrix before schema migration.

## TENANT_ROOT — Organization access

Organization is a tenant root and therefore cannot carry a self-referential `organization_id`.

Access is nevertheless tenant-scoped.

### List organizations

A normal customer principal may list only Organizations for which an active `OrganizationMember` exists.

Conceptual predicate:

```text
EXISTS OrganizationMember
WHERE user_id = current_user
  AND organization_id = Organization.id
  AND membership_status = ACTIVE
```

Platform principals use separate platform authorization and never the customer membership shortcut.

### Get organization

Customer access to `/v1/organizations/:organizationId` requires active membership in that exact Organization.

### Create organization

Authenticated customer may create an Organization according to product/account policy.
Creation atomically creates the initial OWNER membership.

### Update/delete organization

Requires an allowed Organization role/action policy, typically OWNER/Admin according to final RBAC.
The role is resolved server-side from membership, never from client claims.

### RLS for Organization

Organization table uses RLS or an equivalent database-enforced policy so a customer DB session can SELECT only tenant roots reachable by active membership.

Recommended conceptual policy:

```text
USING (
  EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = organizations.id
      AND m.user_id = app_current_user_id()
      AND m.status = 'ACTIVE'
  )
)
```

Platform maintenance sessions use a separate privileged DB role/policy.

### Cross-tenant tests for Organization

- user with membership in A cannot GET B;
- list returns only active memberships;
- guessed Organization UUID does not bypass;
- removed/suspended membership immediately loses access;
- customer cannot mutate Organization without required role;
- platform/support access requires platform policy/SupportAccessGrant when client detail access is involved.

## TENANT

Every TENANT row carries organization_id.
Tenant references use `(organization_id, object_id) → Parent(organization_id, id)` where applicable.

Required:

- server-side authz;
- tenant-scoped lookup;
- composite tenant FK;
- PostgreSQL RLS.

## PUBLIC_GUEST

Separate Guest tables/retention. Do not represent Guest as nullable-tenant customer data.

## CROSS_TENANT_GRANT

PartnerDelegation binds partner and client Organization IDs, bounded permissions, status, expiry/revocation and audit.

## PLATFORM_GRANT

SupportAccessGrant binds platform/support principal to one client Organization with reason, scope, approval, expiry/revocation and audit.

## Audit split

Use TenantAuditLog and PlatformAuditLog. Do not keep ambiguous generic AuditLog in V1.

## Required tests

- Organization TENANT_ROOT list/get/mutate isolation;
- wrong-tenant child FK rejected;
- child-row RLS default deny;
- partner A→client X cannot access Y;
- revoked grant blocks immediately;
- support principal requires active PLATFORM_GRANT.
