# Security model

## Assurance target

OUTSCAN is an internet-facing multi-tenant security product with privileged scanners. Development should use a production-grade control set comparable to OWASP ASVS Level 2 for relevant application controls, with stronger controls around scanner execution, admin access and outbound requests.

## Actors

- Anonymous visitor.
- Workspace Owner.
- Workspace Admin.
- Analyst.
- Viewer.
- Platform Owner.
- Platform Admin.
- Support.
- Security Operator.
- Scanner Worker.
- Threat Intelligence ingest process.
- External target/service.

## Trust boundaries

1. Browser <-> Public/Web UI.
2. Web/Admin <-> API.
3. API <-> PostgreSQL.
4. API <-> Queue.
5. Queue <-> Scanner Worker.
6. Scanner Worker <-> External Internet.
7. Threat Intelligence ingest <-> external feeds.
8. Platform Admin <-> privileged API surface.

## Critical invariants

### Multi-tenancy

- Tenant-scoped rows carry organization ownership.
- Server-side policy validates membership and role.
- Cross-tenant enumeration is forbidden, including list/search/export/report endpoints.
- UUID/random IDs are not authorization.

### Agency / MSP delegation

- Client data remains inside the client Organization tenant.
- Partner/Agency access is an explicit delegated grant, not implicit parent-tenant ownership.
- Every delegated request resolves and authorizes the concrete client organization server-side.
- Partner bulk operations must validate scope for every affected client organization.
- Revoking delegation removes access without deleting or transferring client-owned data.

### Verification

- Active network/vulnerability scan requires verified scope.
- Verification is checked at execution time, not only when UI button is shown.
- Verification can expire or be revoked by policy.

### Outbound target safety

- Parse only allowed target forms.
- Resolve and classify every destination IP.
- Reject loopback/private/link-local/multicast/unspecified/metadata/internal ranges.
- Re-check each redirect.
- Protect against DNS rebinding by binding validated resolution to connection strategy or revalidating resolution immediately before connect.
- Limit redirects, body sizes, connect/read timeouts, total runtime and request counts.

### Scanner isolation

Worker:

- no production DB credentials;
- no application internal subnet access;
- no metadata endpoint;
- no long-lived privileged secrets;
- read-only scanner image where practical;
- CPU/RAM/PID/time/network limits;
- disposable filesystem/container;
- restricted egress according to job needs.

### Admin

- Separate authorization policy.
- Privileged actions produce audit log.
- Support access to customer details requires explicit grant/reason and expiration when implemented.
- No client-controlled role or entitlement values.

### Secrets

- Store in platform secret manager/environment at runtime.
- Never in repository.
- Redact logs/evidence.
- Rotation procedure required before production.

## Data classes

### Public

DNS/RDAP/ASN/TLS/HTTP public posture.

### Customer confidential

- asset inventory not publicly exposed by OUTSCAN;
- discovered subdomains;
- findings/evidence;
- reports;
- monitoring history;
- organization/user data.

### Sensitive security data

- authentication sessions;
- API tokens;
- future scanner credentials for authenticated scan;
- support access grants;
- audit records.

Authenticated scanning secrets, when introduced, require a dedicated secret design/ADR before implementation.

## Abuse controls

Public quick scan:

- IP rate limit;
- target/domain rate limit;
- global concurrency limit;
- per-job request budget;
- CAPTCHA/escalation hook;
- deny/block list;
- suspicious automation detection;
- cost accounting/metrics.

Verified scanning:

- plan/entitlement limits;
- verified scope;
- per-organization concurrency;
- safe scanner profiles;
- explicit opt-in for active/deep modes.

## Logging

Log:

- request correlation id;
- actor id where authenticated;
- organization id;
- action;
- asset/job id;
- policy outcome;
- scanner profile/version;
- result status and duration.

Do not log:

- passwords;
- session cookies;
- auth tokens;
- raw authenticated scanner secrets;
- unnecessary response bodies containing sensitive data.

## Release blockers

Production release = FAIL if:

- Critical/High security issue remains;
- tenant authorization matrix is unverified;
- delegated Agency/MSP authorization is implemented without cross-client negative tests;
- guest scan can reach forbidden addresses;
- unverified asset can invoke active scan;
- scanner worker can reach application secrets/private network;
- security-sensitive test/build is failing;
- suspected exposed secret has not been rotated/contained.
