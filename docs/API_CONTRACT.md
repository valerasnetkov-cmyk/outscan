# API contract - initial design

This document defines resource boundaries, not final framework syntax.

## Conventions

- JSON API.
- Runtime request validation.
- Authenticated tenant context derived server-side.
- Stable machine-readable error codes.
- Correlation/request id.
- Pagination on list endpoints.
- Idempotency for scan requests and future billing/webhooks where required.
- Do not expose internal scanner command lines or raw secret-bearing output.

## Public API

### `POST /v1/public/scans`

Input:

```json
{
  "domain": "example.ru"
}
```

Server behavior:

1. canonicalize domain;
2. reject invalid/forbidden target;
3. apply rate/abuse limits;
4. create guest-safe scan;
5. return opaque public scan id.

Response example:

```json
{
  "scanId": "opaque-id",
  "status": "queued"
}
```

### `GET /v1/public/scans/:scanId`

Returns only sanitized guest-safe result.

Must not include:

- CVE details;
- discovered subdomain list;
- endpoints;
- raw scanner evidence;
- vulnerable version evidence;
- internal worker metadata.

Public scan ids must not permit enumeration of other scans. Retention should be short and defined before production.

## Auth / Session

Exact endpoints depend on selected auth implementation. Security properties are fixed:

- secure httpOnly session cookie;
- server-side session validation;
- secure password/recovery flow if password auth is used;
- rate limiting;
- session invalidation;
- no authorization from client role claims alone.

## Organizations

- `GET /v1/organizations`
- `POST /v1/organizations`
- `GET /v1/organizations/:id`
- member management endpoints by role.

All organization operations use server-side membership checks.

## Assets

- `GET /v1/assets`
- `POST /v1/assets`
- `GET /v1/assets/:id`
- `PATCH /v1/assets/:id`
- `POST /v1/assets/:id/monitoring`
- `GET /v1/assets/:id/history`
- `GET /v1/assets/:id/posture`
- `GET /v1/assets/:id/changes`
- `GET /v1/assets/:id/relations`

Do not trust `organizationId` from request body as ownership authority.

## Verification

- `POST /v1/assets/:id/verifications`
- `POST /v1/assets/:id/verifications/check`

Active scan endpoint must re-check current verification state.

## Scans

- `POST /v1/assets/:id/scans`
- `GET /v1/scans/:id`
- `GET /v1/assets/:id/scans`

Request contains allowed scan profile enum, not arbitrary scanner arguments.

Never expose an endpoint accepting arbitrary shell command, Nuclei template path or unrestricted URL-fetch configuration.

## Findings

- `GET /v1/findings`
- `GET /v1/findings/:id`
- `POST /v1/findings/:id/acknowledge`
- `POST /v1/findings/:id/accept-risk`
- `POST /v1/findings/:id/recheck`

State transitions are validated server-side.

## Monitoring

- `GET /v1/events`
- `GET /v1/assets/:id/events`

## Reports

- `POST /v1/reports`
- `GET /v1/reports`
- secure download flow with authorization and expiration.

## Attack Surface / relation API

V2-ready resource boundaries:

- `GET /v1/attack-surface`
- `GET /v1/assets/:id/relations`
- relation responses include provenance/confidence needed to explain attribution.

Do not expose a discovered asset as owned/verified merely because a passive relation exists.

## Partner / Agency API

Future namespace should use delegated tenant context, for example `/v1/partner/*`.

Bulk partner operations must authorize every client organization/scope server-side. A partner token cannot imply platform-admin access.

## Platform Admin

Use a distinct route namespace and policy layer, e.g. `/v1/platform/*`.

Examples:

- organizations overview;
- users;
- scans;
- workers;
- queue;
- threat-intel status;
- abuse/blocklist;
- audit logs.

No admin endpoint relies on UI visibility for protection.

## Scanner worker contract

Worker does not consume arbitrary user payload.

Job contract contains only validated fields such as:

- job id;
- target/scope;
- scanner profile id;
- runtime budget;
- callback/result channel credential scoped to this job.

Scanner-specific arguments are resolved from trusted server configuration/profile allowlist.
