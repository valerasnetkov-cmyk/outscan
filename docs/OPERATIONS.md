# Operations

## Environments

local, test/CI, staging, production.

Scanner/template promotion:
`staging → tests → owned canary → approval → production`.

## Runtime V1

web, admin, API, PostgreSQL, Redis/BullMQ, trusted supervisor, disposable scanners, TI jobs.

Future notification runtime adds an outbox dispatcher, delivery queue, email adapter, customer Telegram adapter, Ops Telegram adapter and authenticated provider-webhook handlers. The current foundation defines ports only and performs no delivery.

## Supervisor/scanner

Supervisor owns queue/result identity, policy and budgets.
Scanner has no DB/Redis/result credential, private network, metadata, privileged container, host network or Docker socket.

Outbound connections use validated-IP pinning with canonical Host/SNI/certificate validation.

Current implementation includes pre-launch authorization and a Guest orchestration layer over an injected process port: frozen non-secret launch input, one overall deadline, cancellation, exact exit validation, bounded one-result IPC, canonical output and supervisor HMAC signing. Failed/unknown process state requests TERM then KILL after a bounded grace. Queue consumption, CAS state transitions, the production process/container adapter, OS isolation, egress enforcement, secret-manager provisioning and result submission remain pending.

## Observability

API: rates/errors/auth/tenant denials/Guest limits.
Jobs: states, lease-expired commit rejects, fence conflicts, digest conflicts, replay rejects, duration/profile, resource kills.
Verification: challenge/revalidation/stale/expired counts.
Guest: token expiry/abuse/deletion.
Scanner: capability/policy/egress denials.
TI: freshness/schema errors.
Product: sufficient/insufficient baselines, enrollment, monitored assets.
Capability registry: validation/projection errors, duplicate or unknown slugs and stale claim/evidence state.
External asset integrations (when runtime delivery exists): sync success/failure/duration, fetched/rejected record counts, candidate counts, 401/429 totals and lock contention. Never label metrics with tokens, raw URLs, owner login or unbounded provider values.
Notifications (when runtime delivery exists): outbox/queue age, attempts/success/failure, unknown outcomes, dead letters, bounce/complaint/suppression, Telegram rate limits, webhook-auth failures and binding failures. Never label or log addresses, chat IDs, tokens, message bodies or unbounded provider values.

Only the safe public projection may use public/CDN caching. Product visibility is not the scanner kill switch; scanner disable/rollback remains under the independent scanner policy and release process.

## Guest retention

Token TTL 30m.
Guest aggregate max 24h.
Deletion job has metrics/alert and verification test.

## Backups

Before production: encrypted backups, retention, RPO/RTO, report/evidence requirements, restore drill.
Backup without restore evidence is unverified.

## Admin

Before production: MFA, step-up, PlatformAuditLog, SupportAccessGrant reason/scope/expiry.

## Incidents

Runbooks:

- secrets;
- tenant isolation;
- scanner/SSRF/pinning;
- result digest conflict;
- queue runaway;
- abuse;
- TI corruption;
- admin compromise;
- Guest deletion failure.
- email provider outage/key exposure;
- customer/Ops Telegram credential or webhook-secret exposure;
- notification storm or unknown provider outcome backlog;
- wrong-recipient/cross-tenant notification;
- marketing consent/suppression failure.

## Claims

Availability/latency/notification claims require production metrics and claim-inventory approval.

## Disclosure

Configure official security contact and consider `/.well-known/security.txt` before public production.
