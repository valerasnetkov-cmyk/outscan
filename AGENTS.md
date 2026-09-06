# AGENTS.md — OUTSCAN repository contract

## Start

Read README, PRE_SCAFFOLD_GATE, plan, CHANGELOG, relevant ADR/docs and latest audit. Inspect repository state and preserve unrelated user changes.

## Gates

- A PASS before substantive source scaffold.
- B1 PASS before Guest exposure.
- B2 PASS before Workspace.
- C PASS before production.
  Never self-declare PASS without evidence.

## V1 target

Hostname/domain only.
Normalize IDNA/Punycode/lowercase/trailing dot.
Reject URL/path/port/userinfo/IP literals.

Resolve full A/AAAA set and fail closed if any candidate is forbidden/ambiguous.
Pin actual connection to validated IP preserving Host/SNI/certificate validation.
Revalidate retries/redirects.

VerifiedScope = EXACT_HOST only.
IP/CIDR/Naabu/raw TCP/ACTIVE disabled.

## Verification

TXT format/lifecycle/revalidation per ADR 0009.
Verification and ScanAuthorization are separate.
Every verified execution recomputes authorization.

## Data

Use ADR 0010 entity matrix.
TENANT rows organization-keyed + composite FK + RLS.
Guest separate.
Partner grant ≠ Support grant.
No ambiguous generic AuditLog.

## Jobs

Separate ScanRequest/ScanJob/ScanAttempt.
Use ADR 0011 FSM/idempotency.
Guest idempotency is scoped by a server-authenticated high-entropy Guest-session cookie, never IP/NAT/browser fingerprint.
Same Guest session + same key/hash within 30m returns the same replay-stable HMAC-derived result token without extending expiry.
Same Guest session + same key + different hash = conflict.
Result-token HMAC uses the versioned domain-separated binary encoding from ADR 0011; no ad-hoc string concatenation.
CAS lease + monotonic fence.
Primary commit requires RUNNING state + current fence + unexpired lease/deadline.
Terminal same-digest replay is a separate no-write acknowledgement branch; different digest conflicts/audits.
ResultEnvelope contains ScannerResultEnvelope payload.

## Scanner

Supervisor owns Redis/result credentials.
Third-party scanner owns none.
Machine capability policy from ADR 0012.
Unknown capability DENY.
HEADLESS_BROWSER DENY in all V1 profiles.
Hostile output bounded/validated/redacted.

## Findings / score

FindingOccurrence records positive detections.
FindingEvent only transitions.
Coverage separate.
Automatic RESOLVED disabled until compatible coverage tests.
Asset Security Score only when SufficientBaselineV1 true.
Monitoring explicit.

## Files

Authored source <=400 physical lines. Do not game the limit.

## UI / claims

Follow CLAIM_INVENTORY and UX_ACCEPTANCE.
No blocked claims/customer logos.
No decorative globe/radar/glow/shield.
WCAG 2.2 AA target.

## Completion

Run relevant tests/lint/typecheck/build/security negative suites/`git diff --check`.
Update docs/plan/changelog/audit.
Never claim a check ran if it did not.
