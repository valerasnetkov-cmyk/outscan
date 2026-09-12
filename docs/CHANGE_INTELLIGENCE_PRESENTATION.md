# Change Intelligence presentation guidance

Status: V1.5 presentation guidance only
Normative architecture: accepted ADR-0007 and current `ACTION_CHANGE.md`

## Boundary

This document intentionally does not create a new `ChangeEvent` entity, scanner capability, route, visualization dependency or earlier release phase.

V1 continues to preserve versioned observations/snapshots/provenance. Full deterministic diff, significance, timeline and alert behavior remains V1.5 unless the owner accepts a later architectural change.

Prefer extending canonical `MonitoringEvent` before considering a parallel event model.

## User question hierarchy

Workspace Change Intelligence should answer:

1. What changed?
2. Where did it change?
3. Is the comparison valid/complete?
4. Why may it matter?
5. Does it require an action?
6. What was the previous state and when was each state observed?

## Compatible comparison rule

A visual delta exists only when canonical comparison policy says the two states are compatible. Failed, partial, missing, stale or unknown coverage cannot be drawn as improvement, disappearance or remediation.

Score deltas additionally require comparable baseline/coverage/model and monitored-set semantics.

## Presentation patterns

### Posture and score over time

Use a line only for genuinely continuous/ordered numeric history. Show coverage/comparability context near score history so a broader scan is not mistaken for a security regression.

### Discrete configuration state

For values such as DMARC policy, TLS version, CDN/WAF state, ASN/provider or certificate issuer, use a step/timeline representation rather than a smooth line.

### Risk portfolio

Stacked or grouped time buckets may summarize open Critical/High/Medium/Low counts only when each bucket follows the same canonical counting semantics.

### Activity

Show new/resolved/reopened/accepted events as event counts; do not confuse activity volume with risk level.

### Backlog/remediation

After Action Center exists, show unresolved high-priority work and remediation/recheck state from canonical workflow records. `REPORTED_COMPLETE` must never look equivalent to verified Finding resolution.

### Timeline

Every important chart point should be drillable to the canonical event/object and an action when one exists:

```text
chart/event marker -> MonitoringEvent/FindingEvent -> Asset/Finding -> allowed action
```

## Event display contract

For a change row, prefer:

```text
observed time
asset
change type
before -> after
significance
coverage/comparability state
why it matters code/copy
action link if authorized
```

Bound and context-escape all display values. Raw scanner evidence, credentials and internal engine/template identifiers stay out of normal change views.

## Visualization library

The historical package proposed ECharts. This synchronized package does not approve a visualization dependency. Choose a library only during implementation after reviewing bundle size, accessibility, maintenance, security/provenance and existing frontend patterns.

## Visual preview exclusion

Screenshots/favicon/title preview are not part of this document. Current V1 denies `HEADLESS_BROWSER`; preview requires its own later security decision and browser/egress/storage controls.

## Acceptance themes

- deterministic stable ordering for the same canonical input;
- no event on identical values;
- invalid/incompatible coverage cannot imply removal/improvement;
- timestamps/timezones remain explicit;
- keyboard/screen-reader/table fallback for essential chart meaning;
- chart color is never the sole status carrier;
- 320px/zoom reflow remains usable;
- no public/Guest exposure of tenant Change Intelligence before its own gates.

This document adds presentation consistency only and is not V1.5 runtime evidence.
