# Data model

## Principles

1. `Asset` is the core customer resource.
2. Every persistent entity has ownership and sensitivity classification.
3. Guest data is separate from tenant data.
4. Tenant integrity uses organization key + composite FK + RLS.
5. Observations and occurrences preserve history/provenance.
6. ScannerResultEnvelope is independent from scanner implementation.
7. Finding condition, occurrences, disposition and coverage are separate.
8. Asset relationships are first-class.
9. Evidence is minimized.

Normative classification: ADR 0010.

## Ownership

`GLOBAL | PLATFORM | TENANT_ROOT | TENANT | PUBLIC_GUEST | CROSS_TENANT_GRANT | PLATFORM_GRANT`.

Sensitivity:
`PUBLIC | INTERNAL | SENSITIVE | RESTRICTED`.

## Entity matrix

| Entity                        | Ownership          | Sensitivity | Tenant key                      |
| ----------------------------- | ------------------ | ----------- | ------------------------------- |
| User                          | GLOBAL             | SENSITIVE   | none                            |
| Organization                  | TENANT_ROOT        | SENSITIVE   | id is tenant root               |
| OrganizationMember            | TENANT             | SENSITIVE   | organization_id                 |
| Subscription                  | TENANT             | SENSITIVE   | organization_id                 |
| MonitoringEnrollment          | TENANT             | SENSITIVE   | organization_id                 |
| DomainVerification            | TENANT             | RESTRICTED  | organization_id                 |
| VerifiedScope                 | TENANT             | RESTRICTED  | organization_id                 |
| Asset                         | TENANT             | SENSITIVE   | organization_id                 |
| AssetRelation                 | TENANT             | SENSITIVE   | organization_id                 |
| TechnologyObservation         | TENANT             | SENSITIVE   | organization_id                 |
| ScanRequest                   | TENANT             | SENSITIVE   | organization_id                 |
| ScanJob                       | TENANT             | SENSITIVE   | organization_id                 |
| ScanAttempt                   | TENANT             | SENSITIVE   | organization_id                 |
| Finding                       | TENANT             | RESTRICTED  | organization_id                 |
| FindingOccurrence             | TENANT             | RESTRICTED  | organization_id                 |
| FindingEvent                  | TENANT             | RESTRICTED  | organization_id                 |
| FindingDisposition            | TENANT             | RESTRICTED  | organization_id                 |
| FindingCoverage               | TENANT             | RESTRICTED  | organization_id                 |
| FindingEvidence               | TENANT             | RESTRICTED  | organization_id                 |
| AssetRiskScore                | TENANT             | SENSITIVE   | organization_id                 |
| OrganizationSecurityScore     | TENANT             | SENSITIVE   | organization_id                 |
| AssetPostureSnapshot          | TENANT             | RESTRICTED  | organization_id                 |
| MonitoringEvent               | TENANT             | SENSITIVE   | organization_id                 |
| UserNotificationEndpoint      | GLOBAL             | SENSITIVE   | none                            |
| AccountNotificationEvent      | GLOBAL             | SENSITIVE   | none                            |
| AccountNotificationDelivery   | GLOBAL             | SENSITIVE   | none                            |
| TenantNotificationEvent       | TENANT             | SENSITIVE   | organization_id                 |
| TenantNotificationDelivery    | TENANT             | SENSITIVE   | organization_id                 |
| TenantNotificationPreference  | TENANT             | SENSITIVE   | organization_id                 |
| TelegramBinding               | GLOBAL             | SENSITIVE   | none                            |
| PlatformNotificationEvent     | PLATFORM           | INTERNAL    | none                            |
| PlatformNotificationDelivery  | PLATFORM           | INTERNAL    | none                            |
| PlatformNotificationEndpoint  | PLATFORM           | RESTRICTED  | none                            |
| MarketingConsent              | GLOBAL             | SENSITIVE   | none                            |
| NotificationSuppression       | GLOBAL             | SENSITIVE   | none                            |
| Report                        | TENANT             | RESTRICTED  | organization_id                 |
| TenantAuditLog                | TENANT             | RESTRICTED  | organization_id                 |
| GuestScan                     | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestScanAttempt              | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestAbuseCounter/Reservation | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestObservation              | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| GuestResult                   | PUBLIC_GUEST       | SENSITIVE   | forbidden                       |
| CVERecord                     | GLOBAL             | PUBLIC      | none                            |
| ThreatIntelObservation        | GLOBAL             | PUBLIC      | none                            |
| ScannerPolicyBundle           | PLATFORM           | INTERNAL    | none                            |
| ScannerTemplateApproval       | PLATFORM           | INTERNAL    | none                            |
| PlatformAuditLog              | PLATFORM           | RESTRICTED  | none                            |
| PartnerDelegation             | CROSS_TENANT_GRANT | RESTRICTED  | partner+client                  |
| SupportAccessGrant            | PLATFORM_GRANT     | RESTRICTED  | client org + platform principal |

Any new persistent entity enters this matrix before migration.

Notification ownership is refined by ADR 0015. Account/user, tenant and platform records are separate tables/contours rather than nullable `organization_id` variants. Tenant notification rows require the same composite tenant constraints and RLS as other TENANT data. Marketing consent/suppression remains independent from mandatory account and technical notification policy. No notification migration exists in the current foundation.

## Identity / tenancy

### User

Global identity.

### Organization

TENANT_ROOT.

It has no self-referential `organization_id`.
Customer list/get/mutate access is derived from active OrganizationMember records and protected by Organization-table RLS/equivalent DB policy per ADR 0010.
Platform access uses a separate privileged policy.

### OrganizationMember

TENANT: organization_id, user_id, role, status, created_at.

### Subscription

TENANT: plan/status/entitlements; no payment secrets.

### MonitoringEnrollment

TENANT: asset_id, status, enrolled_by, enrolled_at, ended_at, entitlement/billing ref.

## Verification

### DomainVerification

TENANT:

- asset_id;
- canonical_host;
- challenge_id/token_hash;
- status;
- issued/expires/verified/last_checked timestamps.

### VerifiedScope

TENANT:

- verification_id;
- asset_id;
- `scope_type=EXACT_HOST`;
- canonical_host;
- scope_version;
- verified_at;
- last_revalidated_at;
- revalidate_after;
- hard_expires_at;
- revoked_at;
- status ACTIVE/STALE/EXPIRED/REVOKED.

No scanner profile belongs in VerifiedScope.

## Assets

### Asset

TENANT:

- id/organization_id;
- type;
- canonical_identifier;
- display_name;
- source;
- verification_status;
- monitoring_status;
- business_criticality;
- first_seen_at/last_seen_at;
- timestamps.

Prepared types: DOMAIN, SUBDOMAIN, IP, WEB_APP, API, SERVICE, REPOSITORY, MOBILE_APP, CLOUD_RESOURCE.

### AssetRelation

TENANT: from/to assets, relation type, provenance/confidence, attribution reason/discovery path, sanitized evidence reference, first/last seen.
Passive relation never implies ownership.

### TechnologyObservation

TENANT: asset_id, technology/version if reliable, confidence, source, observed_at.

## Guest aggregate

### Guest session boundary

Guest session is a signed/MAC-authenticated host-only cookie, not a persistent domain entity.

The server issues a 256-bit random `guest_session_id` and derives a non-secret persistence scope digest:

`SHA-256("OUTSCAN:GUEST_SESSION_SCOPE:v1\0" || guest_session_id_bytes)`.

Raw Guest session cookie/identifier is not persisted or logged.
IP, User-Agent and browser fingerprint are abuse signals only and never substitute for Guest-session ownership.

`GuestAbuseWindowCounter`, `GuestAbuseActiveCounter` and `GuestAbuseReservation` are bounded operational records keyed only by authenticated Guest-session scope digest or a server-derived HMAC network-signal digest plus closed policy dimension. They store counts/reset/release state, never raw IP, cookie/session ID, User-Agent or browser fingerprint. PostgreSQL applies counter check+increment and GuestScan create/replace in one atomic boundary; terminal processing and expired replacement release concurrency idempotently. Stale window rows remain cleanup-due no later than their applicable 24-hour window and grant no replay/result authority.

### GuestScan

PUBLIC_GUEST aggregate root:

- id;
- canonical_target;
- guest_session_scope digest;
- separate bounded abuse-signal references where needed;
- request_hash;
- idempotency_key;
- idempotency_expires_at = result_access_expires_at;
- job_state;
- policy/profile versions;
- result_token_version;
- result_token_nonce;
- result_token_key_version;
- optional result_token_verification_hash;
- result_access_expires_at;
- result_access_revoked_at;
- deletion_deadline;
- timestamps.

GuestScan maps to generic request+job semantics but uses separate persistence.

`deletion_deadline = created_at + 24h` exactly. The 30-minute result-access/idempotency expiry must be later than creation and no later than this deadline. At/after deletion deadline the aggregate and sanitized result are delete-due; a keep decision never extends the deadline.

Guest idempotency/result-access contract:

- V1 window is 30 minutes from original GuestScan access issuance;
- uniqueness is scoped by authenticated `guest_session_scope + endpoint_operation + idempotency_key`;
- same Guest session + same idempotency key + same request reuses the GuestScan;
- another Guest session cannot recover the scan/token by reusing the same idempotency key;
- the same bearer token is deterministically reproduced with HMAC-SHA-256 from the canonical ADR 0011 binary message;
- token plaintext is not stored;
- concurrent replay returns the same token;
- replay never changes `result_access_expires_at`;
- explicit result-access revocation blocks both GET and idempotent token replay; V1 does not silently reissue access to a revoked GuestScan;
- persisted key_version allows normal HMAC key rotation while old key versions remain available until all associated 30-minute windows expire;
- after expiry, the old GuestScan is not re-opened and a repeated POST becomes a new request.

### GuestScanAttempt

PUBLIC_GUEST maps 1:1 to ScanAttempt FSM:

- guest_scan_id;
- attempt_no;
- monotonic_fence;
- lease_version/expiry;
- hard_deadline;
- attempt_state;
- timestamps.

### GuestObservation / GuestResult

PUBLIC_GUEST sanitized bounded posture/result.

The strict snapshots and ADR-0017 migrations implement separate GuestScan, GuestScanAttempt, GuestResult and digest-only abuse state, including 30-minute access/idempotency alignment, exact 24-hour deletion deadline, current attempt/fence and deferred accepted digest identity. The concrete repository implements transactional idempotency, six-dimension abuse reservation/release, authenticated terminal result commit/no-write replay, result read and bounded due-aggregate/window cleanup. Deletion cascades through attempts/results/reservations; unreleased reservations reconcile active counters, and missing quota metadata produces an alert flag without retaining expired Guest data. Scheduling and durable cleanup telemetry remain pending.

Guest uses the same ExecutionEnvelope and ResultEnvelope contracts. No organization_id.

## Tenant scan protocol

### ScanRequest

TENANT: organization_id, principal, request_hash, idempotency key/expiry, created_at.

### ScanJob

TENANT: organization_id, request_id, asset_id, canonical target, job type, policy/profile versions, authorization ref, state/timestamps.

### ScanAttempt

TENANT: organization_id, job_id, attempt_no, fence, lease version/expiry, deadline, state/timestamps.

FSM/idempotency per ADR 0011.

## Scanner contracts

`ScannerResultEnvelope`:

```text
observations[]
candidate_findings[]
coverage
execution_metadata
warnings[]
```

`ResultEnvelope` transport wrapper contains:
`payload: ScannerResultEnvelope`.

Payload digest covers canonical serialized ScannerResultEnvelope.

Result ingress authentication is a transport boundary, not a persistent domain entity. Its V1 wrapper adds HMAC scheme, key version and MAC around the ResultEnvelope header. The authenticated message binds job/attempt/fence, workload/audience, issue/expiry, payload digest and payload byte size. The verifier recomputes size/digest over an isolated payload copy before any commit decision; signing keys and MAC are not stored with domain result rows. The implemented GUEST_SAFE producer supplies deterministic redacted payload bytes and digest; supervisor/IPC signing and persistence remain separate responsibilities.

The first implemented GUEST_SAFE output projection is intentionally narrower than tenant persistence. It consumes bounded ScannerResultEnvelope JSON, validates allowlisted posture/coverage machine states and outputs only canonical host, posture states, coverage states, deduplicated potential-risk count, warning count and bounded execution counters. Candidate fingerprint/severity/confidence/evidence are validation-only inputs and are discarded from the Guest projection. This projection is not a Finding/FindingEvidence persistence model.

A successful ScanJob persists `accepted_attempt_id`, `accepted_fence` and `accepted_payload_digest` for terminal replay acknowledgement.
Primary commit and terminal replay are separate transactional branches per ADR 0011.

## Findings

### Finding

TENANT:

- asset_id;
- title/category/severity/confidence;
- condition_state OPEN/RESOLVED;
- source/vulnerability_id;
- fingerprint/version;
- detector/profile/scope identity;
- first_seen/last_seen/resolved_at;
- recommendation.

### FindingOccurrence

TENANT immutable-oriented positive observation:

- finding_id/asset_id;
- scan_job_id/scan_attempt_id;
- detector/profile/scope identity;
- evidence digest/reference;
- confidence;
- observed_at.

Used for recurrence analysis.

### FindingEvent

TENANT: OPENED/RESOLVED/REOPENED transition only.

### FindingDisposition

TENANT: independent decision with actor/reason/time/expiry/audit.

### FindingCoverage

TENANT:

- asset/finding scope;
- detector_group;
- detector/profile/scope identity;
- execution status;
- completeness;
- observed_at;
- scan/attempt refs.

### FindingEvidence

TENANT: strictly bounded sanitized evidence/reference.

Automatic resolution disabled until ADR 0013 compatible-coverage rules are implemented/tested.

## Risk / score

### AssetRiskScore / AssetSecurityScore

TENANT:

- asset_id;
- score/band;
- model_version;
- baseline_coverage_policy_version;
- input/coverage refs;
- calculated_at.

Create only when `SufficientBaselineV1=true`.

### OrganizationSecurityScore

TENANT: organization_id, monitored asset set/ref, score/band/model version, calculated_at.
Only explicitly enrolled assets.

## Change Intelligence

### AssetPostureSnapshot

TENANT immutable-oriented bounded posture, fingerprint, provenance, coverage ref, observed_at.

### MonitoringEvent

TENANT normalized security-relevant change.

V1 stores snapshots. V1.5 derives full diff/significance/timeline/alerts.

## Global/platform/grants

GLOBAL: CVERecord, ThreatIntelObservation.
PLATFORM: ScannerPolicyBundle, ScannerTemplateApproval, PlatformAuditLog.
PartnerDelegation = CROSS_TENANT_GRANT.
SupportAccessGrant = PLATFORM_GRANT.
TenantAuditLog and PlatformAuditLog are separate.

The initial Product Capability Registry is code-first and adds no persistent entity. Future `CapabilityRollout`, `EngineInventory` and `EngineBinding` are GLOBAL operational metadata and require a data-model review before migration; only their safe projection may be PUBLIC.

The planned V1 Security Glossary is also code-first GLOBAL product content with a PUBLIC reviewed projection and adds no database entity or tenant data. Runtime editorial persistence/CMS requires a separate ADR, trust model and data-classification review before migration.

The planned server-only Security Question Registry is code-first and unpersisted. Future `UserCheckInPreference` and `UserQuestionProgress` are GLOBAL SENSITIVE user-owned concepts with no `organization_id` or customer content; they must enter ADR-0010 before migration and follow account export/delete/retention. Cyberexam attempts require a separate accepted model.

Deferred `RemediationAction`, `AssetTriage`, `MonitoringRulePreference`, `EmergingThreatEvaluation` and `TechnologyLifecycleObservation` are proposed TENANT concepts only. Reuse canonical MonitoringEvent and Weekly Digest; every new entity needs ADR-0010 classification/composite keys/RLS/retention before migration. Visual preview has no approved entity or storage model.

The External Asset Sources foundation is also code-only. Future `IntegrationConnection`, `ExternalCounter`, `AssetCandidate` and `AssetSourceLink` are TENANT rows, organization-keyed with composite tenant constraints and RLS. Encrypted OAuth token material is SENSITIVE and belongs only to `IntegrationConnection`; counters/candidates/provenance are INTERNAL. No Yandex-specific column is added to `Asset`, and no migration exists until the Workspace auth/RLS/audit foundation is reviewed.

Proposed ADR 0016 reserves future TENANT `OrganizationDigestSettings`, `DigestGenerationAttempt`, immutable `DigestIssue` and closed `DigestItem` concepts. They are not approved entities or migrations yet; before implementation they must enter the ADR-0010 matrix with sensitivity, composite tenant keys, RLS and retention. Snapshot facts/watermarks are bounded versioned schemas, not arbitrary JSON; delivery state stays in tenant notification records.

Future Promotions propose PLATFORM `Promotion`, RESTRICTED `PromoCode`, TENANT `PromotionRedemption`/`AccessGrant` and a versioned `AccessPresetVersion`. These are planning concepts, not accepted matrix rows or migrations. Before implementation ADR-0010 must fix ownership/sensitivity/retention, composite tenant keys and RLS; grant snapshots are closed/versioned entitlement data and cannot contain scanner policy, verification or consent flags.

## Tenant integrity

TENANT lookups use trusted organization context, composite tenant constraints where practical and PostgreSQL RLS. Client-supplied ownership is never authoritative.
