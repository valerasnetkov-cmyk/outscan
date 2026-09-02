# ADR 0006: Separate detection, intelligence and risk

Status: Accepted  
Date: 2026-09-02

## Decision

Do not treat scanner severity as final OUTSCAN risk.

Pipeline:

```text
Detection
 -> Finding normalization
 -> Threat Intelligence enrichment
 -> Risk Engine
 -> User-facing priority
```

## Intelligence V1

- NVD
- CISA KEV
- FIRST EPSS
- Nuclei Templates for detection logic

## Rationale

A high CVSS with low confidence/exploitability may be less urgent than a confirmed internet-exposed KEV with high EPSS. OUTSCAN must prioritize customer action, not reproduce scanner output.

## Consequences

- findings store confidence/provenance;
- Risk Engine is versioned;
- new CVE/intel can trigger targeted re-evaluation without a full scan;
- UI distinguishes Potential, Probable and Confirmed.
