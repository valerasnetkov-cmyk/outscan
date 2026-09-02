# Architecture

## Goals

Архитектура V1 должна одновременно:

- позволять быстро собрать MVP;
- удерживать scanner execution за отдельной trust boundary;
- поддерживать multi-tenancy;
- позволять горизонтально масштабировать workers;
- не привязывать доменную модель к веб-сайтам;
- не создавать преждевременную микросервисную сложность.

## Deployable components V1

### `apps/web`

Public product + customer workspace.

Responsibilities:

- rendering/UI;
- browser session interaction;
- calls to API;
- no direct scanner invocation;
- no direct privileged DB access.

### `apps/admin`

Отдельный Platform Admin UI.

Responsibilities:

- platform operations;
- privileged actions only through server-side admin API policies;
- no reuse of client-only authorization assumptions.

### `apps/api`

Primary trusted application boundary.

Modules:

- auth;
- organizations;
- assets;
- verification;
- scans;
- findings;
- vulnerabilities;
- risk;
- threat intelligence;
- monitoring;
- change intelligence;
- notifications;
- reports;
- billing;
- admin;
- audit.

### `workers/scanner`

Isolated job execution boundary.

Responsibilities:

- receive minimal job contract;
- execute approved scanner adapter/profile;
- enforce runtime limits;
- return normalized raw observations/results;
- never access tenant DB directly.

## Proposed repository layout

```text
apps/
  web/
  admin/
  api/

workers/
  scanner/

packages/
  contracts/
  database/
  authz/
  risk-engine/
  scanner-contracts/
  security/
  ui/

infra/
  # create when implementation starts

docs/
  adr/
```

Do not create packages until at least two consumers or a clear trust-boundary reason exists.

## Data flow - guest scan

```text
browser
  -> web
  -> API quick-scan endpoint
  -> target validation
  -> safe probe job
  -> isolated worker
  -> normalized safe observations
  -> guest posture evaluator
  -> sanitized result
  -> browser
```

## Data flow - verified scan

```text
workspace
  -> API authorization
  -> verified asset/scope check
  -> scan job
  -> queue
  -> isolated worker
  -> approved scanners
  -> normalized observations
  -> finding normalizer
  -> threat intelligence enrichment
  -> risk engine
  -> persistence
  -> workspace/notifications
```

## Module boundaries

### Asset module

Owns:

- assets;
- asset identity/deduplication;
- asset relations;
- attribution reason/provenance/confidence;
- first/last seen;
- monitoring enrollment.

Does not own vulnerability severity.

### Scan module

Owns:

- scan request;
- job orchestration;
- job status;
- retries/idempotency;
- scanner profiles.

Does not contain scanner-specific parsing in controllers.

### Finding module

Owns normalized findings and lifecycle.

### Change Intelligence module

Owns security-relevant posture history and derived diffs.

Responsibilities:

- compare versioned observations/snapshots;
- emit normalized MonitoringEvents;
- classify change significance;
- preserve `before / after / observed_at / provenance`;
- trigger notifications or targeted re-evaluation when appropriate.

It must not treat every infrastructure change as a vulnerability.

### Threat Intelligence

Owns external CVE/KEV/EPSS data and provenance.

### Risk Engine

Pure/domain-oriented calculation. Must not depend on UI or scanner CLI implementation.

## Scale path

Start:

```text
API -> Redis -> scanner workers
```

Scale by queue/profile:

```text
DNS workers
Web workers
Vulnerability workers
Targeted CVE workers
```

Later regional scanner pools can be added without changing product data model.

## Agency / MSP tenancy path

Agency support does not weaken tenant boundaries.

```text
Partner Organization
      | delegated grant
      v
Client Organization A   Client Organization B
      |                        |
 isolated tenant         isolated tenant
```

Bulk partner views are aggregation over authorized organizations, not shared ownership storage. See ADR 0008.

## Avoid premature microservices

Extract a module into a service only when at least one is true:

- independent scaling is proven necessary;
- security boundary requires process/network isolation;
- deployment cadence differs materially;
- failure isolation is needed;
- ownership/team boundaries justify it.

Scanner workers already meet the security-boundary criterion and are separate from API from day one.
