# Synchronization guardrail

Implementation instructions below describe future work only; no apps/game, route, analytics or deployment is authorized by this document. Publication remains subject to CLAIM_INVENTORY.md and UX_ACCEPTANCE.md.

Status: documentation-only planned promo surface. This file does not authorize runtime implementation, scanner access, Guest/Workspace route changes, promotion verification bypass, or any B1/B2/C gate advancement. Before implementation, reconcile it again with current repository architecture and security policy.

# Game Acceptance & Test Plan

## Unit — engine

Test every command and guard.

### Core

- starts with day 1, capacity 6;
- discovery reveals exactly expected assets;
- action cost deducted once;
- duplicate action does not double-charge;
- insufficient capacity rejects paid action;
- free observe/recheck remains available at capacity 0;
- cannot jump from day 1 to day 3;
- reset returns pristine state.

### Recheck

- remediation alone is not VERIFIED;
- successful recheck marks expected task verified;
- duplicate recheck does not add score;
- recheck before remediation rejected where inappropriate.

### Business consequences

- full API shutdown sets orders DOWN;
- correct API remediation preserves orders UP;
- missing certificate renewal by day 3 triggers intended disruption;
- preview full shutdown affects preview workflow;
- safe campaign delay does not mark storefront down.

### Change event

- sale asset absent before day 3;
- sale asset appears on day 3;
- appearance alone does not mark it vulnerable;
- monitoring only after explicit action;
- monitoring does not close finding.

## Unit — scoring

Verify exact fixtures:

- canonical perfect route = 1000;
- all remediations, no rechecks = 800;
- missing API recheck = 940;
- optional hardening consumes final unit + campaign delayed fixture = expected configured score;
- score is recomputed, not read from storage.

Snapshot test score breakdown labels only if stable and useful; prefer explicit assertions.

## Unit — ending

- score 1000 + all success conditions → PERIMETER_MONITORED;
- high score + missing required recheck → CONTROL_INCOMPLETE;
- campaign delayed → LAUNCH_DELAYED;
- orders down → STORE_DISRUPTED even with high score.

## Persistence

- valid v1 state round trips;
- malformed JSON resets safely;
- unknown schema version prompts restart;
- forged score ignored;
- unknown decision ID rejected;
- impossible capacity rejected/reset.

## UI/E2E desktop

Critical path:

1. open `/`;
2. start mission;
3. discovery;
4. resolve old asset;
5. recheck;
6. resolve preview correctly;
7. day 2 priorities;
8. API remediation + recheck;
9. certificate + recheck;
10. investigate probable signal;
11. save snapshot/monitor;
12. day 3 change;
13. resolve sale asset + recheck;
14. result 1000 / correct ending;
15. CTA and replay.

## E2E negative paths

- disable API → disrupted ending;
- spend budget on unnecessary upgrade → safe fallback still allows finish;
- skip certificate → known deadline consequence;
- skip monitoring → no best ending;
- refresh mid-game → state restored;
- localStorage unavailable → game remains playable in-memory.

## Accessibility

Automated + manual:

- axe or existing accessibility tooling has no critical/serious findings;
- full game keyboard-only;
- focus order logical;
- visible focus;
- no color-only state;
- map info available as semantic list;
- live announcements not excessive;
- 200% zoom usable;
- 360px viewport no horizontal task-flow scroll;
- reduced motion verified.

## Visual QA

Representative viewports:

- 360x800;
- 390x844;
- 768x1024;
- 1440x900;
- 1920x1080.

Inspect:

- map/node collision;
- text wrapping;
- task rail overflow;
- result hierarchy;
- status contrast;
- disabled/hover/focus/active;
- long Russian labels;
- no decorative AI-default patterns.

## Performance

Production build only.

- inspect client bundle size;
- no accidental full-framework hydration;
- no unnecessary third-party requests;
- Lighthouse as diagnostic;
- CLS/LCP/INP reviewed on mobile profile.

Do not block solely on arbitrary Lighthouse 100, but investigate meaningful regressions.

## Security negative tests

If V1 stays static:

- no secret in built JS/assets;
- no workspace/scanner endpoint imported;
- game state tamper cannot affect external systems;
- query params do not render raw HTML.

If promo endpoint added:

- forged completion rejected;
- replay rejected/idempotent;
- expired proof rejected;
- wrong campaign rejected;
- duplicate organization grant rejected;
- client score changes eligibility by 0;
- grant still requires normal domain verification;
- rate limit works.

## Repository verification

Run actual available commands and report results:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:lines
pnpm verify
git diff --check
```

Do not claim a command passed if it was not run.
