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

The IPC unit suite uses synthetic async iterators only; it starts no child process, OS pipe or external network.

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

## Implemented sanitized Guest result-view evidence

- `apps/api/src/guest-result` accepts only a successful result-access record and the exact sanitized Guest projection; malformed, extra, oversized, non-canonical and hostile getter input fails closed.
- The response has five ordered posture sections and enumerates all eight canonical detector groups, mapping failed execution to `UNAVAILABLE` and absent groups to `MISSING`; insufficient coverage never produces a Security Score.
- Fixed limitations state Guest posture only, no Security Score and no absolute assurance. Raw Findings/evidence, severity, confidence, fingerprints, duration and request count are absent from the response model.
- Result expiry and completion chronology are bounded, no-store/no-referrer headers are preserved and all returned records/collections are frozen.
- Targeted `npm --prefix apps/api test -- guest-result-view.test.ts`: PASS, 1 file / 14 tests; API lint and typecheck: PASS.
- No database-backed lookup, route, page, browser request or WCAG runtime evidence was added. Gate B1 remains open.

## Implemented GuestScan snapshot and result-read evidence

- `apps/api/src/guest-scan` validates exact PUBLIC_GUEST GuestScan, GuestScanAttempt and GuestResult record shapes with no `organization_id`, raw session ID, IP or client ownership field.
- Tests enforce 30-minute access/idempotency and exact 24-hour deletion deadlines, canonical target, token/scan identity, job/attempt state chronology, lease/deadline shape and accepted attempt/fence/digest consistency.
- The async read service queries only the route GuestScan ID, denies malformed bearer input before lookup, then reuses canonical token authorization and sanitized view projection over one validated snapshot.
- Missing, hostile, inconsistent, cross-target, expired, revoked, delete-due and unavailable-key inputs return the same access denial; raw persisted identity/token/digest/execution fields are absent from success output.
- Targeted Guest snapshot/read evidence remains 2 files / 44 tests; the detached result HTTP adapter adds 6 passing cases for sanitized success, 400/404/503 mapping, privacy headers, query and implicit-HEAD rejection, dependency containment and production-app route absence.
- ADR-0017 supplies the PostgreSQL adapter and `guest-http` supplies unregistered bootstrap/creation/result Fastify plugins. `buildApp()` and browsers still have no Guest route, so Gate B1 stays open.

## Implemented PostgreSQL Guest schema evidence

- `0001_guest_scan.sql` creates separate no-tenant Guest scan/attempt/result tables with bounded types, exact 30-minute/24-hour chronology and idempotency uniqueness.
- Deferred accepted-result foreign keys and database guards enforce job/attempt FSM, monotonic fence/lease state, terminal immutability and exact accepted attempt/fence/digest/target identity.
- The migration runner serializes execution with an advisory lock, records checksums and rejects drift, missing applied files and out-of-order additions. Pool TLS mode is explicit and certificate validation cannot be disabled when required.
- PostgreSQL tests cover migration replay/drift, concurrent idempotency conflict, invalid time windows, attempt transitions, atomic result commit, missing/cross-target result rejection and cascade deletion.
- The schema suite remains 1 file / 11 tests against PostgreSQL 18. The repository suite below extends the combined database evidence.

## Implemented PostgreSQL Guest repository evidence

- Strict input rejects unknown/malformed scope, key, hash, canonical target and server time before acquiring a client. The internal creation composition also rejects malformed request/dependency/persistence/queue shapes and authenticates the Guest cookie before persistence; IDs, token nonce and active key version come only from trusted dependencies.
- SERIALIZABLE create/replay/replacement uses one checked-out client, bounded retry for serialization/deadlock/idempotency-winner races and stable redacted failures.
- Tests prove one concurrent creator plus same-ID/token replay, different-hash conflict, cross-session independence, exact-expiry replacement, missing-key rollback and no expiry extension. Creation tests additionally prove canonical request hashing, trusted-network pseudonymization, exact-ID enqueue acknowledgement, token withholding on queue failure and stable-ID re-enqueue after a changed network signal.
- The one-query result store maps explicit columns through exact Guest snapshots; an integration test completes a valid attempt/result transaction and exercises bearer authorization plus sanitized output.
- The terminal committer verifies workload/audience/time/MAC/digest/size, reconstructs canonical sanitized output and rejects target substitution before accepting any result data.
- PostgreSQL transaction time, locked current scan/attempt rows and CAS updates enforce RUNNING/current attempt/fence/live lease/deadline. Primary commit atomically persists one immutable result; terminal same-digest replay performs no payload write.
- Database tests prove concurrent result convergence, target/authentication denial and idempotent append-only rejection evidence bound by composite scan/attempt/fence FK, minimized columns and aggregate cascade. Queue tests require successful rejection recording before retry and fail closed when the sink is unavailable or classification disagrees.
- `pnpm verify:db`: PASS, 11 files / 75 tests against PostgreSQL 18.6. It includes creation composition plus abuse/retention/cancellation, lease/fence concurrency, rejection evidence, retention-run persistence and minimized queue telemetry exact replay/constraints. The separate Redis suite covers BullMQ delivery; production alert export and HTTP/UI remain pending.

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

- `apps/api/src/guest-crypto/guest-session-http.ts` emits and validates one deterministic Set-Cookie header contract: `__Host-outscan_guest_session`, `Max-Age=86400`, `Path=/`, `Secure`, `HttpOnly`, `SameSite=Lax` and no Domain attribute.
- Cookie authentication accepts a bounded header with at most 64 syntactically valid pairs, treats names case-sensitively and rejects control bytes, merged/invalid syntax and duplicate Guest cookie names before MAC verification.
- Success returns only `key_version` and `guest_session_scope`; the raw 256-bit session identifier is not returned. Bootstrap and scan admission independently fresh-read and copy 1–3 exact keys before MAC authentication; removed retained keys deny the next admission before persistence/queue, and bootstrap replacement cannot restore old ownership.
- The detached plugin requires one exact configured HTTPS Origin, rejects query/body and malformed/extra service decisions, emits only `204` plus a validated cookie when issued, and maps key/revocation ambiguity to one unavailable response.
- Full `npm run verify`: PASS, including 63 API files / 994 passed and 2 Windows-inapplicable skips, registry 23 and web 3. `npm run verify:db`: PASS, 12 files / 81 tests against PostgreSQL 18.6 after the DB creation harness adopted the provider contract; SQL and queue transport were unchanged.
- Mounted-keyring and creation tests cover fresh rotation/removal, active/retained selection, canonical 32-byte keys, malformed/throwing providers, duplicate/unknown fields and versions, size/path/file failures and POSIX-only symlink/permission denial. Shared-reader tests simulate partial reads, concurrent growth/truncation, post-read metadata changes and read failure to verify bounded allocation and handle cleanup. `buildApp()` still has no Guest route; managed production key provisioning, process deployment and registration remain pending B1 work.

## Implemented Guest idempotency decision evidence

- `apps/api/src/guest-idempotency` validates an exact current-request and stored-record view, derives the lookup tuple as `(GUEST_SESSION:<scope digest>, POST:/v1/public/scans, idempotency key)` and never accepts IP, NAT, User-Agent or fingerprint fields.
- No existing record yields CREATE with an exact 1800-second window. At the exact expiry boundary the old row yields REPLACE_EXPIRED with a new window anchored to current transaction time.
- Within the window, same hash returns the original GuestScan and HMAC-derived token with the original expiry; different hash returns `IDEMPOTENCY_KEY_REUSED`; revoked access or a missing/invalidated HMAC key cannot replay.
- Tests cover another Guest scope, concurrent-winner reread semantics, exact expiry, U64 overflow, malformed/inconsistent records, retained/removed rotation keys and throwing/changing getters. Parsed request/record/token values are snapshotted once.
- Targeted `npm --prefix apps/api test`: PASS, 16 files / 367 tests; API lint, typecheck and build: PASS.
- The pure decision remains persistence-agnostic; the PostgreSQL adapter and internal creation composition now implement uniqueness, transaction isolation, atomic expired-row replacement and winner reread. Route exposure remains disabled.

## Implemented Guest result-access authorization evidence

- `apps/api/src/guest-crypto/guest-result-http.ts` accepts an exact route envelope, a single case-insensitive `Bearer` scheme with one space and one canonical 43-character base64url token, and an empty plain query object only.
- Any query parameter—including `token` or `resultToken`—is rejected. The token is verified against snapshotted persisted metadata and the exact route GuestScan ID and is not returned in the success result.
- Expiry, explicit revoke, route mismatch, tampering, malformed/multiple authorization input, excessive remaining lifetime, retired-key removal and hostile metadata/keyring behavior all collapse to `RESULT_ACCESS_DENIED`.
- Success carries the mandatory frozen `Cache-Control: no-store` and `Referrer-Policy: no-referrer` header policy plus the unchanged expiry/remaining lifetime.
- Result-token metadata validation now lives in one immutable snapshot function reused by direct verification and idempotency; non-string tokens, invalid U64 data, extra fields and throwing keyrings fail closed.
- Targeted `npm --prefix apps/api test`: PASS, 17 files / 396 tests; API lint, typecheck and build: PASS.
- The concrete database-backed GuestScan lookup is now wired to the read-store port. No Fastify route or browser/network request is exposed; Gate B1 remains open.

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
- All flow dependencies are injected fakes. The minimal first-party Guest scanner composes this flow; its tests prove exact policy/capability input, built-in and configured-CIDR no-dispatch, shared DNS+HTTP request budgets, strict runtime configuration, target-safe canonical output, conservative security-header outcomes and bounded unsigned RFC 9116 `security.txt` acceptance/rejection including stale data and denied cross-host redirects. No live DNS request or outbound socket was used; owned-target live HTTP/TLS integration evidence remains pending.

## Implemented trusted Guest supervisor runtime evidence

- A current approved GUEST_SAFE attempt produces one canonical, target-bound payload and a 60-second authenticated ResultEnvelope that passes the independent ingress verifier.
- The launch plan is frozen and excludes job ID, authorization reference, result credential and signing key; the key provider is not read until IPC, exit and output validation succeeds. Fresh-read and mounted-file tests cover approval/revocation reload, wrong policy/profile, exact 256-bit keys, copy isolation, strict JSON/size/path failures, symlink/TOCTOU design and POSIX permissions; the POSIX-only case is skipped on Windows and runs in Linux CI.
- Stale attempt/fence and non-Guest profiles cannot launch through this runtime.
- Malformed/throwing launchers and handles, invalid IPC, non-zero/signalled/malformed exit, changed canonical target, crossed deadline and unavailable/malformed signing keys fail with stable codes. Mounted-provider tests additionally cover active+retained verification-keyring rotation, 1–3-key bounds, duplicate versions, canonical 32-byte keys, strict fields, file limits and symlink/POSIX permission denial.
- Abort and rejected/unknown process state exercise bounded TERM→KILL escalation; a pending-launch negative proves cancellation returns promptly and kills a valid handle that resolves later.
- Result signing rejects unknown fields, invalid identifiers/times/key versions/key sizes and profile-overlimit payloads; returned payload/submission copies cannot mutate the signed snapshot.
- Scanner policy capabilities, budgets and artifact dependencies are immutable snapshots after authorization, closing mutation-after-check behavior.
- Supervisor/provider tests otherwise use injected fakes; the fixed-process adapter suite starts only the local Node executable to prove scanner-only stdin, clean exit/signal handling, exact artifact/policy binding, unsafe configuration denial and stable startup failure. Worker bootstrap tests reject unsafe paths/arguments, revoked/wrong-profile approval and signing keys absent or byte-different in the startup verification keyring. They perform no DNS query or outbound connection; managed secret/approval stores, container/egress isolation and production deployment remain pending.

## Implemented BullMQ Guest composition evidence

- Queue payload validation permits only schema version and a server-created GuestScan ID; target, policy, token, attempt, fence and credentials are absent.
- Processor tests cover claim/start ordering, terminal acknowledgement, held-lease retry, abort/no-commit on renewal loss, supervisor failure and persistence exceptions.
- Server-owned context tests bind the live lease to the fixed GUEST_SAFE policy and active approved artifact; malformed, wrong-profile and expired input fails closed. Redis configuration/runtime tests cover TLS/auth agreement, option-injection denial, bounded worker settings, exact adapter composition, stable lifecycle failures and malformed-handle cleanup.
- `pnpm verify:queue` runs against Redis 7.4 and proves one delivery for duplicate enqueue plus unrecoverable rejection of a foreign job without processor invocation. Unit and PostgreSQL tests also prove closed queue outcome aggregation, sensitive-field exclusion, stable pending replay after store failure, non-overlapping cadence/final shutdown flush, hostile adapter/reporter containment, alert constraints, immutability and exact 30-day pruning. The worker CLI is implemented but not deployed; production worker/export, managed secret store, sandbox and egress claims remain absent.

## Implemented Guest abuse and retention policy evidence

- New-scan policy enforces session/network burst, daily and concurrency ceilings plus a server-owned pause state over strict digest-only input.
- Raw IP, User-Agent, browser fingerprint, unknown fields, malformed/stale windows, invalid counters/digests/clocks and hostile getters fail closed.
- A valid live idempotent replay returns without reading abuse state or reserving another quota; create and expired replacement require abuse admission.
- Reservations bind the same authenticated session scope and transaction time as idempotency and enumerate all six atomic counter dimensions.
- Retention requires the original 30-minute result-access expiry and exact 24-hour deletion deadline; the exact boundary returns `DELETE_NOW`.
- The trusted-ingress adapter ignores spoofed forwarding data from untrusted peers, canonicalizes mapped addresses, walks only a bounded chain behind an exact proxy CIDR list and rejects missing/malformed/all-trusted chains, ports, zones and unknown fields.
- Domain-separated network-HMAC tests cover fixed vectors, key separation, IPv4 `/32`, IPv6 `/64`, active-first keyring order, retained-key limits, duplicate/missing/invalid keys and absence of raw address output.
- `0002_guest_abuse_counters.sql` stores fixed digest-only window/active rows, server pause state and a per-scan release record; no raw network/browser identifier column exists.
- Real PostgreSQL tests cover six-dimension atomic reservation, replay non-consumption, concurrent same-session admission, idempotent release, retained burst usage, pause, terminal-result release and rotation-safe aggregation where old+new digest usage reaches one shared limit while only the active digest is incremented.
- Bounded retention tests prove exact-deadline aggregate deletion, cascade cleanup, one-time active-counter reconciliation, expired-window pruning and `SKIP LOCKED` continuation. Runtime tests prove a bounded non-overlapping scheduler, partial drain, strict outcome validation and fail-closed storage; PostgreSQL tests prove immutable minimized 30-day run telemetry, exact replay, conflicting-ID denial and pruning.
- PostgreSQL cancellation tests cover QUEUED, LEASED and RUNNING jobs, exact attempt terminalization, one-time concurrency release, duplicate/concurrent convergence and strict malformed-input rejection. Twenty-five detached POST cases prove closed statuses, optional bounded `Retry-After`, privacy headers, origin/query/JSON/header limits, hostile-decision containment and production route absence; public registration, cancellation authorization and retention deployment/export remain pending.

## Proposed Weekly Digest blocking suite

Future implementation must pass `WEEKLY_DIGEST_SECURITY_TESTING.md`: cross-tenant rows/access, recipient injection/removal, concurrent issue/outbox replay, immutable rendering, stale-source uncertainty, content/evidence escaping, Risk isolation, capability entitlement, real-time/marketing separation, bounded scheduling and tenant API/WCAG negatives. Documentation is not runtime evidence.

## Planned Security Glossary blocking suite

Future implementation must pass `SECURITY_GLOSSARY_TESTING.md`: exact registry/seed validation, normalized search collisions/order/bounds, fail-closed API projections, hidden capability non-enumeration, no scanner/Risk/tenant coupling, safe rendering, canonical SEO and WCAG interaction/reflow. Documentation and archive copy are not runtime or claim evidence.

## Planned Security Check-ins blocking suite

Future post-B2 implementation must pass `SECURITY_CHECKINS_TESTING.md`: server-only answer/scoring confidentiality, immutable versions, current-user preference/progress authorization, eligibility/session/cooldown/idempotency races, no internal data, score/finding/notification isolation, safe analytics and accessible non-blocking UI. The supplied Cyberexam bank/O09 assertions are not implementation evidence.

## Planned Action & Change blocking suites

Deferred slices must pass `ACTION_CHANGE_TESTING.md`: tenant/action transition and assignment races, reported-vs-verified resolution, server-derived recheck authorization, compatible deterministic snapshot diffs, declared-ownership isolation, closed monitoring rules, TI/lifecycle uncertainty and absence of deferred data from Guest/public surfaces. Preview requires a separate later ADR/suite.

## Planned Promotions and Access Grants blocking suite

Future implementation must pass `PROMOTIONS_ACCESS_GRANTS_TESTING.md`: tenant/platform authz, secret handling, transactional capacity/idempotency, deterministic entitlement composition, expiry/revoke, safe API/UI/notification/analytics projection and strict separation from verification, consent, MonitoringEnrollment and scanner policy. `ADMIN_ATTESTED` remains a denied input unless a separate ADR is accepted.

## Release

Gate C requires lint, typecheck, tests, security negative suite, build, migrations, dependency/secret review and no unresolved Critical/High.
