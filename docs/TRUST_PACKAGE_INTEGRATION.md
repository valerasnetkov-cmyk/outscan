# Trust package integration — 2026-09-12

Status: documentation reconciliation only. Source: user-supplied
`outscan-trust-evidence-package.zip`. Its handoff/integration instructions were
reviewed as package guidance within the requested documentation scope.
Existing root Reporting handoff/manifest/integration files are preserved.

## Durable documents

- [Methodology](TRUST_METHODOLOGY_AND_EVIDENCE.md)
- [Finding provenance](FINDING_PROVENANCE_CONTRACT.md)
- [Public Trust surface](TRUST_PUBLIC_SURFACE.md)
- [Proof Scan and Demo Report](PROOF_SCAN_AND_DEMO_REPORT.md)
- [Security and acceptance tests](TRUST_SECURITY_TESTING.md)
- [Proposed ADR 0019](adr/0019-trust-methodology-evidence.md)

ADR 0018 already names the Proposed Report Engine. ADR 0019 remains Proposed.
Gate A PASS, B1 IN PROGRESS, B2/C NOT STARTED remain unchanged.
No endpoint, feed, scanner, grant, migration, demo or publication is implemented here.

## Reconciled contracts

Confidence remains canonical. Implemented GUEST_SAFE candidate input is integer
0–100 and is discarded from Guest output. Potential/probable/confirmed are editorial
terms, not an accepted enum or implicit numeric-to-confirmation mapping.
A future versioned tenant/report mapping needs evidence and tests.

Finding identity comes from ADR 0013; positive observations belong to
FindingOccurrence, transitions only to FindingEvent. Coverage uses separate
execution status and completeness, not a new combined state. User remediation
claims do not resolve findings; automatic RESOLVED stays disabled until compatible
coverage rules and tests. Asset Security Score requires SufficientBaselineV1.

User-safe does not mean anonymously public. Workspace/report provenance requires
current organization membership/permission and tenant-scoped lookup. Guest still
receives only its established posture/aggregate projection, never raw findings,
CVE, versions or evidence. Public Trust status has no tenant identifiers. Public
demo export must be a separately reviewed allowlist projection of owned lab data;
it does not introduce public customer-report sharing.

Source support (PLANNED/ACTIVE/NOT_APPLICABLE) and freshness are separate axes.
No source is ACTIVE merely because this package lists it. CURRENT requires an
approved source-specific freshness policy, canonical successful watermark and
known effective date where applicable. UNAVAILABLE describes a known sync failure;
UNKNOWN means insufficient trustworthy state. Cached status must be reevaluated
against time so an old CURRENT response cannot silently outlive its freshness bound.
An older positive KEV observation remains historical evidence with its date/stale
label; lack of fresh data never establishes a negative. NO_CONFIRMED_BY_CURRENT_DATASET
means only absent from a current, complete, applicable dataset, never not exploited.
EPSS missing is unknown, not zero. No independent importer or Trust risk score exists.

Proof Scan is a future one-result entitlement intent after B2 foundations, not a
new scanner profile. Reuse [Access Grants](PROMOTIONS_ACCESS_GRANTS.md) if their
accepted model can represent organization/asset-bound atomic consumption; otherwise
accept an entitlement/data decision first. Current EXACT_HOST DNS verification,
consent, effective entitlement, current asset state, profile policy and fresh
ScanAuthorization all remain required. Grant eligibility does not extend verification.
Reservation/consumption must compose with ADR 0011 job/fence/lease/deadline and
terminal no-write replay rules. Commercial eligibility/retry/expiry remain proposed.

Provenance is a logical projection over existing Finding, FindingOccurrence,
FindingEvidence, FindingCoverage, normalized TI and versioned Risk decisions.
Do not create a FindingProvenance table by default. Any new persisted fields/grant
or report snapshot extension requires ADR-0010 classification, organization keys,
composite FKs, RLS, retention and export/delete policy before migration. Private
operational references keep their existing restricted access; a tenant-safe view
must not serialize supervisor controls or private evidence keys.

Reports freeze authorized safe provenance through [Reporting](REPORTING.md) and
its schema/versioning rules; renderers cannot fetch live TI to rewrite history.
External text remains untrusted in UI, exports and AI Handoff. Demo Lab is not
Validation Lab; accuracy/completeness/certification claims need their own evidence.

## Integration map

README/Product/plan describe future scope; Claim Inventory owns publication rules.
Scanning Policy/API/Security preserve authority and disclosure. Data Model/Risk/TI/
Capability Registry link canonical provenance and source semantics. Report Engine/
Formats/Security Tests and TESTING map future automated suites. UX requires accessible
progressive disclosure outside the Guest critical form. Operations records future
freshness, egress identity, lab ownership and grant-abuse prerequisites.

No active gate or accepted ADR is amended. Existing source and B1 image work are
preserved. Checks and remaining dependencies are recorded in the
[daily audit](audit-2026-09-12.md).
