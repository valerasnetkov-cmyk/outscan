# ADR 0012: Trusted supervisor and versioned scanner capability policy

**Status:** Accepted
**Accepted:** 2026-09-03
**Date:** 2026-09-03
**Owner:** Security / Infra

## Trust boundary

`API → BullMQ → trusted dispatcher/supervisor → disposable scanner process/container`.

Supervisor owns queue/result identity, policy, budgets and authenticated ResultEnvelope.

Scanner receives:

- no Redis;
- no DB;
- no Result Ingress credential;
- no application private network;
- no metadata;
- controlled Internet egress only.

Scanner output uses bounded local IPC.

V1 local IPC is a single-result binary frame:

`ASCII("OUTSCAN:SCANNER_RESULT:v1\0") || U32BE(payload_length) || payload || EOF`.

The supervisor checks the declared unsigned length against the active profile's scanner-output ceiling before allocation. One frame only is accepted; invalid magic/version, zero or excessive length, early EOF, trailing bytes and another frame fail closed. One deadline covers header, payload and EOF. Cancellation terminates reading and requests producer shutdown. Fragmentation is bounded independently from payload bytes. The scanner receives no response channel carrying credentials or trusted state.

## Capability classes

| Capability                | Meaning                              |
| ------------------------- | ------------------------------------ |
| DNS_READ                  | public DNS queries                   |
| RDAP_READ                 | public RDAP                          |
| PASSIVE_CT_READ           | CT/passive source query              |
| TLS_HANDSHAKE             | TLS/certificate observation          |
| HTTP_GET_HEAD             | bounded GET/HEAD                     |
| SAME_HOST_REDIRECT        | same canonical host redirect         |
| HTTP_HEADER_OBSERVE       | response headers/cookies             |
| TECH_FINGERPRINT_SAFE     | non-intrusive fingerprint            |
| NUCLEI_SAFE_HTTP          | approved read-only Nuclei HTTP       |
| BOUNDED_SAME_ORIGIN_CRAWL | limited same-origin crawl            |
| HEADLESS_BROWSER          | browser execution                    |
| HTTP_STATE_CHANGE         | POST/PUT/PATCH/DELETE or equivalent  |
| AUTHENTICATED_REQUEST     | customer credential/session use      |
| OOB_CALLBACK              | external callback behavior           |
| JAVASCRIPT_TEMPLATE       | template JS                          |
| CODE_EXECUTION            | local code execution                 |
| FUZZING                   | generated mutation/fuzz              |
| BRUTE_FORCE               | brute-force behavior                 |
| RAW_TCP                   | arbitrary TCP protocol/connect       |
| PORT_ENUMERATION          | systematic port discovery            |
| PAYLOAD_GENERATION        | arbitrary exploit payload generation |
| DESTRUCTIVE               | destructive/DoS behavior             |
| UNKNOWN                   | unclassified capability              |

## Profile matrix

Legend: `ALLOW`, `DENY`.

| Capability                | GUEST_SAFE | VERIFIED_BASELINE | CONTROLLED_DEEP | ACTIVE |
| ------------------------- | ---------- | ----------------- | --------------- | ------ |
| DNS_READ                  | ALLOW      | ALLOW             | ALLOW           | DENY   |
| RDAP_READ                 | ALLOW      | ALLOW             | ALLOW           | DENY   |
| PASSIVE_CT_READ           | ALLOW      | ALLOW             | ALLOW           | DENY   |
| TLS_HANDSHAKE             | ALLOW      | ALLOW             | ALLOW           | DENY   |
| HTTP_GET_HEAD             | ALLOW      | ALLOW             | ALLOW           | DENY   |
| SAME_HOST_REDIRECT        | ALLOW      | ALLOW             | ALLOW           | DENY   |
| HTTP_HEADER_OBSERVE       | ALLOW      | ALLOW             | ALLOW           | DENY   |
| TECH_FINGERPRINT_SAFE     | ALLOW      | ALLOW             | ALLOW           | DENY   |
| NUCLEI_SAFE_HTTP          | DENY       | ALLOW             | ALLOW           | DENY   |
| BOUNDED_SAME_ORIGIN_CRAWL | DENY       | ALLOW             | ALLOW           | DENY   |
| HEADLESS_BROWSER          | DENY       | DENY              | DENY            | DENY   |
| HTTP_STATE_CHANGE         | DENY       | DENY              | DENY            | DENY   |
| AUTHENTICATED_REQUEST     | DENY       | DENY              | DENY            | DENY   |
| OOB_CALLBACK              | DENY       | DENY              | DENY            | DENY   |
| JAVASCRIPT_TEMPLATE       | DENY       | DENY              | DENY            | DENY   |
| CODE_EXECUTION            | DENY       | DENY              | DENY            | DENY   |
| FUZZING                   | DENY       | DENY              | DENY            | DENY   |
| BRUTE_FORCE               | DENY       | DENY              | DENY            | DENY   |
| RAW_TCP                   | DENY       | DENY              | DENY            | DENY   |
| PORT_ENUMERATION          | DENY       | DENY              | DENY            | DENY   |
| PAYLOAD_GENERATION        | DENY       | DENY              | DENY            | DENY   |
| DESTRUCTIVE               | DENY       | DENY              | DENY            | DENY   |
| UNKNOWN                   | DENY       | DENY              | DENY            | DENY   |

## Headless decision

`HEADLESS_BROWSER` is **DENY for all V1 profiles**, including CONTROLLED_DEEP.

Reason: a general browser can create cross-origin subresource requests, redirects, WebSocket connections, service-worker/network behavior and browser-managed DNS that are not covered by the exact-host pinned-connection contract.

Headless may be reconsidered only through a separate ADR defining:

- request interception for every browser network request;
- exact-host/scheme/port restrictions;
- blocked cross-origin subresources and WebSockets unless separately authorized;
- validated-IP pinning or equivalent enforceable egress mediation per request;
- DNS rebinding protection;
- redirect policy;
- service-worker/cache isolation;
- browser sandbox/resource limits;
- negative tests.

Consent alone never authorizes uncontrolled browser egress.

## V1 budgets

| Budget              | GUEST_SAFE | VERIFIED_BASELINE | CONTROLLED_DEEP |
| ------------------- | ---------: | ----------------: | --------------: |
| hard duration       |        30s |              120s |            300s |
| outbound requests   |         40 |               300 |            1200 |
| concurrency         |          4 |                 8 |              10 |
| redirects/chain     |          5 |                 5 |               5 |
| single response     |       1MiB |              2MiB |            2MiB |
| aggregate responses |       8MiB |             64MiB |          192MiB |
| scanner output      |       2MiB |             12MiB |           32MiB |
| crawl URLs          |          0 |               100 |             500 |

These are safety ceilings, not marketing promises. Change requires a new policy version.

## Machine-readable schema

Logical V1 shape:

```yaml
schema_version: 1
policy_id: outscan-v1
policy_version: 1.0.0
profiles:
  GUEST_SAFE:
    allowed_capabilities:
      - DNS_READ
      - RDAP_READ
      - PASSIVE_CT_READ
      - TLS_HANDSHAKE
      - HTTP_GET_HEAD
      - SAME_HOST_REDIRECT
      - HTTP_HEADER_OBSERVE
      - TECH_FINGERPRINT_SAFE
    budgets:
      hard_duration_seconds: 30
      max_requests: 40
      max_concurrency: 4
      max_redirects: 5
      max_response_bytes: 1048576
      max_total_response_bytes: 8388608
      max_output_bytes: 2097152
      max_crawl_urls: 0
```

Implementation must provide JSON Schema or equivalent runtime validation before B1.
Unknown fields/capabilities fail closed.

The product-facing `ProductCapability` registry is metadata only and is not the `ScannerCapability` policy defined by this ADR. Product release or visibility state cannot expand the machine allow-list, VerifiedScope or ScanAuthorization.

## Template approval identity

Bind approval to:

- template/workflow digest;
- transitive dependency digests;
- engine version;
- scanner image digest;
- config version;
- policy/profile versions.

Any relevant change invalidates approval.

## Output/result

Scanner output:
`hard limit → parse → schema validate → normalize → redact → bounded persistence`.

Scanner adapter returns ScannerResultEnvelope.
Supervisor wraps it as ResultEnvelope.payload.

## Required tests

- unknown capability denied;
- HEADLESS denied in every V1 profile;
- profile matrix enforced;
- budgets enforced for full workflow;
- scanner cannot reach Redis/DB/internal/metadata;
- digest/dependency changes invalidate approval;
- hostile output sanitized;
- output over limit rejected.

## Implemented Guest supervisor orchestration evidence

`apps/api/src/supervisor/run-guest.ts` composes the accepted pre-launch decision with an injected process launcher, the bounded IPC reader, canonical GUEST_SAFE producer and supervisor-only ResultEnvelope signer. The frozen launch plan omits job identity, authorization reference and signing material. The result key is requested only after a clean exact exit and target-bound canonical output. One deadline/AbortSignal covers execution; rejected or unknown process state requests bounded TERM→KILL shutdown. Policy, budgets, capabilities and artifact identity are immutable post-authorization snapshots.

Tests use local process/key-provider fakes and start no child process, container, queue, DNS or network operation. Production isolation/egress, OS pipe adapter, secret-manager rotation provider, CAS state transitions and transactional result submission remain required before Gate B1.
