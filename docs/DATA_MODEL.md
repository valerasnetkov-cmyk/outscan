# Data model

## Principles

1. `Asset` is the core resource model.
2. Tenant ownership is explicit.
3. Observations are timestamped and preserve source/provenance.
4. Findings are normalized independently from scanner implementation.
5. Asset relationships are first-class to support future Asset Graph.
6. Evidence retention is minimized.

## Core entities

### User

Identity only. Organization access is modeled through membership.

### Organization

Tenant boundary.

### OrganizationMember

Fields/concepts:

- organization_id
- user_id
- role: OWNER / ADMIN / ANALYST / VIEWER
- status
- created_at

Unique organization/user membership.

### Subscription

- organization_id
- plan
- status
- limits/entitlements
- billing metadata identifiers only; do not store payment secrets.

### DomainVerification

- organization_id
- domain asset id
- method
- token hash/reference
- status
- verified_at
- expires_at / revoked_at

### Asset

Suggested fields:

- id
- organization_id
- type
- canonical_identifier
- display_name
- source
- verification_status
- monitoring_status
- business_criticality
- first_seen_at
- last_seen_at
- created_at
- updated_at

Types prepared for growth:

- DOMAIN
- SUBDOMAIN
- IP
- WEB_APP
- API
- SERVICE
- REPOSITORY
- MOBILE_APP
- CLOUD_RESOURCE

Do not implement all types in V1 UI; schema/contract must allow growth.

### AssetRelation

- organization_id
- from_asset_id
- relation_type
- to_asset_id
- source
- confidence
- attribution_reason / discovery_path
- evidence_reference when needed and sanitized
- first_seen_at
- last_seen_at

Potential relation types:

- SUBDOMAIN_OF
- RESOLVES_TO
- CNAME_TO
- HOSTED_IN
- BELONGS_TO_ASN
- EXPOSES
- USES_TECHNOLOGY
- CONNECTS_TO

Technology may initially remain a separate observation entity rather than a graph node.

### TechnologyObservation

- asset_id
- technology
- version when reliably known
- confidence
- source
- observed_at

Guest output must not automatically expose sensitive version details.

### Scan

Logical user/system scan.

- organization_id nullable only for guest scan session model
- type
- requested_by
- status
- requested_at
- started_at
- completed_at

### ScanJob

Execution unit.

- scan_id
- asset_id/scope
- job_type
- scanner_profile
- worker lease/status
- attempt
- timeout/budget
- timestamps

### Finding

- organization_id
- asset_id
- title
- category
- severity
- confidence: POTENTIAL / PROBABLE / CONFIRMED
- status
- source
- vulnerability_id nullable
- first_seen_at
- last_seen_at
- fixed_at nullable
- accepted_risk_at nullable
- recommendation summary

### FindingEvidence

Separate table/storage class because retention and access can be stricter.

- finding_id
- evidence_type
- sanitized payload/reference
- source
- observed_at

### Vulnerability / CVERecord

Normalized vulnerability metadata:

- cve_id
- description/reference metadata
- CVSS data
- CWE
- affected product identifiers
- published/modified timestamps
- source provenance

### ThreatIntelObservation

- cve_id
- source: NVD / KEV / EPSS / OSV ...
- source_updated_at
- ingested_at
- normalized fields

### RiskScore

- finding_id or asset scope
- score
- band
- model_version
- input snapshot/reference
- calculated_at

Keep model version so historical scores remain explainable after formula changes.

### AssetPostureSnapshot

Supports Change Intelligence without losing previous state.

Suggested concepts:

- organization_id
- asset_id
- schema_version
- validated posture payload/reference
- fingerprint/hash for cheap change detection
- observed_at
- source_set/provenance

Implementation may use validated JSONB for the bounded snapshot payload plus typed/indexed columns for query-critical fields. Do not turn this into arbitrary unvalidated catch-all JSON.

Snapshots are immutable-oriented; current posture may be materialized separately for fast reads.

### MonitoringEvent

Examples:

- NEW_ASSET
- IP_CHANGED
- ASN_CHANGED
- NS_CHANGED
- MX_CHANGED
- TLS_CHANGED
- CERT_EXPIRING
- DMARC_CHANGED
- RPKI_CHANGED
- NEW_FINDING
- FINDING_FIXED
- FINDING_REOPENED
- SCORE_CHANGED

### Notification

Delivery state and channel, not business source of truth.

### Report

Generated report metadata and secure file reference.

### AuditLog

Immutable-oriented privileged/action log.

### PartnerDelegation

Future Agency/MSP relationship.

- partner_organization_id
- client_organization_id
- scope / permissions
- status
- granted_by
- created_at
- expires_at nullable
- revoked_at nullable

Security rule: this relation grants bounded delegated access; it does not merge tenants or transfer ownership.

### SupportAccessGrant

Future break-glass support access:

- organization_id
- granted_to
- reason
- scope
- granted_by / approval source
- expires_at
- revoked_at

## Tenant key rule

Every tenant-scoped query must be constrained by `organization_id` through trusted server-side context.

Do not accept tenant ownership from client payload as authoritative.

Agency/MSP access must still resolve a concrete client `organization_id` and verify a valid delegation for that action. Never query all partner clients by trusting a client-supplied list of tenant ids.

## History

Do not overwrite posture values without history when the change is security-relevant.

Persist or derive timeline for:

- IP
- ASN
- NS
- MX
- CA/certificate
- CDN/WAF
- TLS
- DMARC
- RPKI
- technology observations
