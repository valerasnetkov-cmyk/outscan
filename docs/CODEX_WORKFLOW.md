# Codex workflow

## Start

1. Read AGENTS.
2. Read README/PRE_SCAFFOLD_GATE/plan/CHANGELOG.
3. Read relevant ADR/docs.
4. Read latest audit.
5. Inspect repo state.

## Before scaffold

Gate A must be PASS.

Gate A evidence includes:

- accepted ADR 0009–0014;
- one active gate file;
- old corrections removed;
- claim inventory;
- UX acceptance;
- public/maket.png, if retained pre-scaffold as reference-only, is not treated as Gate A evidence and is scheduled for removal/exclusion before Gate B1/public deployment;
- consistency review;
- `git diff --check`.

If FAIL, work only on docs/ADR/threat model/test plans/design evidence.

## Implementation

- <=400 authored source lines/file;
- centralized authz/validation;
- pinned outbound destinations;
- tenant/RLS invariants;
- server-authenticated Guest-session idempotency boundary;
- deterministic job/fence plus separate primary-commit/terminal-replay semantics;
- supervisor/scanner credential boundary;
- machine policy enforcement;
- negative tests alongside security behavior.

## Documentation sync

Normative decision belongs in ADR + canonical spec.
Gate file is only matrix.
Update plan/changelog/audit.

## Before complete

Run targeted tests, lint/format, typecheck, relevant full tests, security negatives, build, line counts and `git diff --check`.
List anything not run.

## Graphify

Only after Gate A PASS + meaningful source scaffold.
