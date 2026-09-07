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
Different digest conflict is audited.

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

The trusted Guest supervisor orchestration exposes only a frozen target/policy/artifact launch plan to an injected process boundary. Job identity, authorization reference and ResultEnvelope key are excluded. It requires successful bounded IPC, a clean exact process exit and output canonical-host equality before consulting the signing-key provider. The HMAC signer emits a 60-second, copy-isolated ResultEnvelope for the fixed ingress audience. Abort, deadline, malformed handle/exit/output and key failure deny; failed or unknown process state uses bounded TERM→KILL escalation. No production process adapter, secret manager, queue or persistence is implied.

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

Guest admission first classifies ADR-0011 idempotency. A valid live same-key/same-hash replay does not consume another new-scan quota; CREATE and expired replacement require an atomic reservation across session/network burst, daily and concurrency dimensions. The pure abuse input accepts only authenticated session-scope and server-derived HMAC network-signal digests; raw IP, User-Agent and browser fingerprint fields fail closed. The versioned derivation accepts an exact trusted-ingress address plus a 256-bit server key, canonicalizes IPv4-mapped addresses, uses IPv4 `/32` or IPv6 `/64`, and returns only a domain-separated HMAC digest. Forwarded-header fields and address/port strings fail closed. The signal is rate-control evidence only and grants no ownership. Production ingress must establish the address through trusted socket/proxy metadata; persistence atomically re-checks/increments/releases counters, and bounded retention batches expire due aggregates/windows.

Result token is replay-stable only inside the same Guest session/idempotency scope and original 30m access window. Token message serialization is versioned/domain-separated per ADR 0011; plaintext is not persisted.

The canonical cookie MAC, Guest-session scope digest and result-token codecs are implemented in `apps/api/src/guest-crypto`. They use strict canonical base64url, constant-time MAC/token comparison, bounded wire input and versioned keyrings. The HTTP boundary emits the exact host-only Secure/HttpOnly/SameSite=Lax/Path=/ cookie without Domain, rejects malformed/duplicate Guest cookies and exposes only the authenticated scope digest. Revocation is checked by that digest; removed key versions fail closed. Scan/result/abuse persistence exists, while session-revocation storage and all public Guest routes remain unimplemented.

The Guest idempotency boundary builds its principal key only as `GUEST_SESSION:<authenticated scope digest>`. Inside the original exact 30-minute window, the same key/hash reproduces the token from persisted metadata without changing expiry; another hash conflicts, revocation blocks replay and unavailable retired keys fail closed. At/after expiry it replaces the row with a new anchored window. The concrete PostgreSQL adapter uses SERIALIZABLE transactions, a unique session-scope/operation/key constraint, bounded retry and winner reread; IDs/nonces/key version remain server dependencies. No IP/fingerprint ownership or in-memory correctness store is introduced.

Guest result access accepts the secret only as one canonical `Authorization: Bearer` value; the result endpoint contract rejects every query parameter, so the token cannot be transported in a URL. Token verification is bound to the route GuestScan ID and canonical persisted metadata. Expired, revoked, tampered, mismatched and unavailable-key states collapse to one public denial. Successful access supplies `Cache-Control: no-store` and `Referrer-Policy: no-referrer` and never returns the bearer token. The shared metadata snapshot contains hostile getters/keyrings.

The pure Guest result builder accepts only that successful access record plus the exact sanitized scanner projection. It revalidates/snapshots both inputs, returns five fixed posture sections and every canonical coverage group, and marks absent or failed coverage explicitly. Raw evidence, individual Finding fields, severity, confidence, fingerprints and scanner timing/request data are not representable in the response. Database-backed lookup by authorized GuestScan ID exists; the HTTP route and context-specific rendering remain pending.

The internal GuestScan read service validates exact PUBLIC_GUEST aggregate, attempt and accepted-result shapes through immutable snapshots. A read is bound to the route ID, current token metadata, terminal accepted attempt/fence/digest, canonical target, completion chronology and fixed deletion deadline. Malformed bearer input is rejected before storage access; missing, malformed, cross-boundary, expired/revoked/deleted or dependency-failed reads collapse to `RESULT_ACCESS_DENIED`. ADR-0017 and the initial PostgreSQL migration enforce separate no-organization Guest tables, fixed-length secret digests/nonces, unique idempotency scope, chronology, deferred accepted-result identity, FSM/immutability guards and revoked default PUBLIC privileges. The concrete read adapter performs one parameterized ID lookup and maps it through the same strict snapshot; no public route is exposed.

The hostname/IDNA parser in `apps/api/src/target` is the implemented lexical boundary for future scan input. It emits only a validated lowercase ASCII `canonical_host` and rejects URL syntax, paths, ports, userinfo, standard/non-canonical IP literals and invalid DNS labels. It does not resolve or connect; full-set destination classification and connection pinning remain separate mandatory controls.

The destination-classification half of that boundary is also implemented as versioned policy `iana-special-purpose-2025-10-09.v1`. It accepts only a bounded non-empty A/AAAA array, canonicalizes/deduplicates it and denies the complete operation if any member is malformed, special-purpose, non-global IPv6, metadata/control-address or covered by a configured internal CIDR. Configuration is additive deny-only and malformed configuration denies execution.

The injected resolver orchestration validates both family responses and their TTL values before invoking that policy. It fails closed on transport/service errors, rejects contradictory NXDOMAIN/data outcomes, exposes no hostile resolver error detail and freezes the approved target.

Runtime DNS construction uses an exact bounded policy with explicit literal-IP servers and timeout/tries ceilings. Invalid getters/proxies, duplicate or hostname-based servers and initialization errors fail closed. The mutable Node Resolver remains private behind a frozen A/AAAA-only facade, preventing downstream server replacement or capability expansion. Environment parsing, process lifecycle wiring and DNS freshness/caching policy remain unimplemented.

Resolved targets are now bounded by the minimum returned DNS TTL. The pinned request-options boundary rejects stale/impossible timestamps, revalidates current destination policy including configured internal CIDRs and refuses any selected address outside the approved set. Its custom lookup callback yields only the selected IP while HTTP Host, TLS SNI and Node certificate hostname verification use the canonical hostname. It disables connection pooling and permissive HTTP parsing.

The transport dispatch verifies the actual connected address before accepting a response, applies a hard deadline and bounded header/body parsing, rejects conflicting or malformed HTTP framing and exposes only stable error codes. Redirects are returned without automatic follow.

The safe HTTP flow performs a fresh full-set resolve/policy decision/pin before each retry and allowed same-host redirect. Cross-host redirects stop without follow, and HTTPS downgrade, userinfo, non-default ports, malformed locations and budget overruns fail closed. Current evidence uses injected DNS/transport/socket doubles; owned-target live socket/TLS verification remains required before Gate B1.

External integrations are discovery boundaries, not execution boundaries. The Yandex Metrika foundation requests only `metrika:read`, uses one-time bounded OAuth state with PKCE, sends credentials only from the application backend to the fixed Management API origin and rejects unbounded/malformed responses. Token exchange/storage and tenant routes remain absent. Candidate visibility or import can never create VerifiedScope, ScanAuthorization or change ADR-0012 policy; scanner workers must never receive provider credentials.
Guest retention metadata requires the original 30-minute result-access expiry and exact `created_at + 24h` deletion deadline. At the deadline the aggregate is delete-due. The PostgreSQL worker deletes bounded due batches regardless of quota-metadata consistency and reports an alert when reconciliation is incomplete; production scheduling and durable deletion metrics remain pending.

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
