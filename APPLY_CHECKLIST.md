# OUTSCAN — Apply Checklist

## Repository state

The reviewed v3 content is already present in the working tree. This package is only a repository-state synchronization update.

## Already confirmed by latest review

- old `PRE_SCAFFOLD_CORRECTIONS*` files are absent;
- post-application `git diff --check` passed for the currently applied revision;
- owner decision for `agent.md` is resolved;
- repository Markdown links passed;
- obvious-secret scan found no credentials.

Do not recreate the removed correction drafts.

## Design reference

`public/maket.png` may remain temporarily as a reference for building the first screen.

Rules:

- it is reference-only;
- it is not accepted Gate A design/claim evidence;
- blocked claims/customer logos/visual choices inside it must not be copied into implementation;
- before Gate B1/public deployment, move it outside served runtime assets or otherwise exclude it from deployment if it would be publicly accessible.

## Owner decisions

Already resolved:

- owner decision for `agent.md` is recorded; `AGENTS.md` remains canonical and `agent.md` is no longer a Gate A blocker.

Completed:

- ADR-0009…ADR-0014 accepted by the owner.

ADR-0004 and ADR-0007 remain Accepted but are amended by this package to remove conflicts with the new canonical model.

## Final Gate A verification

Completed:

1. ADR-0009…ADR-0014 statuses updated to Accepted;
2. `git status --short` inspected;
3. `git diff --check` passed;
4. Markdown link/line-count checks passed;
5. secret scan for changed docs passed;
6. one active `PRE_SCAFFOLD_GATE.md` confirmed;
7. final read-only consistency review passed.

## Gate

Gate A is PASS. Begin only the minimal source scaffold and CI/test harness; Gate B1 is required before Guest exposure.
