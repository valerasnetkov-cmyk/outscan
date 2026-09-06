# ADR 0007: Change Intelligence is a first-class capability

**Status:** Accepted — amended 2026-09-03
**Original date:** 2026-09-02
**Amendment reason:** implementation sequencing clarified as V1 foundation + V1.5 user-facing capability.

## Context

Public DNS/TLS/header checks and scheduled vulnerability scans are widely available. OUTSCAN must not retain only the current state of an asset.

## Decision

OUTSCAN treats security-relevant change as a first-class product/domain concept.

The system must preserve sufficient versioned history to support changes in:

- asset discovery/disappearance;
- IP / ASN;
- NS / MX;
- certificate / CA;
- CDN/WAF;
- TLS;
- DMARC;
- RPKI;
- technology;
- finding condition;
- Security Score inputs/outputs.

A change may create a `MonitoringEvent` and have its own significance independent of CVE existence.

## Delivery sequencing

### V1 foundation

V1 must:

- persist versioned posture snapshots/observations;
- preserve provenance and coverage references;
- avoid destructive overwrite of security-relevant posture;
- preserve data needed for future comparison.

V1 is **not required** to expose the complete user-facing change timeline/diff/significance/alerting product.

### V1.5 Change Intelligence

V1.5 delivers the first complete user-facing capability:

- diff engine;
- `before → after`;
- significance classification;
- timeline;
- meaningful alerts;
- explanatory `what changed / when / why it matters`.

Until V1.5 is implemented, public UI must not imply that this full capability is currently available.

## Consequences

- Security-relevant posture cannot be irreversibly overwritten.
- Data model supports versioned/snapshotted observations.
- Full Workspace change timeline/diff is a V1.5 requirement, not a V1 release requirement.
- Notifications may later be driven by meaningful configuration/infrastructure changes, not only vulnerabilities.
- Change significance can be Risk Engine input but never masquerades as CVE severity.

## Amendment relationship

ADR 0013 defines current finding/coverage/snapshot semantics.
ADR 0014 defines how future Change Intelligence concepts may be represented before V1.5.
