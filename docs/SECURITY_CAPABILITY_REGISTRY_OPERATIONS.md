# OUTSCAN Security Capability Registry Operations

**Status:** Operational extension of `SECURITY_CAPABILITY_REGISTRY.md`
**Scope:** Platform Admin, evidence, caching, observability and compatibility

## 1. Platform Admin

Initial Admin implementation should be read-only.

Show:

- capability name;
- release state;
- public visibility;
- maturity;
- access class;
- supporting engines/data sources;
- last validation timestamp;
- evidence state;
- health/degradation indicator.

Write controls should be introduced only after the rollout/audit model is implemented.

Any later privileged change to production rollout must be:

- server-side authorized;
- audited;
- attributable to an actor;
- reversible where practical;
- unable to weaken scanner policy.

## 2. Claim and evidence rule

A public capability claim requires evidence.

Examples:

- production adapter exists;
- required integration tests pass;
- public behavior matches the copy;
- security restrictions are enforced;
- current production rollout is active.

Do not publish unsupported numeric claims such as number of checks, sources, detection rules or coverage percentage unless separately evidenced and approved.

## 3. Caching and invalidation

Public capabilities are low-frequency metadata and may be cached.

Requirements:

- cache only public projection;
- define explicit TTL;
- support invalidation on production rollout change;
- never cache privileged/internal registry payload in public CDN/browser caches;
- safe failure must not accidentally expose staging/internal capabilities.

## 4. Observability

Track at minimum:

- registry load/validation errors;
- invalid or duplicate slugs;
- unknown engine bindings;
- rollout state inconsistencies;
- public projection generation errors;
- stale validation/evidence state;
- public API error rate.

Do not log secrets or scanner credentials.

## 5. Compatibility rules

Capability slug is a stable public/internal identifier once released.

Changing display name must not change slug.

Renaming or splitting an active capability requires an explicit migration plan for:

- reports;
- tariff references;
- findings/coverage presentation;
- API consumers;
- historical snapshots.

## 6. Non-goals for first implementation

Do not build in the first slice:

- percentage rollouts;
- customer-specific experimental capabilities;
- arbitrary CMS editing;
- workflow designer;
- dynamic scanner permission editor;
- public engine version dashboard;
- auto-publish from GitHub/upstream releases;
- a second feature-flag platform.

## 7. Definition of done

The first implementation is complete when:

1. one canonical code-first registry exists;
2. duplicate capability slugs fail validation;
3. public projection exposes only allowed fields;
4. only production-active/public-visible capabilities are returned publicly;
5. homepage renders from the public projection;
6. changing public presentation cannot change scan authorization;
7. tests prove Guest cannot gain verified/controlled execution via registry changes;
8. unavailable/failed registry does not expose internal metadata;
9. documentation and changelog are synchronized;
10. relevant Gate B evidence is recorded before public deployment.
