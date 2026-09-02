# Testing strategy

## Testing pyramid

### Unit

- domain canonicalization;
- IP/range classification;
- Risk Engine;
- finding normalization;
- confidence mapping;
- state transitions;
- posture snapshot comparison/change classification;
- entitlement calculations.

### Integration

- DB repositories with tenant filtering;
- authz policies;
- queue/job lifecycle;
- verification;
- Threat Intelligence ingest;
- scanner result parsing using fixtures.

### E2E

Critical user flows:

1. guest domain scan;
2. guest result -> registration;
3. organization creation;
4. DNS verification;
5. verified baseline scan;
6. finding view/recheck;
7. monitoring change;
8. platform admin access boundaries;
9. partner delegated access to a client organization;
10. meaningful posture change -> MonitoringEvent -> notification path.

## Security negative tests

Mandatory when relevant:

### Tenant isolation

- user A cannot GET object B;
- user A cannot enumerate object B in list/search/export;
- user A cannot PATCH/DELETE object B;
- guessed UUID does not bypass policy.

### Roles / delegated access

- Viewer cannot mutate;
- Analyst cannot manage membership/plan;
- Workspace Owner cannot call Platform Admin endpoints;
- Support cannot obtain customer detail without grant once break-glass is implemented;
- Agency partner cannot access a client without active delegation;
- Agency partner delegated to client A cannot enumerate client B;
- bulk partner action rejects any organization outside granted scope.

### Guest scan / SSRF

Reject:

- localhost;
- private IPv4;
- link-local;
- private/link-local IPv6;
- metadata endpoints;
- forbidden target after redirect;
- rebinding/re-resolution to forbidden address where test harness supports it;
- oversized redirect chain;
- oversized response;
- malformed domain/IDN edge cases.

### Scan authorization

- unverified asset cannot run CONTROLLED/ACTIVE scan;
- client cannot submit arbitrary scanner CLI args;
- client cannot select DISABLED template/profile;
- expired/revoked verification blocks active scan.

### Resource abuse

- repeated scan request obeys limits;
- concurrent duplicate job remains idempotent when required;
- timeout kills job safely;
- worker failure does not leave permanent `running` job.

### Secrets/logging

- tokens/cookies absent from API error payload;
- known secret fixture is redacted from logs/evidence;
- client bundle contains no server secrets.

### Change Intelligence

- unchanged snapshot does not create noisy event;
- meaningful before/after diff is stable and deterministic;
- `DMARC reject -> none` can be classified as regression without being mislabeled as CVE;
- new asset and disappeared asset produce distinct events;
- historical snapshots are not mutated by later scans.

## Scanner testing

Never test intrusive profiles against third-party production targets.

Use:

- owned local fixtures;
- purpose-built vulnerable test applications in isolated staging;
- deterministic mock fixtures for parser/normalizer tests.

## Release gate

Before production:

- lint pass;
- typecheck pass;
- unit/integration pass;
- relevant E2E pass;
- security negative suite pass;
- production build pass;
- migration check pass;
- no unresolved Critical/High issue.
