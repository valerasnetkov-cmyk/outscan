# ADR 0004: Guest scan is safe/non-intrusive only

**Status:** Accepted — amended 2026-09-03
**Original date:** 2026-09-02
**Amendment reason:** terminology aligned with ADR 0009/0014; direct DNS/TLS/HTTP requests are not passive.

## Decision

Anonymous users may scan a domain without registration or ownership verification, but only through the Guest Safe profile.

Guest scanning is **safe/non-intrusive**.

The term `passive` is reserved for data sources that do not send application/network probes to the target, such as public CT/RDAP/passive-intelligence sources.

## Allowed

Safe/non-intrusive public posture:

- DNS;
- RDAP;
- TLS;
- bounded HTTP GET/HEAD/header observation;
- mail policies;
- ASN/BGP/RPKI;
- CDN/WAF;
- basic safe technology fingerprint;
- CT aggregate/passive intelligence.

Actual outbound requests remain subject to ADR 0009 target validation and connection pinning.

## Not allowed

- port scanning;
- Naabu/raw TCP;
- active/intrusive Nuclei capabilities;
- uncontrolled/deep crawling;
- headless browser in V1;
- ZAP active scan;
- fuzzing;
- brute force;
- exploitation;
- authenticated/intrusive testing;
- cross-host automatic scope expansion.

## Output

Guest sees baseline values and count of additional `Potential risks`, but not:

- CVE details;
- discovered subdomain list;
- endpoints;
- vulnerable-version evidence;
- raw scanner proof/evidence.

## Rationale

Provides immediate product value while preventing OUTSCAN from becoming an anonymous reconnaissance/intrusive-scanning service against arbitrary third parties.

## Amendment relationship

ADR 0009 defines current target/scope/pinning rules.
ADR 0012 defines current capability policy.
ADR 0014 defines current Guest UX/terminology.

This amendment replaces only the original `safe/passive` wording and clarifies V1 capability boundaries; the original product intent remains Accepted.
