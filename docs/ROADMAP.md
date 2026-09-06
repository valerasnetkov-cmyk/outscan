# Roadmap

## Pre-Scaffold

Completed:

- ADR-0009…0014 accepted;
- old correction drafts removed;
- `public/maket.png` classified as reference-only and scheduled for removal/exclusion before Gate B1/public deployment if it would be served;
- claim inventory + UX evidence accepted;
- final consistency review completed;
- Gate A PASS.

## V1 — Guest + Exact-Host Baseline

- Guest safe/non-intrusive Network & Domain Posture;
- pinned validated outbound connections;
- DNS TXT exact-host verification/revalidation;
- deterministic job/attempt protocol;
- SAFE capability policy;
- verified baseline;
- FindingOccurrence + coverage;
- SufficientBaselineV1;
- Asset Security Score;
- explicit MonitoringEnrollment;
- TI/Risk;
- snapshots/provenance;
- reports/email when implemented.

Implementation sequencing inside the current plan:

- Phase 2 Workspace foundation adds transactional account email persistence/provider delivery required by verification/recovery;
- Phase 4 TI/Risk/Monitoring adds customer technical email/Telegram and platform Ops alerts;
- marketing consent/campaign delivery remains Later/Commercial.

Excluded V1:

- implicit DOMAIN_SUBTREE;
- IP/CIDR scope;
- Naabu/raw TCP;
- ACTIVE;
- authenticated requests.

## V1.5 — Change Intelligence

Diff engine, significance, timeline, alerts, asset/finding changes.

## V2 — EASM / Asset Graph basics

Expanded passive discovery, unknown assets, relations/provenance and external trends.

Raw network scanning still requires dedicated ownership/scope ADR.

## V2.5 — Agency/MSP/API

PartnerDelegation, separate client Organizations, White Label, authorized bulk views, API/webhooks.

## V3+

AppSec/API → Supply Chain → Cloud/Private Scanner → Attack Paths → CTEM → Enterprise/Managed.

## Sequencing

Advance scanner classes only with demand/revenue/coverage/operational evidence and required security/legal decisions.
