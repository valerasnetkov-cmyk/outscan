# Threat Intelligence

## Purpose

Threat Intelligence Service/Module обогащает scanner findings и позволяет переоценивать уже известные assets при появлении новых данных об угрозах.

## Sources V1

### NVD

Purpose:

- CVE metadata;
- CVSS;
- CWE;
- affected product identifiers;
- published/modified timestamps.

Use incremental synchronization where possible.

### CISA KEV

Purpose:

- known exploited vulnerability signal;
- high-priority threat context.

### FIRST EPSS

Purpose:

- exploitation probability signal;
- refresh daily according to source cadence.

### Nuclei Templates

Purpose:

- technical detection logic.

Templates are executable logic and must be governed as code/dependency, not trusted as passive data.

### Later: OSV

For repositories/dependencies/SBOM.

## Provenance

Every normalized record must retain:

- source;
- source record id/version when available;
- source updated timestamp;
- ingested timestamp;
- parser/schema version.

## Suggested cadence

Project policy, subject to source limits:

- NVD: incremental every 1-2 hours.
- KEV: every 1-3 hours.
- Nuclei template update check: every 3-6 hours, but promotion to production only via release pipeline.
- EPSS: daily.

Do not fail customer scan if one intelligence source is temporarily unavailable. Mark stale/missing enrichment explicitly and retry independently.

The proposed Weekly Security Digest consumes only this canonical normalized state plus source health/watermarks. It owns no importer: stale/failed/unknown KEV cannot become `KEV: No`, missing EPSS cannot become zero, and external/editorial text cannot elevate a claim beyond its source semantics.

## Re-evaluation flow

```text
new/updated CVE
 -> normalize
 -> match known technologies/assets
 -> determine candidate exposure
 -> if trusted detection profile exists: enqueue TARGETED_CVE_SCAN
 -> update Potential/Probable/Confirmed state
 -> recalculate risk
 -> monitoring event / notification if policy threshold met
```

## Template release pipeline

```text
upstream change
 -> staging fetch
 -> signature/source policy
 -> test fixtures
 -> canary on owned targets
 -> approve version/profile
 -> build/pin production scanner image
```

Runtime customer job must not execute an unreviewed template fetched moments before the scan.

## External input security

All feeds are untrusted input:

- strict schema validation;
- size limits;
- safe parsers;
- no interpolation into shell commands;
- no execution of data fields;
- logs sanitized.
