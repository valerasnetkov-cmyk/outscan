# Security Question Registry and Workspace Check-ins

**Status:** Planned after Gate B2; no runtime implementation

## Purpose

Security Check-ins are optional fixed-choice educational questions in authenticated Workspace. A future Cyberexam may consume the same canonical server-side question registry through a stricter exam projection.

They are not Findings, evidence, organizational assessment, monitoring, notification policy or Security Score input.

```text
Question/answer/progress
  != Finding or FindingEvidence
  != Risk or Security Score
  != Monitoring state
  != VerifiedScope or ScanAuthorization
```

Implementation waits for authenticated User/Workspace, session/CSRF protection and the applicable Gate B2 evidence. It does not reopen Gate A or affect Guest/B1.

## Package review corrections

The supplied package is a design source, not evidence of an existing Cyberexam. The repository currently contains no accepted Cyberexam architecture, bank or attempt model, so its claimed 8/8/8 banks, 12-question attempt and `Approved` O09 status are not canonical facts.

The administrator-offboarding scenario is retained only as a proposed Owner educational case. Before publication, owner/content/security review must confirm its stable ID, version, bank rules, scoring, wording and relationship to a separately specified Cyberexam.

The proposed data model is also corrected: fixed KNOWLEDGE answers and popup suppression are user-scoped and contain no tenant data. They do not require `organization_id`. Active Workspace membership is checked when surfacing the UI, not persisted as ownership of the educational response.

## V1 boundaries

- Automatic Workspace Check-ins use only approved `KNOWLEDGE` questions with fixed-choice answers.
- `ORGANIZATION` questions remain a reserved unknown/disabled future capability and are rejected by automatic and manual V1 projections.
- No free text, attachments, credentials, tokens, employee/account lists, internal IPs/logs, IdP data, backup paths or incident evidence is collected.
- OUTSCAN does not inspect internal identities or perform employee offboarding, access revocation or business-control verification.
- No Admin/CMS editor, runtime AI authoring, external question ingestion, gamification pressure or organization ranking is added.

The full registry and scoring logic are server-only. They must not be placed in a package imported by browser code or otherwise bundled into Web/Admin assets.

## Server-side question registry

The future code-first registry has a closed versioned shape:

```text
id + version + status
type + audiences[] + competencies[] + difficulty
scenario + options[] + explanation + outscanRelevance
examEnabled + workspaceEnabled
workspaceCooldownSeconds
```

Statuses are `DRAFT | APPROVED | PUBLISHED | RETIRED`. Published `(id, version)` content is immutable; semantic, option, answer or scoring changes create a new version. IDs, versions, statuses, enums, text/array sizes, option membership and lifecycle transitions are strictly validated.

Internal options may contain `id`, label, points, `criticalError` and explanation override. Points, best/correct option, critical flags and full explanation are server-only until the relevant surface permits disclosure.

Registry projections are separate:

- Cyberexam pre-completion: ordered option IDs/labels without answer/scoring/explanation;
- Cyberexam post-completion: reviewed result/explanation only after server-side completion;
- Workspace pre-answer: concise scenario and server-randomized option IDs/labels only;
- Workspace post-answer: selected/best option and concise educational explanation, without exam score metadata.

Option order is generated server-side and frozen with the delivered question/attempt identity so answer IDs remain stable and historical results are reproducible.

## User preference and progress

Future persistent concepts are GLOBAL SENSITIVE user-owned rows:

- `UserCheckInPreference(user_id, popups_enabled, updated_at)`;
- `UserQuestionProgress(user_id, question_id, question_version, state, selected_option_id?, next_eligible_at?, timestamps)`.

Allowed progress states are `ANSWERED | DEFERRED | DISMISSED`. Unique identity is `(user_id, question_id, question_version)`. No answer text or Organization/customer data is duplicated. These concepts must enter ADR-0010 before migration and follow account export/deletion/retention policy.

The feature is globally disabled until its release gate passes. Once enabled, `popups_enabled` defaults to true for eligible users; `Больше не показывать вопросы` immediately and idempotently sets it false. The preference is reversible under `Настройки → Интерфейс → Контрольные вопросы`.

Disabling popups:

- affects only future automatic Check-ins for that user;
- keeps the current card usable until answer/close;
- preserves progress and manual Question Center access;
- does not affect another user, Cyberexam, alerts, monitoring or account/technical notifications.

## Eligibility and frequency

Automatic selection requires authenticated user, active Workspace membership, enabled rollout/preference, PUBLISHED+KNOWLEDGE+workspace-enabled question, audience match, unanswered current version, elapsed server cooldown and a safe UI context.

V1 limits one active card and at most one newly surfaced question per authenticated session. It does not appear over verification, destructive settings, checkout/payment or urgent security actions. `Позже` uses only a bounded server-owned cooldown; clients cannot choose timestamps.

An ANSWERED version is never automatically repeated. A DEFERRED question may be answered manually; successful answer atomically replaces deferred state. Replaying the same answer is acknowledged idempotently, while a different option after ANSWERED conflicts and does not rewrite history.

## Proposed API

No route exists now. After B2, user-scoped authenticated endpoints may be:

```text
GET  /v1/me/security-checkins/next
GET  /v1/me/security-checkins
POST /v1/me/security-checkins/:questionId/answer
POST /v1/me/security-checkins/:questionId/defer
PATCH /v1/me/preferences
```

`next` returns 204 when rollout/preference/eligibility denies a card. Answer accepts exact `questionVersion + answerOptionId`; defer has no time field. Requests cannot supply user/organization IDs, scoring, correctness, state or arbitrary content. All mutations require authenticated session and CSRF policy.

Manual center remains available when popups are disabled and shows only the current user's fixed KNOWLEDGE progress. Cross-user history is forbidden; future organizational reporting requires a separate product/privacy decision.

## Workspace UX

Desktop uses a non-modal edge card; mobile uses a compact bottom sheet with one-column answers and at least the project minimum target size. It has visible close/defer actions, keyboard/touch operation, logical focus, Escape close, focus return, semantic radio group and labelled suppression checkbox.

The card never blocks navigation or uses shame, countdowns, streak pressure or Security Score rewards. Post-answer wording is calm (`Лучшее решение`) and explains why; it does not claim that OUTSCAN verified the organization's internal process.

Question copy may link to an approved public Security Glossary term, but it does not duplicate glossary definitions or alter glossary/capability publication state.

## Proposed administrator-offboarding case

The future Owner case teaches that planned administrator departure requires responsibility transfer and timely revocation/rotation of personal access, sessions, keys, tokens and shared secrets across critical services.

Required boundary copy states that this is an organizational measure: OUTSCAN does not know internal accounts, inspect IdP/login logs, revoke SSH/API/VPN access or guarantee offboarding completeness. The scenario uses only fixed choices and never asks the customer to enumerate systems, people or credentials.

Cyberexam scoring, critical-error semantics, bank composition and completion disclosure stay deferred until a canonical Cyberexam contract is accepted. Workspace may use a separately approved concise KNOWLEDGE projection without exposing those fields.

## Analytics and operations

Allowlisted product events are impression, answered, deferred, popup disabled/enabled and manual center opened. Generic/marketing analytics receives no selected option, correctness, question text, user/organization identity or free-form data.

Operational metrics cover eligible/surfaced/answered/deferred counts, projection/validation failures and preference changes using bounded low-cardinality labels. Logs contain no answer content or scoring metadata.

## Rollout

1. Accept a canonical Cyberexam contract separately if Cyberexam is still desired; verify the actual base bank before reserving O09.
2. Add the server-only registry and strict projections/validation.
3. Add user preference/progress classification to ADR-0010, persistence and account deletion/export behavior.
4. Add user-scoped API with session/CSRF/idempotency controls.
5. Add manual center first, then automatic card behind a default-off global rollout switch.
6. Pass [Security Check-ins testing](SECURITY_CHECKINS_TESTING.md), privacy/content review and WCAG evidence before enablement.

No check-in answer becomes a security finding, score, tenant benchmark or customer-facing assurance.
