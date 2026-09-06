# Security Policy

## Canonical documents

- `docs/PRE_SCAFFOLD_GATE.md`
- `docs/SECURITY_MODEL.md`
- `docs/SCANNING_POLICY.md`
- `docs/TESTING.md`

## Gates

- Gate A before source scaffold.
- Gate B1 before Guest exposure.
- Gate B2 before Workspace.
- Gate C before production.

## Production blockers

- unresolved Critical/High;
- tenant/RLS failure;
- outbound connection not pinned to validated IP;
- mixed A/AAAA fail-open;
- verification/scope/consent bypass;
- scanner has DB/Redis/result credential/private network/metadata;
- Guest idempotency/token disclosure across anonymous sessions;
- job/lease/fence/digest primary-commit or terminal-replay integrity failure;
- unsafe scanner output;
- Admin MFA/step-up missing;
- failing security tests/build;
- uncontained secret.

## Reporting

Until official channel exists, do not place real secrets/customer data/exploitation details in public issues.

Before production configure security contact and response ownership.

A clean scan never proves absence of vulnerabilities.
