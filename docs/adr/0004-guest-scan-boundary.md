# ADR 0004: Guest scan is safe/passive only

Status: Accepted  
Date: 2026-09-02

## Decision

Anonymous users may scan a domain without registration or ownership verification, but only through the guest-safe profile.

## Allowed

Public posture: DNS/RDAP/TLS/HTTP headers/mail policies/ASN-BGP-RPKI/CDN-WAF/basic technology/CT aggregate.

## Not allowed

Port scanning, Naabu, active Nuclei, deep Katana, ZAP active scan, fuzzing, brute force, exploitation, authenticated/intrusive testing.

## Output

Guest sees baseline values and count of additional `Potential risks` but not CVE details, subdomain list, endpoints, vulnerable version evidence or scanner proof.

## Rationale

Provides immediate product value while preventing OUTSCAN from becoming an anonymous reconnaissance service against arbitrary third parties.
