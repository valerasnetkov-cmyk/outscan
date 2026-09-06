# API contract — initial design

Canonical security decisions: ADR 0009–0015 where applicable.

## Conventions

JSON API, runtime validation, stable errors, correlation IDs, server-derived tenant authorization, pagination, explicit scan idempotency, no arbitrary scanner CLI/template/URL-fetch config, no raw scanner output.

## Public Guest

### `GET /v1/public/capabilities`

Anonymous read-only product metadata endpoint. It returns only an explicit safe projection of code-defined capabilities that are `ACTIVE`, public-visible, claim-approved and backed by valid production evidence.

Response:

```json
{
  "data": [],
  "meta": {
    "schemaVersion": 1,
    "generatedAt": "2026-09-06T00:00:00.000Z"
  }
}
```

Ordering uses explicit `sortOrder`. Query parameters are rejected. Registry failure returns the controlled `CAPABILITY_REGISTRY_UNAVAILABLE` response and never exposes internal scanner, policy, evidence or credential metadata. This endpoint cannot trigger a scan, mutate rollout state or grant authorization.

Detailed contract: `SECURITY_CAPABILITY_REGISTRY_CONTRACT.md`.

## Workspace integrations (not exposed)

The Yandex Metrika foundation has no HTTP route yet. After Organization authz, tenant RLS, encrypted secret storage and TenantAuditLog exist, the Workspace contract may add organization-scoped connect/callback/status/sync/disconnect/candidate/import endpoints. Callback state is one-time, expires after ten minutes and is paired with PKCE `S256`; only `metrika:read` may be requested. Access tokens remain server-side and never enter API responses or scanner jobs.

Imported Metrika records are discovery/provenance metadata only. Candidate selection cannot establish VerifiedScope or ScanAuthorization. Any future QUICK_SCAN request must independently pass the existing scanner policy and current authorization checks.

## Notifications (not exposed)

The notification foundation adds no HTTP route. Future account/Workspace endpoints may expose user endpoint binding and organization-scoped preferences/history only after auth, Organization, RLS and persistence exist. Ownership is derived server-side; no request may supply an arbitrary destination email, Telegram identity/chat ID or Ops endpoint.

Provider webhook routes remain absent. Later email/customer Telegram/Ops Telegram handlers must authenticate the provider before parsing state-changing content, enforce bounded closed schemas and process replay by local correlation/event identity. No provider credential or raw notification content is returned to clients.

Detailed contracts: `NOTIFICATIONS_COMMUNICATIONS.md`, `EMAIL_DELIVERY.md`, `TELEGRAM_INTEGRATION.md` and ADR 0015.

### Guest session bootstrap

Before creating a Guest Scan, the browser must have a valid server-issued `__Host-outscan_guest_session` cookie.

Required cookie attributes:

- `Secure`;
- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- no `Domain`;
- V1 Max-Age 24h.

The cookie carries a 256-bit random Guest session identifier plus server authentication/MAC. The API rejects invalid/client-forged Guest-session cookies.

The public page/session bootstrap establishes this cookie **before** `POST /v1/public/scans`. If the cookie is missing/invalid, the scan POST must not create a GuestScan; the client must complete session bootstrap first.

IP, NAT address, User-Agent and browser fingerprint may inform abuse controls but are not Guest authorization/idempotency ownership boundaries.

### `POST /v1/public/scans`

Input:

```json
{ "domain": "example.ru" }
```

Server:

1. validates the authenticated Guest-session cookie;
2. hostname-only validation;
3. IDNA/Punycode canonicalization;
4. abuse/rate checks;
5. ADR 0011 idempotency scoped to Guest session;
6. queue GUEST_SAFE.

Accepts `Idempotency-Key`.

Guest scan creation idempotency window is 30 minutes, aligned to result access.

Within that window:

- same Guest session + same key + same canonical request returns the original `scanId` and replay-stable resultToken;
- different Guest session cannot retrieve that original scan/token merely by reusing the same key;
- plaintext resultToken is not stored;
- replay expiry remains anchored to the original `resultAccessExpiresAt`;
- same Guest session + same key + different request → `409 IDEMPOTENCY_KEY_REUSED`.

After the 30-minute idempotency/result-access window, a repeated POST is a new Guest Scan request subject to current rate/abuse policy.

Response:

```json
{
  "scanId": "opaque-id",
  "resultToken": "replay-stable-secret",
  "status": "QUEUED",
  "resultAccessExpiresAt": "2026-09-03T12:30:00Z",
  "resultTokenExpiresInSeconds": 1800
}
```

### `GET /v1/public/scans/:scanId`

Requires the resultToken only through:

```text
Authorization: Bearer <resultToken>
```

The scheme is case-insensitive, but exactly one ASCII space and one canonical 43-character base64url token are required. Query parameters are not accepted on this endpoint; a token in the URL is rejected before authorization.

Policies:

- high entropy;
- never query string;
- 30m access lifetime anchored to `GuestScan.result_access_expires_at`;
- token is replay-stable for the original 30-minute access window and can be recomputed server-side without plaintext storage;
- token derivation uses persisted HMAC key version + GuestScan token nonce/version;
- normal HMAC key rotation keeps prior key versions available until their 30-minute windows expire;
- explicit result-access revocation blocks GET and idempotent token replay for that GuestScan;
- after access expiry the old GuestScan token is not returned/recomputed for client access;
- `Cache-Control: no-store`;
- `Referrer-Policy: no-referrer`;
- Guest retention max 24h.

Missing, malformed, expired, revoked, route-mismatched, tampered and unavailable-key tokens collapse to the same public `RESULT_ACCESS_DENIED` authorization result. Internal cryptographic/keyring causes are not returned.

Response is sanitized Guest posture only.

Current implementation provides the ADR-0011 cryptographic codecs, strict Set-Cookie/Cookie authentication and Bearer result-access authorization primitives in `apps/api/src/guest-crypto`. Result authorization binds the token to the route GuestScan ID, enforces the remaining 30-minute window and supplies mandatory no-store/no-referrer headers. `apps/api/src/guest-idempotency` implements the pure create/replay/conflict decision and deterministic token reproduction over a validated persisted-record view. Database transactions/unique constraints, persisted result lookup/serialization and all public Guest routes remain unimplemented.

## Auth/session

Before B2:

- secure httpOnly session;
- server validation/invalidation;
- secure recovery;
- CSRF/session hardening;
- rate limiting;
- no client-role authorization.

## Organizations

- `GET /v1/organizations` returns only Organizations with active membership for the current customer principal;
- `POST /v1/organizations` creates Organization + initial OWNER membership atomically;
- `GET /v1/organizations/:organizationId` requires active membership in that exact Organization;
- update/delete/member operations require server-resolved RBAC for that Organization.

Organization is TENANT_ROOT: it has no self `organization_id`, but its list/get/mutate access is tenant-scoped through membership and Organization-table RLS/equivalent DB policy per ADR 0010.

## Assets

Explicit Asset creation precedes verification:

- `GET /v1/organizations/:organizationId/assets`
- `POST /v1/organizations/:organizationId/assets`
- `GET/PATCH /v1/organizations/:organizationId/assets/:assetId`
- posture/history/relations subresources.

V1 creation accepts exact hostname/domain only.

## Verification

- `POST /v1/organizations/:organizationId/assets/:assetId/verifications`
- `POST /v1/organizations/:organizationId/assets/:assetId/verifications/check`
- revoke endpoint/style finalized with implementation.

TXT format/challenge FSM/revalidation per ADR 0009.
Success creates only VerifiedScope(EXACT_HOST).

## Scans

- `POST /v1/organizations/:organizationId/assets/:assetId/scans`
- `GET /v1/organizations/:organizationId/scans/:scanId`
- list asset scans.

Scan create accepts Idempotency-Key.
Approved profile enum only.
CONTROLLED_DEEP requires explicit per-run consent.
ACTIVE/IP/CIDR/raw TCP unavailable V1.

Authorization recomputed immediately before execution, including scheduled/targeted jobs.

## Findings

Organization-scoped list/detail/disposition/recheck.
User cannot directly set technical RESOLVED.
Occurrences/coverage are server-generated from accepted results.

## Monitoring

Enrollment is explicit and separate from verification.
Organization Security Score includes only active enrolled assets.

## Tenant lookup

`WHERE organization_id = :organizationId AND id = :objectId`.

UUID is not authorization.

## Partner / Platform

Partner uses delegated client scope.
Platform uses separate `/v1/platform/*`, Admin MFA/step-up before production and explicit SupportAccessGrant.

## Execution contracts

### ExecutionEnvelope

Trusted versioned job/target/policy/attempt/fence/budget data.

Primary result commit requires the current RUNNING attempt, current fence, unexpired lease and hard deadline.
Terminal same-digest replay is a separate acknowledgement branch over stored accepted attempt/fence/digest and performs no payload writes.

The pure V1 transition and commit/replay decision logic is implemented in `apps/api/src/scan-protocol`. A future repository transaction must apply its decision atomically; the module itself performs no persistence.

### ScannerResultEnvelope

```text
observations[]
candidate_findings[]
coverage
execution_metadata
warnings[]
```

The implemented GUEST_SAFE projection accepts this envelope only as bounded UTF-8 JSON bytes with an exact closed schema. Guest observations are allowlisted `check_id + outcome` machine states; coverage uses allowlisted detector groups and ADR-0013 execution/completeness enums. Candidate findings contain a canonical fingerprint, severity, integer confidence and bounded internal evidence at the input boundary, but the Guest projection emits only the deduplicated aggregate count. Candidate fingerprint, severity, confidence and evidence are never part of the public projection.

Execution metadata must bind schema version 1, profile `GUEST_SAFE`, canonical host, policy `outscan-v1@1.0.0`, duration ≤30 seconds and request count ≤40. Unknown/duplicate fields or codes fail closed.

The implemented GUEST_SAFE canonical producer snapshots the validated input, emits minified UTF-8 JSON in the top-level order `observations`, `candidate_findings`, `coverage`, `execution_metadata`, `warnings`, and uses the field order shown by this contract within every record. Observations, candidate findings, coverage and warnings are sorted by their stable machine identities using ordinal string comparison; finding severity and confidence break a repeated-fingerprint tie. Free-form candidate evidence is replaced with `[REDACTED:UNTRUSTED_EVIDENCE]` before serialization and digesting. The producer returns SHA-256, byte size, the sanitized Guest projection and copy-on-read canonical bytes.

### ResultEnvelope

```text
ResultEnvelope {
  schema_version
  job_id
  attempt_id
  fence
  workload_identity
  audience
  issued_at
  expires_at
  payload_digest
  payload_size
  payload: ScannerResultEnvelope
}
```

The internal V1 ingress wrapper is:

```text
AuthenticatedResultSubmission {
  envelope: ResultEnvelope
  authentication {
    scheme: HMAC-SHA-256
    key_version
    mac: base64url-no-padding(32 bytes)
  }
}
```

`apps/api/src/result-envelope` implements exact-shape header/authentication validation and the ADR-0011 domain-separated binary MAC message. It binds schema, job/attempt/fence, workload identity, audience, Unix-second issue/expiry times, SHA-256 payload digest and byte size. V1 lifetime is at most five minutes with at most 30 seconds future issue skew. The verifier requires the expected authenticated workload and audience, a versioned keyring and a caller-selected payload ceiling no greater than the 32 MiB V1 profile maximum.

MAC verification happens before hashing payload contents. After successful MAC verification, actual payload byte size and SHA-256 are checked in constant time against the authenticated header. Successful verification returns immutable header/commit identity plus a copy-on-read payload accessor. The GUEST_SAFE producer supplies the canonical representation required by ADR-0011, and the bounded IPC reader supplies one validated raw scanner payload.

The implemented supervisor signer uses the same encoding to create a 60-second wrapper only after current-attempt authorization, clean process exit and canonical target-bound GUEST_SAFE output. The signing key is obtained through a trusted provider after output acceptance and is absent from the frozen scanner launch plan. The production launcher/key provider and internal result-submission/transaction path remain pending; no public API behavior is added by this module.

Third-party scanner never receives Result Ingress credentials.

Result processing:

- **primary commit:** only RUNNING job/current RUNNING attempt/current fence + valid lease/deadline may write payload and transition to SUCCEEDED;
- **terminal replay:** SUCCEEDED job with stored accepted attempt/fence/digest matching the replay returns idempotent acknowledgement without rewriting payload or domain rows;
- accepted attempt/fence + different digest → `RESULT_DIGEST_CONFLICT` + audit;
- stale attempt/fence → reject.

## Error examples

`INVALID_TARGET`, `FORBIDDEN_DESTINATION`, `IDEMPOTENCY_KEY_REUSED`, `VERIFICATION_EXPIRED`, `SCOPE_STALE`, `SCAN_NOT_AUTHORIZED`, `STALE_ATTEMPT`, `LEASE_EXPIRED`, `ATTEMPT_DEADLINE_EXCEEDED`, `RESULT_DIGEST_CONFLICT`, `PROFILE_DISABLED`.
