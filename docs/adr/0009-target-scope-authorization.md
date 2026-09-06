# ADR 0009: V1 target, DNS verification, connection pinning and ScanAuthorization

**Status:** Accepted
**Accepted:** 2026-09-03
**Date:** 2026-09-03
**Owner:** Security / Architecture

## V1 target grammar

Accepted: hostname/domain only.
Rejected: scheme/URL, path/query/fragment, explicit port, userinfo, IPv4/IPv6 literal.

Canonicalization:
`trim → reject URL/IP forms → IDNA/Punycode → lowercase → strip trailing dot → validate DNS hostname → canonical_host`.

## Resolution and connection pinning

For every connection attempt:

1. resolve current A and AAAA;
2. normalize/deduplicate addresses;
3. classify the **entire resolved set**;
4. if any address is forbidden/ambiguous, fail closed for the operation;
5. choose only from the validated public set;
6. connect to the chosen **validated IP directly/pinned** without another uncontrolled DNS lookup.

Forbidden includes loopback/private/link-local/unspecified/multicast/metadata/configured internal ranges.

The connection preserves:

- HTTP `Host = canonical_host`;
- TLS SNI = `canonical_host`;
- certificate hostname validation against `canonical_host`.

A library that cannot guarantee pinned destination plus correct Host/SNI/certificate checks must not be used.

Every retry repeats resolution, full-set validation and pinning.

## Redirects

Guest V1 may follow same-host redirects within budget.
For every redirect:

- normalize destination;
- if host changes, stop Guest automatic follow and report only;
- same host repeats resolution/validation/pinning.

Cross-host redirect never expands target or VerifiedScope.

## DNS TXT verification

Record:

```text
_outscan-challenge.<canonical_host>
TXT "outscan-verification=v1:<challenge_id>:<token>"
```

Binding:

- organization_id;
- asset_id;
- canonical_host;
- challenge_id;
- token_hash;
- issued_at;
- expires_at;
- status;
- verified_at;
- last_checked_at.

Token entropy: at least 128 bits, 256 preferred.

### Challenge FSM

```text
ISSUED → VERIFIED
ISSUED → EXPIRED
ISSUED → SUPERSEDED
VERIFIED → REVOKED
VERIFIED → SUPERSEDED
```

Rules:

- issuance TTL 24h;
- a new active challenge supersedes previous unverified challenge for the asset;
- no cross-org/cross-asset/cross-host replay;
- repeated successful check returns existing success without new scope;
- validate authoritative DNS path or an equivalent authoritative-state strategy;
- exact TXT value match after DNS TXT-string normalization.

## VerifiedScope lifecycle

Successful verification creates `VerifiedScope(EXACT_HOST)`.

V1 requires the verification TXT to remain published while scope is active.

Store:

- verified_at;
- last_revalidated_at;
- revalidate_after;
- hard_expires_at;
- revoked_at;
- scope_version;
- status.

V1 cadence:

- normal revalidation: 7 days;
- before CONTROLLED_DEEP, revalidate if last success >24h;
- before any verified scan, if `now >= revalidate_after`, synchronous revalidation is mandatory;
- failed revalidation → scope `STALE`, scan blocked;
- no successful revalidation for 30 days → `EXPIRED`;
- explicit revocation blocks immediately.

## Scope

V1 supports only `EXACT_HOST`.

Disabled:

- `DOMAIN_SUBTREE`;
- `IP`;
- `CIDR`.

Verification does not authorize discovered subdomains, external CNAME provider, CDN/shared IP, another redirect host or raw network scanning.

## ScanAuthorization

Before every verified execution:

`VerifiedScope ∩ profile policy ∩ entitlement ∩ current consent ∩ current verification/asset state`.

Schedulers, monitoring and targeted CVE jobs use the same calculation.

## V1 profiles

- GUEST_SAFE: safe/non-intrusive public posture.
- VERIFIED_BASELINE: EXACT_HOST + approved SAFE capabilities.
- CONTROLLED_DEEP: EXACT_HOST + explicit per-run consent + approved deeper web capabilities.
- ACTIVE: disabled.
- IP/CIDR/Naabu/raw TCP: disabled.

## Required tests

- IDNA/trailing dot;
- URL/path/port/userinfo/IP rejection;
- mixed public/private A/AAAA fail closed;
- actual socket uses pinned IP;
- Host/SNI/certificate validation preserved;
- redirect/retry revalidation;
- challenge binding/replay/expiry/supersede;
- 7d/24h/30d scope lifecycle;
- stale/revoked/expired scope blocks execution.
