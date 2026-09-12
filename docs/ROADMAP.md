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

After B2 Action Center foundation, V1.5 adds compatible deterministic diff, significance, timeline, alerts and asset triage. It reuses MonitoringEvent and canonical recheck authorization. Visual preview remains later because V1 HEADLESS_BROWSER is denied.

## V2 — EASM / Asset Graph basics

Expanded passive discovery, unknown assets, relations/provenance and external trends.

Raw network scanning still requires dedicated ownership/scope ADR.

## V2.5 — Agency/MSP/API

PartnerDelegation, separate client Organizations, White Label, authorized bulk views, API/webhooks.

## V3+

AppSec/API → Supply Chain → Cloud/Private Scanner → Attack Paths → CTEM → Enterprise/Managed.

Brand Protection, DMARC aggregate-report ingestion and credential exposure require separate product/security/legal/source/privacy decisions and are not current capability claims.

## Sequencing

Advance scanner classes only with demand/revenue/coverage/operational evidence and required security/legal decisions.

## Strategic priorities and UX

[AI-era strategy](AI_ERA_PRODUCT_STRATEGY.md) is an overlay, not release sequencing: P0 is Change Intelligence, New Asset Detection, remediation/recheck and immutable reporting; P1 is deployment-triggered recheck, Emerging CVE checks, deterministic AI Handoff and historical comparison; P2+ is CI/CD, AI/Agent Exposure and MCP/agent integration. Gate B1 remains the critical path; full Change Intelligence remains V1.5, broad discovery remains V2/EASM and no discovered asset gains scan authority.

[Product Simplicity](PRODUCT_SIMPLICITY_UX.md) applies to each future surface: state/action before taxonomy, authorized evidence accessible, no hidden limitations or Guest disclosure expansion. The 10s/30s goal requires usability review and is not an SLA.

## Creator GTM overlay

[Creator / AI Builder](CREATOR_VIBE_CODING_GTM.md) is the first self-service acquisition segment, with the existing Agency/SMB/EASM growth path.

- Before B1: strategy/content/channel research and campaign design only; outreach is a separate authorized activity, no public scan execution.
- After B1: web Guest campaigns/links can be evaluated; direct Telegram scans additionally need an accepted channel/security/session design under ADR-0011/0015.
- After B2 and relevant phases: Workspace packaging, explicit Monitoring, authenticated technical notifications and remediation workflow.
- After Reporting prerequisites: deterministic AI Handoff and separately authorized recheck, with claim/UX review before an AI-related CTA.

Creator price ranges, CAC/payback, referral rewards and attribution are hypotheses. Future analytics require minimized consent-aware data and cannot turn campaign/chat IDs into session ownership, verification or authorization.

## Reporting and production

[Reporting](REPORTING.md) waits for durable Findings/Risk, B2, ADR 0018 acceptance and ADR-0010 classification/retention. Implement snapshot/JSON parity before other formats and history UI. [Production readiness](PRODUCTION_READINESS.md) is the existing Gate C evidence profile; documentation adds no gate or runtime evidence.
