# Testing strategy

## Principle

Security claims require negative evidence. Never report PASS for checks not executed.

## Gate A documentation checks

- all ADR links resolve;
- one active PRE_SCAFFOLD_GATE;
- old correction drafts absent;
- entity matrix complete;
- claim inventory exists;
- reference-only `public/maket.png` is not treated as Gate A evidence; blocked claims are absent from accepted design;
- `git diff --check` PASS;
- Markdown line/link checks PASS.

## Unit

- hostname grammar/IDNA/trailing dot;
- full-set IP classification;
- verification FSM/revalidation time rules;
- capability policy validator/matrix;
- Risk Engine;
- finding fingerprint;
- occurrence recurrence;
- coverage compatibility;
- SufficientBaselineV1;
- entitlements/MonitoringEnrollment.

## Integration

### Product Capability Registry

- reject duplicate/invalid slugs, enums, shapes and unknown rollout references;
- include only `ACTIVE + publicVisible + claimApproved + evidenceValid` definitions;
- serialize only the explicit public allow-list in deterministic order;
- exclude planned, development, staging, validated, deprecated, retired and internal definitions;
- prove product visibility cannot change Guest profile, scanner policy, VerifiedScope or ScanAuthorization;
- verify anonymous read-only API, controlled failures and absence of mutation routes;
- render homepage labels from the canonical projection and fail safely when it is empty/unavailable.

Full matrix: `SECURITY_CAPABILITY_REGISTRY_TESTS.md`.

### Yandex Metrika asset-source foundation

- normalize http/https, Unicode/IDNA and public ICANN hostnames while rejecting credentials, IP literals, special/internal suffixes and oversized input;
- strictly parse bounded counter pages, all documented permission enums and partial malformed records without retaining unknown fields;
- paginate deterministically, bound retries/body/pages, honor numeric `Retry-After` and map 401/403/429/5xx to stable errors using injected network doubles;
- generate least-privilege `metrika:read` OAuth requests with random state and PKCE `S256`, and deny tampered/expired/consumed/ambiguous callbacks;
- deduplicate canonical candidates while retaining multiple counter/role provenance links and keeping subdomains distinct;
- prove candidate metadata contains no VerifiedScope, ScanAuthorization or access token and cannot alter scanner policy.

No real OAuth token, external request, tenant persistence, route, scheduler, UI or scan execution is used by these foundation tests.

### Notifications & Communications foundation

- accept only the closed account/tenant/platform event catalog and reject marketing/provider/unknown events, fields and scope mismatches;
- resolve only server-owned endpoint references, reject recipient overrides and fail closed on cross-tenant membership context;
- re-evaluate active membership/preferences and keep mandatory account delivery independent from marketing consent;
- verify versioned delivery identity, bounded attempt transitions, explicit unknown provider outcome, replay acknowledgement and stale-event non-regression;
- emit only canonical OUTSCAN links and allowlisted machine content without raw evidence, HTML, credentials or scanner data;
- verify 32-byte hash-only Telegram binding tokens, TTL/use/revoke behavior, numeric identity and separate constant-time customer/Ops webhook-secret checks;
- prove notification and webhook routes remain absent and fake adapters perform no external delivery.

Full security/release matrix: `NOTIFICATION_SECURITY_TESTING.md`.

### Pinned connections

- mixed A/AAAA with forbidden member fails closed;
- client connects to validated IP, not fresh uncontrolled DNS;
- Host header preserved;
- TLS SNI/certificate verified against canonical host;
- retry/redirect re-resolve/revalidate/pin.

### Verification

- exact TXT format;
- token binding;
- 24h challenge expiry;
- superseded/replay behavior;
- 7d normal revalidation;
- > 24h before Controlled Deep requires revalidation;
- 30d hard expiry without success;
- stale/revoked blocks scan.

### Guest session / idempotency / result access

- scan creation requires valid server-authenticated Guest-session cookie;
- invalid/client-forged Guest-session cookie does not create a scan;
- same Guest session + same key/hash within 30m returns original scan and same replay-stable token;
- different Guest session + same idempotency key cannot retrieve original scan/token;
- IP/NAT/User-Agent/browser fingerprint does not define ownership;
- plaintext token is not persisted;
- DB metadata without HMAC key cannot derive token;
- canonical v1 HMAC encoding has fixed test vectors and no concatenation ambiguity;
- concurrent same-session replay returns the same token;
- replay does not extend original `result_access_expires_at`;
- explicit result-access revocation blocks GET and replay;
- normal HMAC key rotation preserves replay until original token expiry;
- emergency key invalidation fails closed;
- replay after 30m creates a new scan request;
- same session + key + different hash conflicts;
- concurrent insertion is deterministic.

### Job/attempt

- allowed FSM transitions only;
- atomic lease and lease renewal;
- monotonic fence;
- RUNNING attempt with expired lease cannot primary-commit;
- hard-deadline-expired attempt cannot primary-commit;
- primary success writes payload/domain effects exactly once;
- after SUCCEEDED, same accepted attempt/fence/digest replay returns acknowledgement with zero duplicate writes even though job/attempt are terminal;
- after SUCCEEDED, accepted attempt/fence with different digest conflicts/audits;
- stale attempt/fence rejects;
- cancellation/expiry.

### Result relationship

- ResultEnvelope payload is ScannerResultEnvelope;
- digest covers canonical payload;
- replay creates no duplicate FindingOccurrence.

Implemented authenticated ingress evidence:

- exact ResultEnvelope and external HMAC wrapper shapes, including symbol/unknown-field rejection;
- fixed vector for `OUTSCAN:RESULT_ENVELOPE:v1\0` length-prefixed/big-endian encoding;
- job/attempt/fence/workload/audience/time/digest/size and key-version tamper rejection;
- canonical base64url MAC, missing/wrong/short/throwing keyring and uniform authentication denial;
- five-minute maximum lifetime, 30-second future issue skew and expiry equality denial;
- profile payload ceiling before authentication, then actual byte-size and constant-time digest checks;
- payload copy isolation and a verified-envelope-to-Guest-projection integration test.

Targeted verification: `npm --prefix apps/api test` PASS, 19 files / 464 tests; API lint, typecheck and build PASS. The repository-wide verify stopped only on the intentionally deferred `docs/YANDEX_METRIKA_ASSET_IMPORT.md` Prettier check before running its later stages. Canonical payload production, bounded IPC, secrets provisioning, persistence and exactly-once transaction tests remain pending.

Implemented GUEST_SAFE canonical-producer evidence:

- reordered top-level fields and reversed observations/findings/coverage/warnings produce identical canonical bytes, digest and size;
- stable ordinal collection ordering and fixed record-key order are asserted after parsing canonical output;
- CVE, internal endpoint, markup, CRLF and spreadsheet-formula evidence is replaced before digesting/signing;
- canonical payload re-enters the strict Guest projection with the same public result;
- copy mutation cannot change later reads or recorded digest/size;
- an end-to-end unit test authenticates the produced bytes through ResultEnvelope ingress;
- invalid bytes, limits, oversized input and unknown schema fields retain stable fail-closed results.

Targeted verification on 2026-09-06: `npm --prefix apps/api test` PASS, 20 files / 470 tests; API lint, typecheck and build PASS. Bounded IPC, secrets provisioning, persistence and exactly-once transaction tests remain pending.

Implemented scanner IPC protocol evidence:

- fixed `OUTSCAN:SCANNER_RESULT:v1\0` magic and unsigned big-endian payload length;
- successful fragmented header/payload assembly and immutable copy-on-read result;
- declared output ceiling rejection before payload allocation;
- invalid magic, zero length, early EOF, same/later-chunk trailing bytes and multiple-frame smuggling denial;
- non-byte chunks, thrown iterators and excessive empty-chunk fragmentation collapse to stable errors;
- one overall timeout and pre-aborted signal both cancel a non-terminating iterator best-effort;
- exact snapshotted options reject unknown fields, hostile getters and invalid global/profile limits;
- a complete IPC frame feeds the strict canonical GUEST_SAFE producer successfully.

Targeted verification: `npm --prefix apps/api test` PASS, 21 files / 494 tests; API lint, typecheck and build PASS. Tests use synthetic async iterators only; no child process, OS pipe, container, queue or external network was started.

### Tenant / tenant root

- Organization list returns active memberships only;
- Organization GET/mutate rejects non-member/wrong-role;
- Organization RLS/equivalent DB policy blocks guessed tenant root;
- composite FK;
- child-row RLS;
- tenant lookup;
- PartnerDelegation;
- SupportAccessGrant.

### Scanner

- no Redis/DB/result credential;
- no internal/metadata;
- capability/budget enforcement;
- unknown capability denied;
- HEADLESS_BROWSER denied in all V1 profiles.
- stale attempt/fence/authorization/lease/deadline denied before launch;
- any template/dependency/engine/image/config/policy/profile identity change invalidates approval.

### Hostile output

XSS, CRLF/log, CSV formula, PDF/HTML, malformed/oversized, secret redaction.

Implemented Guest projection evidence:

- `apps/api/src/scanner-output/guest-projection.ts` rejects input above the caller limit before parsing and caps that limit at the GUEST_SAFE 2 MiB scanner-output ceiling.
- Fatal UTF-8, BOM, malformed/trailing JSON, duplicate keys including escaped equivalents and nesting above 32 levels fail with stable codes and no parser detail.
- Exact envelope/observation/finding/coverage/metadata/warning shapes are required. Unknown/duplicate fields or machine codes, excessive collections, malformed fingerprints, invalid confidence and evidence above 4096 bytes fail closed.
- Candidate fingerprint, severity, confidence and hostile evidence are discarded. Tests use script markup, CRLF, a CVE, internal endpoint and spreadsheet formula and prove only one deduplicated aggregate risk count survives.
- Posture and coverage are sorted allowlisted machine states; warnings become a count; execution metadata is restricted to GUEST_SAFE policy and budget ceilings. Returned collections and records are frozen.
- Targeted `npm --prefix apps/api test`: PASS, 18 files / 438 tests; API lint, typecheck and build: PASS.
- Tests operate on local byte fixtures. Scanner IPC, persistence and route rendering are not implemented or claimed.

## B1 E2E

Guest input, progress, token result/expiry, full posture/coverage, registration CTA, abuse limits, WCAG critical flow.

## B2 E2E

Registration, Organization, Add exact host, DNS verification, baseline, insufficient baseline=no score, sufficient baseline=score, explicit enrollment, tenant isolation, controlled consent.

## Finding tests

- repeated compatible detection creates occurrences;
- occurrences feed recurrence;
- transition event only on condition change;
- partial/failed scan never auto-resolves;
- fingerprint-version change does not silently resolve.

## Accessibility runtime

Automated + manual contrast, keyboard, focus, labels/errors, live announcements, status text, 320px reflow, zoom and screen-reader smoke.

## Implemented Guest-session HTTP boundary evidence

- `apps/api/src/guest-crypto/guest-session-http.ts` emits one deterministic Set-Cookie header contract: `__Host-outscan_guest_session`, `Max-Age=86400`, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax` and no Domain attribute.
- Cookie authentication accepts a bounded header with at most 64 syntactically valid pairs, treats names case-sensitively and rejects control bytes, merged/invalid syntax and duplicate Guest cookie names before MAC verification.
- Success returns only `key_version` and `guest_session_scope`; the raw 256-bit session identifier is not returned by the HTTP boundary. Scope-based revocation, retained rotation keys, removed-key emergency invalidation and hostile dependency failures are covered.
- Guest-session crypto verification now also contains non-string values and throwing keyring lookups without exposing their details.
- Targeted `npm --prefix apps/api test`: PASS, 15 files / 340 tests; API lint, typecheck and build: PASS.
- No Fastify route, browser cookie, persistence or public Guest Scan exposure was added. Route-level security headers and bootstrap behavior remain pending B1 work.

## Implemented Guest idempotency decision evidence

- `apps/api/src/guest-idempotency` validates an exact current-request and stored-record view, derives the lookup tuple as `(GUEST_SESSION:<scope digest>, POST:/v1/public/scans, idempotency key)` and never accepts IP, NAT, User-Agent or fingerprint fields.
- No existing record yields CREATE with an exact 1800-second window. At the exact expiry boundary the old row yields REPLACE_EXPIRED with a new window anchored to current transaction time.
- Within the window, same hash returns the original GuestScan and HMAC-derived token with the original expiry; different hash returns `IDEMPOTENCY_KEY_REUSED`; revoked access or a missing/invalidated HMAC key cannot replay.
- Tests cover another Guest scope, concurrent-winner reread semantics, exact expiry, U64 overflow, malformed/inconsistent records, retained/removed rotation keys and throwing/changing getters. Parsed request/record/token values are snapshotted once.
- Targeted `npm --prefix apps/api test`: PASS, 16 files / 367 tests; API lint, typecheck and build: PASS.
- The decision is persistence-agnostic. PostgreSQL uniqueness, transaction isolation, atomic expired-row replacement and loser reread are not implemented or claimed; route exposure remains disabled.

## Implemented Guest result-access authorization evidence

- `apps/api/src/guest-crypto/guest-result-http.ts` accepts an exact route envelope, a single case-insensitive `Bearer` scheme with one space and one canonical 43-character base64url token, and an empty plain query object only.
- Any query parameter—including `token` or `resultToken`—is rejected. The token is verified against snapshotted persisted metadata and the exact route GuestScan ID and is not returned in the success result.
- Expiry, explicit revoke, route mismatch, tampering, malformed/multiple authorization input, excessive remaining lifetime, retired-key removal and hostile metadata/keyring behavior all collapse to `RESULT_ACCESS_DENIED`.
- Success carries the mandatory frozen `Cache-Control: no-store` and `Referrer-Policy: no-referrer` header policy plus the unchanged expiry/remaining lifetime.
- Result-token metadata validation now lives in one immutable snapshot function reused by direct verification and idempotency; non-string tokens, invalid U64 data, extra fields and throwing keyrings fail closed.
- Targeted `npm --prefix apps/api test`: PASS, 17 files / 396 tests; API lint, typecheck and build: PASS.
- No persisted GuestScan lookup, Fastify route, sanitized result serializer or browser/network request was added. Gate B1 remains open.

## Implemented hostname/IDNA boundary evidence

- `apps/api/src/target` is pure and has no DNS, network or public route.
- Positive cases cover lowercase normalization, surrounding whitespace, one trailing dot, Unicode IDN, existing Punycode and exact 63/253-octet DNS boundaries.
- Negative cases cover URL/path/query/fragment/userinfo/port syntax, IPv4/IPv6 and non-canonical IPv4 forms, invalid IDNA, empty labels, wildcard/underscore and length overflow.
- Targeted `npm --prefix apps/api test`: PASS, 8 files / 133 tests.
- Full-set A/AAAA classification is covered separately; DNS resolution, connection pinning and retry/redirect revalidation remain pending and are not implied by these lexical tests.

## Implemented full-set destination-policy evidence

- `apps/api/src/target/ip-policy.ts` normalizes and deduplicates both address families, requires a bounded non-empty set and makes one fail-closed decision over the complete set.
- Positive cases cover ordinary public IPv4/IPv6 and equivalent compressed/uncompressed IPv6 deduplication.
- Negative cases cover every built-in category, mixed public/private results, IPv4-mapped and scoped IPv6, malformed/sparse/oversized resolver data, malformed/excessive configured CIDRs and additive configured internal ranges.
- The policy snapshot matches the IANA IPv4/IPv6 special-purpose registries updated 2025-10-09 and additionally blocks `168.63.129.16` as a platform control address.
- Targeted `npm --prefix apps/api test`: PASS, 9 files / 179 tests; targeted API lint and typecheck: PASS.
- These classification tests make no network DNS calls and do not by themselves establish runtime DNS, socket pinning, Host/SNI/certificate or retry/redirect behavior; those layers have separate evidence below.

## Implemented A/AAAA resolver-boundary evidence

- `apps/api/src/target/resolver.ts` requires exact canonical host input and starts injected A and AAAA queries before awaiting either result.
- Exact closed-shape records require the correct address family and uint32 TTL; sparse, oversized, cross-family and extra-field responses fail closed.
- ENODATA permits a missing family; NXDOMAIN without data returns not-found; NXDOMAIN plus records is inconsistent; timeout/SERVFAIL/refused/unknown failures return one redacted operational error.
- Empty combined output is rejected. Successful results pass through full-set policy and return a deeply frozen target with normalized addresses and the minimum TTL across duplicates/families.
- Targeted `npm --prefix apps/api test`: PASS, 10 files / 200 tests; targeted API lint and typecheck: PASS.
- Resolver orchestration tests use only injected fakes. Runtime factory, pinned transport and retry/redirect behavior have separate evidence below; production wiring and live connection evidence remain pending.

## Implemented runtime DNS factory evidence

- `apps/api/src/target/runtime-dns.ts` validates an exact configuration and creates an independent Node Resolver with explicit timeout, tries, maximum retry timeout and literal-IP server list.
- Tests cover empty/excessive/sparse/duplicate servers, hostname/URL/zone-ID endpoints, invalid and non-canonical ports, every numeric boundary, hostile property access and factory/`setServers` failures.
- The success config and server array are frozen. The underlying configurable Resolver is not exposed; a frozen bound facade contains only `resolve4` and `resolve6`.
- Local runtime construction with Node 24.14.0 accepted the selected `timeout`, `tries`, `maxTimeout` and `setServers` API without performing a DNS query.
- Targeted `npm --prefix apps/api test`: PASS, 11 files / 231 tests; targeted API lint and typecheck: PASS.
- No environment secrets/config were read, no DNS packet was sent and the factory is not wired to a route, job or supervisor yet.

## Implemented pinned request-options evidence

- Resolved targets include creation and expiry timestamps derived from the minimum A/AAAA TTL; invalid time and safe-integer overflow fail closed.
- `apps/api/src/target/pinned-request.ts` accepts only exact canonical/current-policy targets, reclassifies every address including configured internal CIDRs and rejects stale resolution or a pin outside the approved set.
- The custom lookup returns exactly the selected address, rejects changed hostname/family requests and supports Node single/all lookup callback forms without another DNS lookup.
- Tests assert canonical HTTP Host, fixed ports, TLS SNI, `rejectUnauthorized`, standard certificate hostname verification against canonical host, no agent pooling, strict parser mode and GET/HEAD-only origin-form paths.
- Forged family/policy/timestamps/address sets, expired TTL, request extra fields, protocol/method/path injection and private targets fail closed.
- Targeted `npm --prefix apps/api test`: PASS, 12 files / 264 tests; targeted API typecheck: PASS.
- This option-builder suite opens no socket; request execution, connect-address observation and retry/redirect behavior are covered by separate synthetic suites below.

## Implemented pinned transport evidence

- `apps/api/src/target/pinned-transport.ts` executes the validated request options through protocol-specific dispatchers and accepts a response only after canonical `socket.remoteAddress` equality with the selected approved pin.
- A single wall-clock deadline covers connection and response. Header count/bytes and body bytes are bounded; status, raw header syntax, duplicate/invalid `Content-Length`, simultaneous `Content-Length`/`Transfer-Encoding`, declared-length mismatch and incomplete responses fail closed.
- Redirects, including 3xx with `Location`, are returned as bounded responses and are not followed by the transport. This prevents an implicit unvalidated second connection.
- Negative tests cover unexpected/private/missing connected addresses, response-before-connect, timeout, request/response errors, hostile headers, declared/streamed overflow and ambiguous/incomplete framing. Returned failures contain stable codes rather than upstream error details.
- Targeted `npm --prefix apps/api test`: PASS, 13 files / 292 tests; API lint, typecheck and build: PASS.
- Tests use injected in-memory request, response and socket doubles. No DNS packet or outbound connection was made; retry/redirect orchestration is covered separately below and owned-target live TLS evidence remains pending.

## Implemented retry/redirect flow evidence

- `apps/api/src/target/safe-http-flow.ts` accepts an exact bounded flow request and freshly runs dual-family resolution, full-set destination policy and pin selection before each initial request, retry and followed redirect.
- Only normalized same-host HTTP(S) redirects on default ports are eligible. Cross-host redirects return `CROSS_HOST_REDIRECT` without follow; HTTPS downgrade, userinfo, non-default ports, duplicate/malformed `Location` and redirect limit overflow fail closed.
- Retries are limited to redacted DNS operational failures, transport errors and timeouts. Pin mismatch and policy/response validation failures are not retried. The flow also enforces a hard deadline and aggregate response-byte ceiling.
- Tests prove a changed DNS answer becomes the next selected pin for both retry and redirect, both A/AAAA queries run again, fragments are not sent, and cross-host destinations are never resolved or dispatched.
- Validated transport limits are copied into an immutable snapshot; a changing getter cannot alter a post-validation limit.
- Targeted `npm --prefix apps/api test`: PASS, 14 files / 317 tests; API lint, typecheck and build: PASS.
- All flow dependencies are injected fakes. No live DNS request or outbound socket was used; owned-target live HTTP/TLS integration evidence remains pending.

## Implemented trusted Guest supervisor runtime evidence

- A current approved GUEST_SAFE attempt produces one canonical, target-bound payload and a 60-second authenticated ResultEnvelope that passes the independent ingress verifier.
- The launch plan is frozen and excludes job ID, authorization reference, result credential and signing key; the key provider is not read until IPC, exit and output validation succeed.
- Stale attempt/fence and non-Guest profiles cannot launch through this runtime.
- Malformed/throwing launchers and handles, invalid IPC, non-zero/signalled/malformed exit, changed canonical target, crossed deadline and unavailable/malformed signing keys fail with stable codes.
- Abort and rejected/unknown process state exercise bounded TERM→KILL escalation using injected fakes only.
- Result signing rejects unknown fields, invalid identifiers/times/key versions/key sizes and profile-overlimit payloads; returned payload/submission copies cannot mutate the signed snapshot.
- Scanner policy capabilities, budgets and artifact dependencies are immutable snapshots after authorization, closing mutation-after-check behavior.
- Tests start no child process, container, DNS query, outbound connection, queue or database transaction; production isolation, key provisioning and commit evidence remain pending.

## Release

Gate C requires lint, typecheck, tests, security negative suite, build, migrations, dependency/secret review and no unresolved Critical/High.
