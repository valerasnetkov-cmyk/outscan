# OUTSCAN Reporting security and acceptance tests

Status: planned blocking suites for future Reporting implementation

This is the gate/domain checklist for [Reporting](REPORTING.md). Preserve and run the detailed cases in [acceptance tests](REPORT_ACCEPTANCE_TESTS.md) and [security tests](REPORT_SECURITY_TESTS.md); these documents specify future tests, not completed runtime evidence.

## Snapshot integrity

- Finalized snapshot cannot be silently edited.
- Snapshot generation rejects unknown/malformed/oversized fields and incompatible source state.
- Repeated generation for the same canonical identity is idempotent or explicitly versioned.
- Concurrent duplicate generation has one deterministic winner/equivalent result.
- Live Finding/score/TI changes after snapshot finalization do not mutate historical output.

## Domain truth

- Stable canonical Finding IDs survive ordering, locale and renderer changes.
- Reporting cannot create/resolve/reopen Findings or alter disposition/occurrences/coverage.
- Automatic resolution stays disabled under ADR-0013; successful execution alone, mismatched scope/detector/profile/fingerprint or incomplete coverage cannot resolve a Finding. RemediationAction REPORTED_COMPLETE is distinct from Finding condition.
- Numeric canonical confidence is preserved without invented enum conversion or assurance claims; future source adapters require explicit accepted mappings.
- Missing/failed/partial/unknown coverage never renders as clean/safe/resolved.
- Security Score is absent when canonical score prerequisites are not met.
- Change sections use only compatible canonical snapshot/event data.

## Authorization and tenancy

- Anonymous report list/detail/download denied.
- User A cannot access User B/other Organization reports by guessed report/artifact IDs.
- All tenant queries and artifact lookup enforce organization membership plus RLS/composite integrity.
- Platform/Support access follows its separate privileged policy and audit path.
- Export/bulk/history endpoints receive the same tenant controls as detail views.

## No scanner authority

- Report generation/export never creates ScanRequest/ScanJob.
- Client format/locale/branding input cannot select scanner profile/capability/template/target.
- Report availability cannot create VerifiedScope, entitlement, consent or MonitoringEnrollment.

## Renderer parity

For one snapshot, JSON/MD/PDF/AI representations preserve the same canonical:

- report ID and observation period;
- included assets;
- Finding IDs and statuses;
- valid Risk/score facts;
- coverage/limitations.

Renderer-specific presentation differences must not change factual values.

## Hostile content and injection

Use fixtures containing markup, script-like strings, CRLF/log content, spreadsheet formulas, path separators, archive traversal names, prompt-injection-like evidence, oversized strings and secret-like material.

Prove:

- HTML/PDF/Markdown output is context-safe;
- filenames/storage keys are server-generated;
- ZIP paths cannot traverse or overwrite;
- raw scanner evidence and secrets are excluded/redacted per policy;
- AI Handoff treats external evidence as untrusted data and grants no tool authority.

## Artifact storage/download

- artifact storage is private by default;
- download requires fresh authorization;
- signed URL, if used, is bounded and cannot be repurposed cross-tenant;
- content type/disposition is explicit;
- size/count/output-time budgets are enforced;
- partial renderer failure does not corrupt snapshot or other READY artifacts.

## Version compatibility

- unknown snapshot/schema/renderer versions fail closed;
- supported migrations/adapters are explicit;
- changing renderer version does not rewrite historical artifact identity silently;
- correction/revision semantics are auditable.

## Accessibility and UX

- report list/detail/export controls are keyboard accessible;
- status is not color-only;
- historical versus live state is clearly labeled;
- long technical identifiers and tables reflow/scroll without hiding meaning;
- generated PDF has readable heading/order/text metadata to the supported extent.

## Release evidence

For each implemented slice run targeted tests, tenant/RLS negatives, typecheck/lint/build, source-line checks and full relevant repository verification. Reporting may not be marked production-ready based on documentation or a successful renderer happy path alone.
