# Legal and compliance notes

## Status

Project risk register, not legal advice.

## Russian market

Before commercial launch in РФ, obtain professional review of actual features/contracts/service model.

Distinguish customer self-service SaaS from professional security monitoring/protectedness assessment/pentest or other regulated activity.

## Scanning terminology

Guest mode is **safe/non-intrusive**, not purely passive.

DNS, TLS and HTTP checks send network requests.
RDAP, CT and some external intelligence can be passive relative to the target.

Do not call target network requests passive merely because they are low-risk.

## Authorization

V1:

- Guest safe/non-intrusive only.
- DNS verification creates EXACT_HOST only.
- ScanAuthorization recalculated at execution.
- Controlled Deep requires per-run consent.
- Active/IP/CIDR/Naabu/raw TCP disabled.

Before authenticated DAST, intrusive testing, IP/CIDR scanning or private scanner, repeat legal/contract review.

## Verification / monitoring

Verification does not automatically create paid monitoring.
MonitoringEnrollment is explicit.

## Claims

Follow CLAIM_INVENTORY.

Do not publish absolute protection, guaranteed absence/prevention, unmeasured SLA/performance, unsupported scanner/source counts, customer logos without permission or compliance/certification claims without process.

## Data

Before production define privacy basis, retention, Guest deletion, residency, subprocessors, export/delete, incident process and support-access rules.

Evidence may contain personal/confidential data and must be minimized.

## Production

Legal/privacy review and claim approval are Gate C requirements.
