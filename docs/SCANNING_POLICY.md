# Scanning policy

## Terminology

Guest scanning is **safe/non-intrusive**, not purely passive.

Use `passive` only for sources that do not probe the target directly, such as public CT/RDAP/passive-intelligence sources.

HTTP/TLS/DNS queries are network requests even when low-risk/non-intrusive.

Normative: ADR 0009 and ADR 0012.

## V1 target

Hostname/domain only.
Reject URL/path/port/userinfo/IP literal.
Normalize IDNA/Punycode, lowercase, trailing dot.

The pure canonicalizer in `apps/api/src/target` implements this input boundary. It trims surrounding whitespace, rejects non-host syntax and IP literals, converts IDN input to ASCII, lowercases it, removes one trailing dot and validates DNS label/total lengths. It performs no DNS or network access.

The same module implements destination policy `iana-special-purpose-2025-10-09.v1`. It bounds, parses, canonicalizes and deduplicates the entire resolver result before making one decision. Any malformed member or any built-in/configured forbidden range rejects the whole set. Built-in policy conservatively denies the IANA IPv4/IPv6 special-purpose space, IPv6 outside global unicast, multicast, private/shared/link-local/documentation/benchmark/translation/mapped ranges and known platform metadata/control addresses. Configured internal CIDRs are deny-only; malformed policy configuration fails closed.

`apps/api/src/target/resolver.ts` implements the orchestration boundary against an injected DNS client. It accepts only an already canonical host, starts A and AAAA queries together with TTL results enabled, validates exact result shapes/families/uint32 TTL values, treats ENODATA as an absent family, fails operational errors closed and rejects NXDOMAIN mixed with actual data as inconsistent. The frozen success object contains only the approved deduplicated set and the minimum observed TTL.

`apps/api/src/target/runtime-dns.ts` constructs the V1 runtime client only from an exact bounded configuration: one to four literal-IP DNS servers, 100–5000ms query timeout, one to three tries and 100–10000ms maximum retry timeout not below the query timeout. Hostname servers, zone IDs, invalid/non-canonical ports, duplicates and malformed/hostile objects fail closed. The configured Node Resolver is never returned directly; consumers receive only a frozen `resolve4`/`resolve6` facade and cannot replace servers. Environment parsing and lifecycle wiring remain pending.

Approved resolution output carries `resolved_at_unix_ms` and `expires_at_unix_ms`, derived from the minimum TTL across both families. `apps/api/src/target/pinned-request.ts` refuses use before creation or at/after expiry, revalidates the full address set and current policy, requires the selected pin to be a member and creates only GET/HEAD options for fixed ports 80/443. Its lookup callback returns exactly that IP and rejects hostname/family substitution. HTTP Host and TLS SNI remain `canonical_host`; TLS chain and hostname verification stay enabled through Node's standard `checkServerIdentity` against `canonical_host`.

`apps/api/src/target/pinned-transport.ts` executes those options with connection pooling disabled, then requires the observed `socket.remoteAddress` to equal the canonical selected pin before accepting a response. It applies one hard wall-clock deadline, Node and application header limits, an application body limit, strict status/header/Content-Length framing checks and stable redacted failure codes. Redirect responses are returned as bounded data and are never followed automatically.

`apps/api/src/target/safe-http-flow.ts` owns bounded retry and redirect behavior. Before every retry and followed redirect it performs a new dual-family resolution, full-set policy decision and pin selection. Only normalized same-host HTTP(S) destinations on fixed default ports may be followed; HTTPS downgrade, userinfo, non-default ports, malformed/duplicate locations and redirect/aggregate/deadline budget overruns fail closed. Cross-host redirects stop automatic execution without expanding scope. Live socket/TLS evidence remains pending.

## Destination

Every probe:

1. resolve full A/AAAA set;
2. fail closed if any destination is forbidden/ambiguous;
3. select validated public IP;
4. pin connection to that IP;
5. preserve Host/SNI/certificate hostname validation;
6. repeat on retry/allowed redirect.

Guest cross-host redirect is reported, not followed.

## Scope

VerifiedScope V1 = EXACT_HOST only.
DOMAIN_SUBTREE/IP/CIDR disabled.
No implicit CNAME/CDN/shared-IP/subdomain authorization.

Execution-time:
`VerifiedScope ∩ profile policy ∩ entitlement ∩ consent ∩ current verification`.

## DNS verification

`_outscan-challenge.<host> TXT "outscan-verification=v1:<challenge_id>:<token>"`.

Challenge TTL 24h.
Scope revalidation:

- normal 7d;
- before Controlled Deep if last success >24h;
- hard expiry 30d without successful revalidation;
- failed due revalidation → STALE and scan blocked.

TXT remains published while scope active.

## Capabilities

Defined in ADR 0012.

`ProductCapability` metadata may describe an OUTSCAN product function but never changes SAFE/CONTROLLED/ACTIVE/DISABLED machine classification, profile authorization or the ADR-0012 `ScannerCapability` allow-list. Engine bindings remain descriptive until the corresponding approved profile and execution authorization independently permit them.

Likewise, an External Asset Source or `AssetCandidate` supplies discovery provenance only. Yandex Metrika access and a future import action do not verify scope or authorize execution. `QUICK_SCAN` is product wording for a request constrained to the existing `GUEST_SAFE` profile; it is not another profile and cannot bypass a fresh `ScanAuthorization` decision.

### GUEST_SAFE

ALLOW:
DNS_READ, RDAP_READ, PASSIVE_CT_READ, TLS_HANDSHAKE, HTTP_GET_HEAD, SAME_HOST_REDIRECT, HTTP_HEADER_OBSERVE, TECH_FINGERPRINT_SAFE.

### VERIFIED_BASELINE

Adds:
NUCLEI_SAFE_HTTP, BOUNDED_SAME_ORIGIN_CRAWL.

### CONTROLLED_DEEP

Uses only capabilities explicitly marked ALLOW for CONTROLLED_DEEP in ADR 0012.

`HEADLESS_BROWSER` remains DENY in V1. Consent does not override that deny because general browser egress is not compatible with the V1 exact-host connection-pinning contract.

### V1 DENY

HTTP_STATE_CHANGE, AUTHENTICATED_REQUEST, OOB_CALLBACK, JAVASCRIPT_TEMPLATE, CODE_EXECUTION, FUZZING, BRUTE_FORCE, RAW_TCP, PORT_ENUMERATION, PAYLOAD_GENERATION, DESTRUCTIVE, UNKNOWN.

ACTIVE disabled.

## Safety ceilings

| Budget             | Guest | Baseline | Controlled |
| ------------------ | ----: | -------: | ---------: |
| duration           |   30s |     120s |       300s |
| requests           |    40 |      300 |       1200 |
| concurrency        |     4 |        8 |         10 |
| redirects          |     5 |        5 |          5 |
| single response    |  1MiB |     2MiB |       2MiB |
| aggregate response |  8MiB |    64MiB |     192MiB |
| output             |  2MiB |    12MiB |      32MiB |
| crawl URLs         |     0 |      100 |        500 |

Versioned machine policy. Unknown capability/field fails closed.

## V1 policy implementation

The canonical runtime validator is implemented in `apps/api/src/scanner-policy`.

- accepted input has an exact closed shape and current schema/policy identity;
- capabilities are checked against the complete profile matrix;
- all workflow budget fields are required and capped by profile;
- unknown fields, profiles and capabilities fail closed;
- `ACTIVE`, `HEADLESS_BROWSER` and every denied capability remain non-overridable.

The validator is consumed by the trusted supervisor pre-launch and GUEST_SAFE orchestration boundaries in `apps/api/src/supervisor`. Authorized capabilities, budgets and artifact identity are immutable snapshots before an injected launcher is called. No production scanner adapter or public route is exposed yet.

## Guest posture

Allowed: DNS/domain, mail policy, RDAP, public infrastructure, TLS/certificate, HTTP headers/cookies/protocol, CDN/WAF/safe technology, security.txt, aggregate CT.

Never expose subdomain list/CVE/endpoints/vulnerable versions/raw evidence.

## Nuclei governance

Pinned approved template/workflow digests and dependencies.
No runtime arbitrary community download/execute.

Promotion:
`new bundle → staging → capability/source review → regression → owned canary → approval → production`.

## Output

Untrusted:
`bytes → limit → parse → schema validate → normalize → redact → bounded persistence → context-safe rendering`.

Adapters return ScannerResultEnvelope. Supervisor wraps as ResultEnvelope.payload.

`apps/api/src/scanner-output` implements the first GUEST_SAFE hostile-output projection. It rejects oversized bytes before parsing, invalid UTF-8/BOM/JSON, duplicate JSON keys, nesting beyond 32 levels, unknown or duplicate schema fields/codes and collections above fixed ceilings. Execution metadata is bound to `GUEST_SAFE`, current policy identity and Guest duration/request budgets. Internal finding evidence is bounded during validation and then discarded; only a deduplicated potential-risk count reaches the Guest projection.

`apps/api/src/result-envelope` implements the separate authenticated result-ingress primitive. A versioned HMAC message binds exact job/attempt/fence, expected supervisor workload identity, fixed ingress audience, issue/expiry, payload SHA-256 and byte size. Unknown fields, non-canonical MAC encoding, unavailable/short keys, identity/audience mismatch, expiry/skew, excessive payload and digest/size mismatch fail closed. The third-party scanner receives neither the HMAC key nor an ingress credential.

The GUEST_SAFE canonical producer runs only after strict hostile-output validation. It snapshots input, deterministically orders the closed schema, replaces every candidate evidence value with a fixed redaction marker, serializes minified UTF-8 JSON and computes SHA-256/size over exactly those bytes. It returns copies rather than mutable internal storage.

The implemented local IPC protocol accepts exactly one `OUTSCAN:SCANNER_RESULT:v1\0 || U32BE(payload_length) || payload || EOF` frame. Declared length is checked against the active profile ceiling before payload allocation. Invalid magic/version/zero length, incomplete frames, trailing bytes, multiple frames, excessive chunk fragmentation, stream errors, abort and one overall deadline fail with stable codes. The reader cancels the iterator best-effort on failure and returns only copy-on-read bytes.

The Guest supervisor orchestration composes authorization, an injected launcher, IPC, process-exit validation, canonical GUEST_SAFE output and authenticated ResultEnvelope signing. One deadline and AbortSignal govern the run; failed streams or unknown process state request TERM and then KILL after a bounded grace. The launch plan contains no job ID, authorization reference, result credential or signing key. The key provider is consulted only after a clean exit and accepted canonical target-bound output. Production process/container isolation, secret-manager provisioning and transactional commit remain required Gate B1 work.
