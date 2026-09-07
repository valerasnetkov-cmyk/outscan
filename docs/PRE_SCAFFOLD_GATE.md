# OUTSCAN — Pre-Scaffold Gate

**Status:** Canonical gate matrix
**Date:** 2026-09-03

> Previous PRE_SCAFFOLD_CORRECTIONS files are superseded and were confirmed absent by the latest read-only review. This is the only canonical active gate matrix. Normative decisions live in ADR/specs.

## Gate A — Pre-Scaffold Design

PASS permits source scaffold only when:

- ADR-0009…ADR-0014 are Accepted;
- pinned-connect + target/verification contract is complete;
- entity ownership/sensitivity matrix is complete;
- job/attempt FSM + Guest-session idempotency boundary + versioned token encoding + primary-commit/terminal-replay semantics are complete;
- capability/profile matrix + budgets + machine policy schema are complete;
- occurrence/fingerprint/coverage + SufficientBaselineV1 are complete;
- `CLAIM_INVENTORY.md` exists and accepted design has no blocked claim;
- `UX_ACCEPTANCE.md` is approved design/accessibility evidence;
- `public/maket.png`, while retained as a pre-scaffold first-screen reference, is explicitly marked reference-only and is not accepted as Gate A design/claim evidence;
- old correction drafts are removed;
- canonical docs/plan are synchronized;
- consistency review = PASS;
- `git diff --check` passes.

Owner acceptance alone cannot override failed evidence/consistency.

Post-Gate-A proposed ADR-0016 documents a deferred Weekly Security Digest and is not a Gate A/B1 blocker or implementation evidence. Its acceptance and runtime gates are evaluated with the future Workspace/Monitoring scope.

The planned code-first Security Glossary is descriptive public metadata, requires no ADR for V1 and does not reopen Gate A or block B1. Its content/API/Web activation requires its own post-B1 validation, accessibility and claim evidence.

The planned Security Question Registry/Check-ins module is post-B2 educational account functionality, requires no ADR for the fixed-choice code-first design and is not Gate A/B1/B2 evidence. Persistence, API and UI wait for accepted user-data classification plus downstream privacy/security/accessibility tests.

Action Center and Action/Change roadmap documentation is deferred: Gate B1 remains the critical path, ADR-0007 keeps complete Change Intelligence in V1.5, and no item expands scanner scope or counts as B1/B2/C evidence. Recheck/targeted execution must use current VerifiedScope/ScanAuthorization; visual preview requires a separate later ADR.

Promotions/Access Grants documentation is deferred post-B2 commercial planning and does not reopen Gate A or block B1. Grants are entitlement-only and cannot create verification, consent, monitoring or scan authority. The package-proposed `ADMIN_ATTESTED` exception conflicts with ADR-0009 and remains denied unless a separate future ADR is owner-accepted and evidenced.

## Gate B1 — Guest

Requires hostname/IDNA, pinned validated connection preserving Host/SNI/cert checks, SSRF/mixed-set/redirect tests, Guest token/retention/abuse, deterministic job/fencing, supervisor boundary, machine capability policy, hostile-output tests, redaction/coverage and runtime WCAG evidence.

Tenant Workspace RLS does not block B1.

## Gate B2 — Workspace

Requires auth/session/recovery/CSRF, Organization, Add exact host, tenant API/composite FK/RLS, cross-tenant tests, DNS verification lifecycle, EXACT_HOST scope, execution-time authorization, SufficientBaselineV1, correct score gating, Controlled Deep consent, explicit MonitoringEnrollment and privileged audit.

## Gate C — Production

Requires applicable B1/B2 PASS, no Critical/High, CI/build/security tests, retention/delete/export, restore drill, runbooks, legal/privacy, disclosure contact, Admin MFA/step-up and approved production claims.

## ADR evidence

| ADR  | Required evidence                                                                                   |
| ---- | --------------------------------------------------------------------------------------------------- |
| 0009 | target grammar, TXT lifecycle, pinned connect, scope/revalidation                                   |
| 0010 | complete entity matrix, FK/RLS/grant rules                                                          |
| 0011 | Guest-session boundary, canonical token encoding, job+attempt FSM, primary commit + terminal replay |
| 0012 | capability matrix, profile mapping, budgets, machine schema                                         |
| 0013 | occurrences, fingerprint/coverage, SufficientBaselineV1                                             |
| 0014 | UX flow, claim inventory, accessibility evidence                                                    |

## Required repository state

Confirmed by the latest read-only review:

- old `PRE_SCAFFOLD_CORRECTIONS*` drafts are already absent;
- `git diff --check` passed before this revision.

These conditions must remain true after applying subsequent documentation revisions.

Already resolved in the latest applied repository state:

- owner decision for `agent.md` is recorded/resolved; `AGENTS.md` remains canonical;
- post-application `git diff --check` passed for the currently applied revision.

Current review result:

- v3 is already applied in the working tree;
- package integrity = PASS;
- security/architecture consistency = PASS;
- content consistency = PASS for the currently reviewed state;
- `agent.md` decision is resolved;
- current `git diff --check` = PASS.

Gate A closure evidence:

- ADR-0009…ADR-0014 are Accepted;
- post-acceptance `git diff --check` passed;
- final read-only Gate A consistency review passed.

`public/maket.png` may remain for now as a reference for building the first screen. It is not approved public copy/design evidence, and blocked claims/visual decisions inside it must not be copied into implementation. Before Gate B1/public deployment it must be moved outside served runtime assets or otherwise excluded from deployment.

## Current status

`Package integrity: PASS`
`Old correction drafts: ABSENT`
`Current applied revision git diff --check: PASS`
`agent.md owner decision: RESOLVED`
`Content consistency: PASS`
`Gate A: PASS`
`Product Capability Registry Gate A impact: NONE`
`Notifications & Communications ADR-0015 Gate A impact: NONE`
`Guest supervisor foundation: INJECTED RUNTIME EVIDENCE PASS; production launcher/key provider/persistence pending`
`Guest abuse/retention policy: HMAC SIGNAL + POSTGRESQL ATOMIC RESERVATION/RELEASE EVIDENCE PASS; trusted-proxy/key-rotation/cleanup/deletion pending`
`Guest result view: SANITIZED BODY/COVERAGE + DATABASE READ EVIDENCE PASS; route/UI/WCAG pending`
`PostgreSQL data-access ADR-0017 Gate A impact: NONE`
`GuestScan persistence boundary: POSTGRESQL IDEMPOTENCY/ABUSE/RESULT-COMMIT/RESULT-READ/RETENTION-BATCH EVIDENCE PASS; scheduling/queue/route pending`
`Gate B1: IN PROGRESS`
`Gate B2: NOT STARTED`
`Gate C: NOT STARTED`

Gate A is PASS. Minimal source scaffold and CI/test harness exist; Gate B1 remains required before Guest exposure.

## Principle

`decision → canonical ADR/spec → evidence → consistency PASS → implementation → negative verification → gate status`.
