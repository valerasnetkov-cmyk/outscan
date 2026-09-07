# Security Question Registry and Check-ins testing

**Status:** Planned blocking suite for post-B2 implementation

**Parent contract:** [Security Question Registry and Workspace Check-ins](SECURITY_CHECKINS.md)

## Registry and projection

- Reject unknown fields/enums/statuses, malformed IDs/versions, duplicate `(id, version)`, invalid option IDs and missing answer references.
- Reject PUBLISHED workspace questions unless they are approved fixed-choice KNOWLEDGE with bounded copy/options and a valid cooldown.
- Published versions are immutable; a semantic/scoring change requires a new version and preserves historical projection.
- Pre-answer Cyberexam and Workspace DTOs contain no points, best/correct answer, critical flag, full explanation or unpublished question content.
- Frontend production bundles contain no full registry or server-only scoring metadata.
- `ORGANIZATION`, free-text, attachment and unknown input types fail closed in every V1 Workspace projection.

## Preference, privacy and authorization

- A user can read/change only their own popup preference and progress; request user/organization IDs and undeclared fields are rejected.
- Disabling popups affects only that user, preserves progress/manual center and cannot suppress alerts, monitoring, email or Telegram.
- Re-enabling allows future eligible sessions without erasing cooldown/answered state.
- No Organization/customer identifier, employee/account data, credential, token, internal IP/log or free-form evidence is stored or emitted.
- Account export/deletion includes/removes user-owned preference/progress under canonical lifecycle policy.
- Platform/support receives no implicit access to answer history.

## Eligibility, frequency and idempotency

- Global rollout disabled, inactive membership, disabled preference, wrong audience/type/status, answered version and active cooldown all return no automatic card.
- At most one active card and one new automatic question per authenticated session, including concurrent requests/retries.
- Critical verification/settings/payment/security contexts suppress the card without changing answer state.
- Client cannot choose cooldown or eligibility timestamps; DST/clock and expired cooldown boundaries are deterministic.
- Same answer replay is idempotent; different answer after ANSWERED conflicts; answer after DEFERRED atomically becomes ANSWERED.
- Option must belong to the exact delivered question version; stale/retired/mismatched versions fail safely.

## Score and product isolation

- Correct, incorrect, deferred, dismissed and popup preference changes leave Finding, FindingEvidence, Coverage, Risk, Asset/Organization Security Score and Monitoring unchanged.
- Check-ins cannot publish glossary/capability metadata or change ScannerCapability, VerifiedScope or ScanAuthorization.
- Offboarding content and answers cannot trigger account discovery, IdP/log ingestion, credential collection or automated revocation.
- Workspace explanation never claims that an internal process was technically verified.

## API and session security

- Every endpoint requires authenticated session and applicable CSRF control; anonymous, cross-user and forged-session requests fail closed.
- `next` returns only safe pre-answer projection or 204; list returns only current-user fixed KNOWLEDGE history.
- Answer/defer exact schemas reject scoring, correctness, state, arbitrary text and reschedule fields.
- Errors expose stable codes without source paths, stack traces, correct answers or registry internals.
- Abuse/replay/concurrent requests remain bounded and cannot enumerate unpublished questions.

## UX and accessibility

- Desktop card and mobile bottom sheet are non-blocking, reflow without horizontal scrolling and do not obscure critical actions.
- Radio group, answer/defer/close and suppression checkbox have accessible labels, keyboard/touch operation, visible focus and project target size.
- Escape closes, focus returns predictably and state is not conveyed by color alone.
- Manual center remains reachable while popups are disabled; no countdown, shame, score reward or forced completion appears.

## Analytics and content

- Only allowlisted coarse event names are emitted; selected option, correctness, question text, user/organization IDs and answer history never reach generic/marketing analytics.
- Logs and metrics omit question/answer content and use bounded labels.
- Offboarding case preserves the explicit no-internal-access/no-automated-offboarding boundary.
- If Cyberexam is later accepted, bank size/selection, server-side ordering/scoring, version reproduction and post-completion disclosure receive a separate complete suite based on the actual canonical bank.

## Release evidence

Before activation run registry/projection, persistence/API authorization/idempotency, privacy/isolation, Web component/accessibility and production bundle tests plus lint, typecheck, builds, line-count, links/secrets and `git diff --check`. PASS is scoped to Check-ins and does not advance Gate B1/B2/C.
