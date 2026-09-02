# Codex workflow

## Start of task

1. Read `AGENTS.md`.
2. Read `README.md`, `plan.md`, `CHANGELOG.md`.
3. Read relevant docs/ADR.
4. If task changes product behavior, UX, monetization, Asset/Monitoring model or roadmap, read `docs/COMPETITIVE_ANALYSIS.md`.
5. Inspect current repository structure and existing patterns.
6. State the smallest coherent implementation slice.
7. Identify security invariants touched.
8. Identify verification commands before coding.

## During implementation

- keep files <= 400 authored lines;
- keep controllers/routes/pages orchestration-focused;
- centralize validation/authz;
- use explicit module boundaries;
- preserve unrelated changes;
- add negative tests alongside security-sensitive behavior;
- do not silently change product terminology or scan policy.

## Before declaring complete

1. Run targeted tests.
2. Run lint/format.
3. Run typecheck.
4. Run relevant full tests.
5. Run production build.
6. Run relevant negative/security tests.
7. Check source file line counts.
8. Review diff for secrets/debug/dependency drift.
9. Update docs.
10. Update `CHANGELOG.md`.
11. Update `plan.md`.
12. Update/create `docs/audit-YYYY-MM-DD.md` for substantial work.

## Daily audit rule

On each active day with meaningful implementation/security/architecture changes create one file:

`docs/audit-YYYY-MM-DD.md`

Update the same file throughout the day rather than creating multiple daily notes.

Audit must record:

- scope;
- what changed;
- affected invariants;
- verification actually run;
- findings by severity;
- unresolved risks;
- next actions;
- release decision for reviewed scope.

Never claim a check passed if it was not executed.

## Changelog rule

`CHANGELOG.md` is chronological and high-level.

Record:

- user-visible behavior;
- architecture changes;
- data/schema changes;
- security behavior;
- dependency/platform changes;
- deployment changes.

Do not paste operational exploit instructions or secrets.

## Plan rule

`plan.md` is actionable. Do not remove completed history. Mark `[x]` and append newly discovered work/risks.

## Graphify

After source scaffold:

```bash
uv tool install graphifyy
graphify install --project --platform codex
graphify .
```

Regenerate after significant architecture/schema/module changes. Inspect generated output before committing.
