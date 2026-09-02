# Operations

## Environments

Minimum:

- local;
- test/CI;
- staging;
- production.

Scanner template/binary promotion must pass through staging/canary before production.

## Runtime components

V1 expected:

- web;
- admin;
- API;
- PostgreSQL;
- Redis/queue;
- scanner workers;
- scheduled Threat Intelligence jobs.

## Observability

Collect:

### API

- request rate/latency/errors;
- auth failures;
- tenant authorization denials;
- quick scan rate limits;
- queue publish failures.

### Scanner

- jobs queued/running/failed/timed-out;
- duration by profile;
- worker saturation;
- resource limit kills;
- scanner version/profile;
- egress/destination policy denials.

### Threat Intelligence

- last successful sync per source;
- records ingested/updated;
- schema/parse failures;
- source staleness.

### Product

- guest scans;
- verification conversion;
- verified assets;
- monitored assets;
- findings by band/confidence;
- notification delivery.

## Backups

Before production define and test:

- PostgreSQL automated backup;
- retention;
- encrypted storage;
- restore drill;
- report/evidence storage backup requirements;
- RPO/RTO.

A backup without tested restore is not considered verified.

## Deployment

Do not deploy directly from an AI agent unless user explicitly requests deployment and project deployment procedure exists.

Production deployment gate:

- lint/typecheck/tests/build pass;
- relevant security negative tests pass;
- migrations reviewed;
- no secret/config leak in diff;
- scanner versions pinned;
- current audit/release decision updated.

## Scanner worker operations

- immutable/pinned image;
- resource limits;
- no host networking;
- no privileged container;
- restricted filesystem;
- no Docker socket inside worker;
- outbound network policy where infrastructure permits;
- disposable job state.

## Incident readiness

Before public launch create runbooks for:

- suspected secret exposure;
- tenant data access incident;
- scanner abuse;
- scanner escape/SSRF suspicion;
- Threat Intelligence source corruption;
- queue runaway/cost spike;
- account/admin compromise.
