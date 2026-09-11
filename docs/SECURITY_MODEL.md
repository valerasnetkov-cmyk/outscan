# Security model

## Assurance target

OUTSCAN is an internet-facing multi-tenant security product with privileged outbound probing. Guest checks are safe/non-intrusive, not purely passive.

Gate: `PRE_SCAFFOLD_GATE.md`.

## Ownership

`GLOBAL | PLATFORM | TENANT_ROOT | TENANT | PUBLIC_GUEST | CROSS_TENANT_GRANT | PLATFORM_GRANT`.

Every persistent entity is classified in DATA_MODEL/ADR 0010.

ADR 0015 separates notification ownership into account/user, tenant and platform contours. Recipient addresses/chat identities and Ops destinations are resolved from trusted server state, never accepted as privileged send targets from client payloads. Tenant membership is checked again for delayed delivery; account/technical policy is independent from marketing consent.

Customer and Ops Telegram use separate credentials and webhook secrets. Notification content is an allowlisted summary/link and excludes raw FindingEvidence, scanner payloads, headers, cookies and credentials. Provider uncertainty is explicit and cannot roll back the source transaction. The current pure foundation exposes no route, provider SDK or secret.

## Tenant

TENANT rows carry organization_id.
Tenant lookup + composite FK + PostgreSQL RLS.
Organization is TENANT_ROOT.

Customer Organization list/get/mutate access requires active membership in that exact Organization; Organization-table RLS/equivalent DB policy follows ADR 0010. Tenant-root UUID is not authorization.

Guest is PUBLIC_GUEST.
PartnerDelegation is CROSS_TENANT_GRANT.
SupportAccessGrant is PLATFORM_GRANT.
UUID is not authorization.

## Verification/auth

VerifiedScope V1 = EXACT_HOST only.
DNS challenge/revalidation per ADR 0009.

Every verified job:
`VerifiedScope ∩ profile policy ∩ entitlement ∩ consent ∩ current verification`.

IP/CIDR/Naabu/raw TCP/ACTIVE disabled.

## SSRF / pinning

Hostname only.
For every connect:

- resolve full A/AAAA;
- fail closed forbidden/ambiguous set;
- pin actual socket to validated IP;
- preserve Host/SNI/certificate hostname validation;
- repeat on retry/allowed redirect.

Guest cross-host redirect does not expand scope.

## Job integrity

ADR 0011:

- deterministic Guest-session-scoped idempotency;
- job/attempt FSM;
- CAS lease;
- monotonic fence;
- separate primary-commit and terminal-replay branches.

Primary commit requires RUNNING job/attempt plus current fence and unexpired lease/deadline.
After success, a same accepted attempt/fence/digest replay is acknowledged from stored terminal metadata without rewriting payload/domain rows.
Different digest conflict is audited before queue retry. The append-only PUBLIC_GUEST event is bound to the submitted scan/attempt/fence already present in that Guest aggregate, uses only a closed rejection code/security classification and contains no target, payload, digest, token or scanner output. Recording failure is fail-closed; insertion outside the aggregate's retention window is forbidden and the event cascades at deletion.

## Scanner

Supervisor owns queue/result credentials.
Scanner gets none, plus no private network/metadata.
Controlled egress/resource budgets outside user control.

## Capability policy

Versioned deny-by-default policy-as-code from ADR 0012.
Unknown capability = DENY.
HEADLESS_BROWSER is DENY in every V1 profile; consent does not override this.

The product-facing `ProductCapability` registry is presentation metadata only:

```text
ProductCapability/publicVisible
!= ScannerCapability permission
!= VerifiedScope
!= ScanAuthorization
```

The planned Security Glossary is another presentation-only registry. Public terms are approved structured plain text; related capabilities resolve only through the safe public capability projection. Glossary content cannot publish a capability, alter Risk/confidence, grant execution/scope or expose scanner internals/tenant data.

The planned Security Question Registry remains server-only: pre-answer projections exclude scoring, correct/best answers, critical flags and explanations. Check-in preference/progress is current-user-only GLOBAL data with no tenant/internal-system content; answers cannot change Findings, evidence, Risk/Scores, Monitoring, notifications, capability state or scan authority.

Deferred Action Center/Change/Triage metadata is TENANT-only and cannot manufacture technical state: reported remediation is not RESOLVED, declared ownership is not verification, missing/incompatible observations are not improvement and TI/lifecycle matches are not confirmation. Recheck/targeted execution derives the Asset target server-side and recomputes current EXACT_HOST scope, entitlement, authorization, policy and budgets.

Future Promotions/Access Grants are entitlement inputs only. Standard/campaign/direct-admin grants cannot create `DomainVerification` or `VerifiedScope`, select scanner behavior, supply consent or enroll monitoring. Accepted ADR-0009 has no `ADMIN_ATTESTED` path; any administrative proof-of-control exception remains fail-closed pending a separate accepted ADR. Expiry/revocation is checked at authorization time, tenant/platform roles stay separate and promo secrets never enter logs, analytics, notifications or scanner jobs.

Registry visibility cannot grant consent or entitlement, expand EXACT_HOST, authorize discovered subdomains, enable verified/controlled execution for Guest, or change the machine allow-list. Unknown scanner behavior remains denied regardless of product rollout state.

## Hostile output

All DNS/RDAP/HTTP/TLS/scanner/TI content is untrusted.
Bound/parse/validate/normalize/redact then context-safe render.
Protect XSS, CRLF/log, CSV, PDF/HTML injection and oversized output.

The implemented Guest projection starts from bounded bytes, uses fatal UTF-8 and JSON parsing with BOM/duplicate-key/depth rejection, then validates an exact allowlisted machine schema. Free-form candidate evidence may contain hostile markup, CRLF, spreadsheet formulas, CVE/version/endpoint data or secrets, but it is bounded and discarded rather than copied to the projection. The public-shaped result contains only canonical machine posture/coverage states and aggregate counts. It is deeply frozen before handoff. Persistence and context-specific UI/export encoding remain separate required layers.

The implemented ResultEnvelope verifier accepts an exact internal wrapper and requires a versioned domain-separated HMAC from the expected supervisor workload for the fixed result-ingress audience. Header authentication covers job/attempt/fence, issue/expiry, payload digest and size. MAC/key/identity/audience/time failures collapse to a stable authentication denial; payload size/digest failures cannot reach commit. Payload bytes are copied after MAC verification and only copy-on-read data is exposed.

The implemented GUEST_SAFE producer creates the bytes consumed by that verifier only after strict schema validation. It deterministically orders the closed machine schema and replaces hostile candidate evidence with a fixed marker before UTF-8 JSON serialization and SHA-256. Original CVE/endpoint/markup/CRLF/formula evidence therefore cannot enter the authenticated canonical payload.

The implemented scanner IPC reader treats every stream chunk and declared length as untrusted. A fixed magic/version and U32BE length are bounded before allocation; exactly one payload and EOF are required. Trailing bytes, a second frame, incomplete input, non-byte chunks and excessive fragmentation fail closed. One deadline covers header, payload and EOF, and AbortSignal cancellation triggers best-effort iterator termination. This is protocol/parser evidence only; child-process isolation and OS pipe ownership are still required.

The trusted Guest supervisor orchestration exposes only a frozen target/policy/artifact launch plan to an injected process boundary. Job identity, authorization reference and ResultEnvelope key are excluded. One deadline and AbortSignal bound launch, IPC and exit; a valid handle arriving after cancellation is killed. Successful bounded IPC, a clean exact process exit and output canonical-host equality are required before consulting the signing-key provider. The fixed process adapter independently revalidates the canonical host/policy and exact configured artifact, invokes a fixed absolute executable without a shell or inherited environment, caps spawn/input initialization at five seconds and serializes only bounded scanner input to stdin. Fresh-read provider wrappers accept only exact `outscan-v1`/`1.0.0`/`GUEST_SAFE` approval or revocation records and copied 256-bit signing keys; malformed, cross-profile, stale-format, throwing and extra-field values deny, and no approval/key is cached across calls. The worker also requires every fresh active signing key version and bytes to match its immutable startup verification keyring using constant-time comparison, so incomplete rotation fails closed. The HMAC signer emits a 60-second, copy-isolated ResultEnvelope for the fixed ingress audience. No actual secret store, approval store, container sandbox, egress policy or deployment is implied.

The internal worker composition keeps Redis connection state at the trusted worker boundary and supplies the scanner launcher only the existing non-secret launch plan. Redis configuration has an explicit TLS mode, rejects query/fragment option injection, bounds credentials/database/port and requires authenticated certificate-validating `rediss` when TLS is selected. PostgreSQL remains the attempt/fence authority; Redis never receives target, policy, token or signing material. No production network-isolation claim follows from this composition alone.

Mounted provider files use an exact versioned JSON envelope, fatal UTF-8, duplicate-key/depth checks and fixed size ceilings. Every access repeats lstat/open/fstat identity and size validation; symlinks and non-regular files deny. Positional reads allocate only the validated size plus one growth sentinel; truncation, excess bytes and observed post-read size/mtime/ctime/permission changes deny. This is not filesystem snapshot isolation. On POSIX, approvals reject group/world write and signing keys reject every group/world permission bit. Windows mode bits are not treated as ACL proof, and Kubernetes-style symlink mounts require a separately reviewed source adapter. Provider failures expose only unavailable state.

The detached offline container launcher is a host-authority adapter, not a public
broker or worker default. It validates the existing artifact/policy/input contract,
uses a fixed local Docker endpoint and non-overridable no-network container policy,
and requires run-identity-bound cleanup before acknowledging completion. Scanner
stdin contains no application credential and the Docker socket stays on the host.
Local synthetic-approval tests do not replace image promotion, a minimal scanner
image, launcher privilege review, live egress enforcement or crash reconciliation.

## Findings/scores

Condition OPEN|RESOLVED.
Occurrences record recurrence.
Events record transitions.
Disposition separate.
Coverage separate.

Automatic RESOLVED disabled until compatible policy/tests.

Asset Security Score requires SufficientBaselineV1.
Organization Security Score uses monitored assets only.

## Guest

Separate PUBLIC_GUEST.

Guest idempotency ownership uses a server-issued, MAC-authenticated 256-bit Guest-session cookie (`__Host-outscan_guest_session`) with Secure/HttpOnly/SameSite=Lax/Path=/ and no Domain attribute.
IP/NAT/User-Agent/browser fingerprint may support abuse controls but never authorize idempotent replay or token recovery.

Guest admission first classifies ADR-0011 idempotency. A valid live same-key/same-hash replay does not consume another new-scan quota; CREATE and expired replacement require an atomic reservation across session/network burst, daily and concurrency dimensions. The pure abuse input accepts only authenticated session-scope and server-derived HMAC network-signal digests; raw IP, User-Agent and browser fingerprint fields fail closed. The trusted-ingress adapter canonicalizes the socket peer, ignores forwarding metadata unless that peer belongs to a configured proxy CIDR, then walks at most eight `X-Forwarded-For` IP literals from right to left; missing/malformed data or a chain containing no untrusted client fails closed. Address/port, zone ID, unknown field and unbounded chain input is rejected. Versioned derivation canonicalizes IPv4-mapped addresses, buckets IPv4 at `/32` and IPv6 at `/64`, and returns only domain-separated HMAC digests. The signal is rate-control evidence only and grants no ownership. Persistence locks and sums live current/retained-key counters, increments only the active digest and releases by the digest captured in the reservation. A staged rollout must deploy dual-read before changing the active key and retain old keys for the 24-hour maximum abuse window plus skew; emergency removal intentionally fails closed or resets only under an audited operator decision.

Result token is replay-stable only inside the same Guest session/idempotency scope and original 30m access window. Token message serialization is versioned/domain-separated per ADR 0011; plaintext is not persisted.

The canonical cookie MAC, Guest-session scope digest and result-token codecs are implemented in `apps/api/src/guest-crypto`. They use strict canonical base64url, constant-time MAC/token comparison, bounded wire input and versioned keyrings. The HTTP boundary emits and validates the exact host-only Secure/HttpOnly/SameSite=Lax/Path=/ cookie without Domain, rejects malformed/duplicate Guest cookies and exposes only the authenticated scope digest. Its detached bootstrap and scan adapters require one exact configured HTTPS Origin; scan creation additionally rejects queries, non-JSON/oversized bodies, duplicate sensitive headers and any service result outside the closed public schema. Neither adapter is registered. Bootstrap and scan admission independently fresh-read and snapshot 1–3 exact 32-byte active/retained MAC keys before authentication; removal of a retained key denies its cookie on the next admission before revocation lookup, persistence or queue access. Bootstrap never refreshes a reused cookie, while missing/invalid/revoked credentials receive a new random scope and cannot recover old idempotency/result ownership; provider ambiguity fails closed. PostgreSQL stores only the scope digest and exact 24-hour revocation window, and scan creation independently awaits the same revocation provider: true denies as invalid session, while failure/non-boolean state is unavailable before persistence/queue. The internal creation composition otherwise snapshots canonical request input, uses the network digest only for admission, persists the session scope as idempotency ownership, and releases no token until the queue acknowledges the exact stable scan ID. Replay safely re-enqueues that ID without extending expiry. Mounted Guest-session and ResultEnvelope verification keyring readers accept only 1–3 unique bounded versions with exact 32-byte canonical keys, reject unknown/duplicate fields, symlinks and identity drift, and require owner-only POSIX permissions. Expired revocation cleanup runs inside the bounded retention scheduler and cleanup ambiguity becomes its closed unavailable alert. Managed production key provisioning and all public Guest route registration remain unimplemented.

Guest queue delivery carries only a server-created GuestScan ID. PostgreSQL claim/start/renew locks trusted rows and requires current job/attempt/fence plus the exact lease version; duplicate delivery cannot create a second live attempt. Expired attempts become terminal before a strictly greater fence is issued, and retry/access exhaustion releases abuse concurrency. The internal cancellation adapter also accepts only that ID after an upstream trusted decision: it locks job/current attempt, invalidates the attempt, terminalizes the job and releases concurrency atomically. A duplicate is idempotent and a concurrent result commit/cancel has only one terminal winner. No public cancellation route or ownership check exists yet, so this adapter must not receive direct client input. BullMQ messages, worker identity and client input cannot select a fence or revive terminal authority.

Durable Guest queue telemetry is a separate PLATFORM/INTERNAL projection of closed counters only. It has no GuestScan, tenant, target, session/network, payload, token, scanner or provider-controlled label; unknown outcomes/fields fail closed, counters saturate, exact batch replay is idempotent and conflicting identity is unavailable rather than overwritten. A storage failure preserves the pending snapshot. Periodic and shutdown flushes normalize hostile adapter output before invoking the closed reporter callback; production deployment and approved alert export remain unevidenced.

The Guest idempotency boundary builds its principal key only as `GUEST_SESSION:<authenticated scope digest>`. Inside the original exact 30-minute window, the same key/hash reproduces the token from persisted metadata without changing expiry; another hash conflicts, revocation blocks replay and unavailable retired keys fail closed. At/after expiry it replaces the row with a new anchored window. The concrete PostgreSQL adapter uses SERIALIZABLE transactions, a unique session-scope/operation/key constraint, bounded retry and winner reread; IDs/nonces/key version remain server dependencies. No IP/fingerprint ownership or in-memory correctness store is introduced.

Guest result access accepts the secret only as one canonical `Authorization: Bearer` value; the result endpoint contract rejects every query parameter, so the token cannot be transported in a URL. Token verification is bound to the route GuestScan ID and canonical persisted metadata. Expired, revoked, tampered, mismatched, unavailable-key, missing-resource and persistence-failed states collapse to the same enumeration-resistant `404 RESULT_ACCESS_DENIED`; malformed route/query is 400 and unexpected adapter/clock failure is a redacted 503. Success and all failures supply `Cache-Control: no-store` and `Referrer-Policy: no-referrer` and never return the bearer token. The shared metadata snapshot contains hostile getters/keyrings.

The pure Guest result builder accepts only that successful access record plus the exact sanitized scanner projection. It revalidates/snapshots both inputs, returns five fixed posture sections and every canonical coverage group, and marks absent or failed coverage explicitly. Raw evidence, individual Finding fields, severity, confidence, fingerprints and scanner timing/request data are not representable in the response. Database-backed lookup and a detached Fastify adapter exist; `buildApp()` still registers no Guest route, and context-specific rendering remains pending.

The internal GuestScan read service validates exact PUBLIC_GUEST aggregate, attempt and accepted-result shapes through immutable snapshots. A read is bound to the route ID, current token metadata, terminal accepted attempt/fence/digest, canonical target, completion chronology and fixed deletion deadline. Malformed bearer input is rejected before storage access; missing, malformed, cross-boundary, expired/revoked/deleted or dependency-failed reads collapse to `RESULT_ACCESS_DENIED`. ADR-0017 and the initial PostgreSQL migration enforce separate no-organization Guest tables, fixed-length secret digests/nonces, unique idempotency scope, chronology, deferred accepted-result identity, FSM/immutability guards and revoked default PUBLIC privileges. The concrete read adapter performs one parameterized ID lookup and maps it through the same strict snapshot; no public route is exposed.

The hostname/IDNA parser in `apps/api/src/target` is the implemented lexical boundary for future scan input. It emits only a validated lowercase ASCII `canonical_host` and rejects URL syntax, paths, ports, userinfo, standard/non-canonical IP literals and invalid DNS labels. It does not resolve or connect; full-set destination classification and connection pinning remain separate mandatory controls.

The destination-classification half of that boundary is also implemented as versioned policy `iana-special-purpose-2025-10-09.v1`. It accepts only a bounded non-empty A/AAAA array, canonicalizes/deduplicates it and denies the complete operation if any member is malformed, special-purpose, non-global IPv6, metadata/control-address or covered by a configured internal CIDR. Configuration is additive deny-only and malformed configuration denies execution.

The injected resolver orchestration validates both family responses and their TTL values before invoking that policy. It fails closed on transport/service errors, rejects contradictory NXDOMAIN/data outcomes, exposes no hostile resolver error detail and freezes the approved target.

Runtime DNS construction uses an exact bounded policy with explicit literal-IP servers and timeout/tries ceilings. Invalid getters/proxies, duplicate or hostname-based servers and initialization errors fail closed. The mutable Node Resolver remains private behind a frozen A/AAAA-only facade, preventing downstream server replacement or capability expansion. Environment parsing, process lifecycle wiring and DNS freshness/caching policy remain unimplemented.

Resolved targets are now bounded by the minimum returned DNS TTL. The pinned request-options boundary rejects stale/impossible timestamps, revalidates current destination policy including configured internal CIDRs and refuses any selected address outside the approved set. Its custom lookup callback yields only the selected IP while HTTP Host, TLS SNI and Node certificate hostname verification use the canonical hostname. It disables connection pooling and permissive HTTP parsing.

The transport dispatch verifies the actual connected address before accepting a response, applies a hard deadline and bounded header/body parsing, rejects conflicting or malformed HTTP framing and exposes only stable error codes. Redirects are returned without automatic follow.

The safe HTTP flow performs a fresh full-set resolve/policy decision/pin before each retry and allowed same-host redirect. Cross-host redirects stop without follow, and HTTPS downgrade, userinfo, non-default ports, malformed locations and budget overruns fail closed. Current evidence uses injected DNS/transport/socket doubles; owned-target live socket/TLS verification remains required before Gate B1.

The minimal first-party Guest scanner composes that flow in a credential-free process. It independently requires exact current GUEST_SAFE policy and the DNS/TLS/HTTP capability subset, counts both DNS family lookups and HTTPS dispatches against the active request budget, disables inner transport retries and never projects resolved addresses, response headers or body bytes. A versioned runtime configuration snapshots up to 128 deployment-specific internal CIDRs; malformed, sparse and duplicate ranges fail closed, and configured or built-in forbidden resolution returns unavailable coverage without dispatch. HSTS/CSP/frame/nosniff/referrer/permissions outcomes use a conservative fail-closed accepted subset: ineffective, ambiguous, duplicate or permissive values cannot become PASS. The `security.txt` probe is separately pinned to HTTPS and the same canonical host, caps hostile input at 32 KiB/1,000 lines/2,048 bytes per line and publishes only PASS/ATTENTION. Cross-host redirect, stale or malformed content cannot pass, and the file never implies scan permission. These are not full browser or signed-security.txt parsers. Absent detectors cannot be promoted to successful coverage. Container/OS isolation, enforced egress and live-target evidence remain external Gate B1 controls.

External integrations are discovery boundaries, not execution boundaries. The Yandex Metrika foundation requests only `metrika:read`, uses one-time bounded OAuth state with PKCE, sends credentials only from the application backend to the fixed Management API origin and rejects unbounded/malformed responses. Token exchange/storage and tenant routes remain absent. Candidate visibility or import can never create VerifiedScope, ScanAuthorization or change ADR-0012 policy; scanner workers must never receive provider credentials.
Guest retention metadata requires the original 30-minute result-access expiry and exact `created_at + 24h` deletion deadline. At the deadline the aggregate is delete-due. The PostgreSQL worker deletes bounded due batches regardless of quota-metadata consistency. A non-overlapping scheduler persists only bounded PLATFORM/INTERNAL counters and closed inconsistency/unavailable alert state for 30 days; it never copies Guest identity, target, session/network digests or scanner data. Production deployment and external alert export remain pending.

The proposed Weekly Digest is TENANT-only and resolves data, issue access and recipients through exact organization scope/current membership. It freezes allowlisted typed facts, treats external text/source health as untrusted, excludes evidence/secrets and cannot change Risk, capability execution, verification or scan authorization. No runtime surface exists before ADR-0016 acceptance and Workspace/notification prerequisites.
No-store/no-referrer where applicable.

## Admin

Separate Platform authz.
Before production: MFA, step-up, PlatformAuditLog, scoped/expiring SupportAccessGrant.

## Claims

Runtime/public content follows CLAIM_INVENTORY.

## Release

A before scaffold, B1 Guest, B2 Workspace, C production.
Production FAIL for Critical/High, tenant/RLS failure, SSRF/pinning failure, scanner boundary failure, result integrity failure, unsafe output, Admin control failure or uncontained secret.
