# ADR 0011: Deterministic scan request, guest idempotency, job, attempt and result protocol

**Status:** Accepted
**Accepted:** 2026-09-03
**Date:** 2026-09-03
**Owner:** Backend / Security

## Security invariants

- Anonymous Guest idempotency is scoped by a server-authenticated high-entropy Guest session, never by IP address, NAT identity, browser fingerprint or user-supplied identifier alone.
- A lost Guest Scan POST response can be replayed only from the same valid Guest session and only during the original 30-minute result-access window.
- Result token plaintext is never persisted.
- A primary result commit requires the current RUNNING attempt plus valid lease/deadline.
- A terminal same-digest replay is a separate read/ack branch and never rewrites the payload.
- Different-digest replay for the committed attempt is a security conflict.

## Guest session boundary

Before `POST /v1/public/scans`, the browser must possess a valid host-only Guest session cookie issued by OUTSCAN.

Cookie name:

`__Host-outscan_guest_session`

Required attributes:

- `Secure`;
- `HttpOnly`;
- `SameSite=Lax`;
- `Path=/`;
- no `Domain` attribute;
- V1 Max-Age: 24 hours.

The cookie contains a server-issued 256-bit random `guest_session_id` plus a server-authenticated version/MAC. A client-chosen or invalidly authenticated cookie is rejected.

V1 cookie wire format:

```text
v1.<key_version_decimal>.<base64url-no-padding(guest_session_id_32_bytes)>.<base64url-no-padding(mac)>
```

`key_version_decimal` is canonical unsigned decimal with no leading zeros.

Cookie MAC v1:

```text
message = ASCII("OUTSCAN:GUEST_SESSION_COOKIE:v1\0")
          || U32BE(key_version)
          || guest_session_id_32_bytes

mac = HMAC-SHA-256(guest_session_key[key_version], message)
```

The server verifies the MAC in constant time. Normal key rotation retains prior Guest-session keys for the 24-hour cookie lifetime plus clock-skew margin; emergency compromise may invalidate sessions immediately.

A scan job is **not created** if the POST arrives without a valid Guest session. The public page/session bootstrap must establish the cookie before the scan POST. This preserves lost-response replay semantics.

For persistence/idempotency, derive:

`guest_session_scope = SHA-256("OUTSCAN:GUEST_SESSION_SCOPE:v1\0" || guest_session_id_bytes)`.

Store only this scope digest where a stable Guest principal key is required. Do not store/log the raw cookie/session identifier.

IP, User-Agent and browser/device fingerprint may be separate abuse/rate-limit signals, but **must not** be used as the authorization or idempotency ownership boundary. The network signal is derived only from a canonical socket peer or a bounded `X-Forwarded-For` chain behind an explicit trusted-proxy CIDR allow-list; untrusted forwarding data is ignored, while missing/malformed trusted-proxy data, excessive hops and a chain with no untrusted client fail closed. Raw addresses are not persisted and the digest grants no ownership/access. Normal HMAC rotation first deploys transactional active+retained digest reads everywhere, then selects the new active key; admission locks/sums live aliases but increments/reserves only the active digest. Retired keys remain for the 24-hour maximum abuse window plus deployment/clock skew. Emergency removal is an explicit audited fail-closed/reset decision, never a silent reset.

## Entities

### ScanRequest

- id;
- principal_scope;
- endpoint_operation;
- request_hash;
- idempotency_key;
- created_at;
- idempotency_expires_at.

For PUBLIC_GUEST:

`principal_scope = GUEST_SESSION:<guest_session_scope>`.

### ScanJob

- id;
- request_id;
- canonical_target;
- job_type;
- policy/profile versions;
- authorization context;
- state;
- timestamps;
- cancel_reason;
- accepted_attempt_id;
- accepted_fence;
- accepted_payload_digest.

### ScanAttempt

- id;
- job_id;
- attempt_no;
- monotonic_fence;
- lease_version;
- lease_expires_at;
- hard_deadline;
- state;
- timestamps.

## Guest scan idempotency

V1 Guest scan-create idempotency lifetime: **30 minutes**, aligned with result access.

Unique key:

`(principal_scope, endpoint_operation, idempotency_key)`.

`request_hash` covers all semantically relevant canonical request fields.

### Same Guest session + same key + same hash

Within the original 30-minute window:

- return the original logical GuestScan/ScanJob;
- do not create another scan;
- deterministically reproduce the same result-access token;
- do not extend `result_access_expires_at`.

### Different Guest session + same idempotency key

It is a different `principal_scope` and cannot retrieve/replay the original GuestScan or its result token.

The same idempotency-key text is therefore safe across unrelated Guest sessions.

### Same Guest session + same key + different hash

Reject:

`IDEMPOTENCY_KEY_REUSED`.

### After 30 minutes

The prior Guest idempotency/result-access window is closed. A repeated POST becomes a new Guest Scan request subject to current abuse/rate limits.

The retained old GuestScan cannot be reopened by token replay.

### Concurrent insert

Database uniqueness selects one winner.
The losing transaction reads the winner:

- same principal scope + same hash → original job/token;
- same principal scope + different hash → conflict.

Correctness is database-transactional, not process-memory-only.

## Replay-stable Guest result token

The result token is derived using a versioned, domain-separated, unambiguous binary representation.

### Token message encoding v1

Definitions:

- `ASCII(x)` = exact ASCII bytes;
- `UTF8(x)` = UTF-8 bytes;
- `U32BE(n)` = unsigned 32-bit big-endian integer;
- `U64BE(n)` = unsigned 64-bit big-endian integer;
- `LP(b)` = `U32BE(len(b)) || b`;
- `token_nonce` = exactly 32 random bytes;
- `result_access_expires_at` = Unix timestamp seconds encoded as U64BE;
- `token_version` = U64BE.

Canonical message:

```text
ASCII("OUTSCAN:GUEST_RESULT_TOKEN:v1\0")
|| LP(UTF8(guest_scan_id))
|| U64BE(token_version)
|| LP(token_nonce)
|| U64BE(result_access_expires_at_unix_seconds)
```

Token:

```text
base64url-no-padding(
  HMAC-SHA-256(result_token_key[key_version], canonical_message_v1)
)
```

No implicit string concatenation, locale-dependent timestamp or JSON serialization is allowed for v1.

Persist:

- token_version;
- token_nonce;
- key_version;
- result_access_expires_at;
- result_access_revoked_at;
- optional verification hash/audit metadata.

The HMAC key exists only in the platform secret manager.

### Verification/replay properties

- Same GuestScan/token version reproduces the same bearer token.
- Token plaintext is not stored.
- GET token verification uses constant-time comparison.
- `result_access_revoked_at != null` blocks GET and idempotent token replay.
- Replay never extends the original access expiry.
- DB disclosure alone cannot derive token without the HMAC key.

### HMAC key rotation

GuestScan stores `key_version`.

Normal rotation keeps retired key versions available to the verification/replay keyring until all 30-minute token windows issued under them expire plus clock-skew margin.

Emergency key compromise may invalidate outstanding tokens immediately. This is an intentional fail-closed security event.

V1 does not silently reissue access for a revoked GuestScan; start a new scan.

## ScanJob FSM

| Current  | Event                      | Next      |
| -------- | -------------------------- | --------- |
| QUEUED   | first valid attempt starts | RUNNING   |
| QUEUED   | cancel                     | CANCELLED |
| QUEUED   | deadline                   | EXPIRED   |
| RUNNING  | primary result commit      | SUCCEEDED |
| RUNNING  | retry budget exhausted     | FAILED    |
| RUNNING  | cancel/revoke              | CANCELLED |
| RUNNING  | hard job deadline          | EXPIRED   |
| terminal | execution state mutation   | forbidden |

A retry occurs while the logical job remains RUNNING.

## ScanAttempt FSM

| Current  | Event                     | Next       |
| -------- | ------------------------- | ---------- |
| CREATED  | CAS lease acquired        | LEASED     |
| CREATED  | job cancelled/expired     | CANCELLED  |
| LEASED   | scanner starts            | RUNNING    |
| LEASED   | lease expires/invalidated | SUPERSEDED |
| RUNNING  | primary result committed  | SUCCEEDED  |
| RUNNING  | scanner/policy failure    | FAILED     |
| RUNNING  | lease expires             | SUPERSEDED |
| RUNNING  | hard deadline             | TIMED_OUT  |
| RUNNING  | job cancellation          | CANCELLED  |
| RUNNING  | newer valid attempt/fence | SUPERSEDED |
| terminal | state transition          | forbidden  |

Terminal attempts:

`SUCCEEDED | FAILED | TIMED_OUT | CANCELLED | SUPERSEDED`.

## Lease / fence

- Lease acquire/renew is atomic CAS.
- `lease_version` changes on valid lease mutation.
- Replacement attempt gets a strictly greater fence.
- RUNNING supervisor renews lease when needed.
- Expired lease makes the attempt immediately ineligible for a **primary commit**.
- Primary commit validates current attempt/fence/lease/deadline atomically.

A current fence without a valid lease is insufficient for primary commit.

## ExecutionEnvelope

Trusted, versioned payload:

- job_id;
- attempt_id;
- fence;
- canonical_target;
- authorization reference;
- profile/policy/engine/image/config versions;
- budgets;
- lease_expires_at;
- hard_deadline.

## ResultEnvelope

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

`payload_digest` covers canonical serialized ScannerResultEnvelope.
Only trusted supervisor authenticates/submits ResultEnvelope.

### Result authentication wrapper v1

ResultEnvelope is carried inside an exact internal `AuthenticatedResultSubmission.authentication = { scheme: HMAC-SHA-256, key_version, mac: base64url-no-padding(32 bytes) }`. Definitions reuse `ASCII`, `UTF8`, `U32BE`, `U64BE` and `LP` from the Guest token encoding.

`message = ASCII("OUTSCAN:RESULT_ENVELOPE:v1\0") || U32BE(schema_version) || U32BE(key_version) || LP(UTF8(job_id)) || LP(UTF8(attempt_id)) || U64BE(fence) || LP(UTF8(workload_identity)) || LP(UTF8(audience)) || U64BE(issued_at_unix_seconds) || U64BE(expires_at_unix_seconds) || payload_digest_sha256_32_bytes || U64BE(payload_size)`; `mac = HMAC-SHA-256(result_ingress_key[key_version], message)`.

V1 lifetime is at most five minutes and future issue skew at most 30 seconds. Ingress requires the expected workload/audience, verifies MAC before hashing payload, then compares authenticated size/SHA-256 with bounded payload. Valid rotated keys remain available; missing/revoked versions fail closed. Scanner never receives the key: supervisor creates the wrapper. The implemented GUEST_SAFE producer supplies deterministic validated/redacted ScannerResultEnvelope bytes; supervisor signing and child-process pipe wiring remain pending.

## Result processing: two transactional branches

Authenticate ResultEnvelope workload identity/audience/expiry before either branch.

### Branch A — primary commit

Used only when no terminal result has been accepted.

All must be true atomically:

1. job state = RUNNING;
2. attempt is current;
3. fence is current;
4. attempt state = RUNNING;
5. `now < lease_expires_at`;
6. `now < hard_deadline`;
7. no accepted terminal result exists.

Then:

- validate/accept payload;
- persist normalized payload effects once;
- persist `accepted_attempt_id`, `accepted_fence`, `accepted_payload_digest`;
- transition attempt → SUCCEEDED;
- transition job → SUCCEEDED.

Failure examples:

- stale attempt/fence → `STALE_ATTEMPT`;
- expired lease → `LEASE_EXPIRED`;
- deadline exceeded → `ATTEMPT_DEADLINE_EXCEEDED`.

### Branch B — terminal replay acknowledgement

Used only after a terminal success already exists.

This branch does **not** require RUNNING job/attempt state or a still-valid lease/deadline because no execution result is being committed again.

Require:

1. job state = SUCCEEDED;
2. accepted attempt ID equals envelope attempt ID;
3. accepted fence equals envelope fence;
4. accepted payload digest equals envelope payload digest.

If all match:

- return idempotent `ALREADY_COMMITTED`/success acknowledgement;
- do not write payload, observations, findings, occurrences or coverage again;
- do not mutate job/attempt state.

If accepted attempt/fence matches but digest differs:

- reject `RESULT_DIGEST_CONFLICT`;
- emit security audit/metric;
- preserve first accepted result.

If attempt/fence differs:

- reject `STALE_ATTEMPT`.

## Guest mapping

Guest persistence is separate but uses the same logical protocol.

`GuestScan` contains:

- `guest_session_scope` digest;
- request/idempotency identity;
- logical job state;
- result access/token derivation metadata;
- accepted result identity/digest.

`GuestScanAttempt` maps 1:1 to ScanAttempt FSM/fence/lease semantics.

No Guest row uses tenant `organization_id`.

## System jobs

Scheduler, monitoring and TARGETED_CVE_SCAN use system-principal ScanRequest and the same job/result protocol.

## Required tests

The complete negative matrix is maintained in [TESTING.md](../TESTING.md). It must cover:

- Guest-session ownership, forgery, cross-session replay, expiry and revocation;
- canonical cookie/token encodings, ambiguity, constant-time verification and key rotation;
- lease/fence/deadline races, exactly-once primary commit and terminal digest replay/conflict.
