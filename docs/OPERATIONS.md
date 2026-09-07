# Operations

## Environments

local, test/CI, staging, production.

Scanner/template promotion:
`staging → tests → owned canary → approval → production`.

## Runtime V1

web, admin, API, PostgreSQL, Redis/BullMQ, trusted supervisor, disposable scanners, TI jobs.

Future notification runtime adds an outbox dispatcher, delivery queue, email adapter, customer Telegram adapter, Ops Telegram adapter and authenticated provider-webhook handlers. The current foundation defines ports only and performs no delivery.

## Database changes

ADR-0017 fixes PostgreSQL 18 with append-only SQL migrations and the low-level `pg` driver. `pnpm --filter @outscan/api db:migrate` is an explicit deployment operation; API startup never migrates automatically. The runner uses a checksum ledger, one advisory lock and one checked-out client with a transaction per migration; drift or ordering conflicts fail closed. Production connections require explicit certificate-validating TLS. URLs/credentials and raw database errors must not be logged or returned publicly. CI runs the separate `pnpm verify:db` schema suite against an isolated PostgreSQL service.

Guest idempotency/admission/create/replacement and terminal result processing use SERIALIZABLE transactions with at most three attempts for serialization, deadlock or unique-winner races. New scans lock/re-check four window and two active digest-only dimensions; denial rolls back every tentative scan/counter row. Result processing authenticates/canonicalizes, uses PostgreSQL transaction time for lease/deadline checks and releases concurrency in the primary commit; terminal replay is read-only. The bounded retention worker locks due scans/windows with `SKIP LOCKED`, reconciles active quota and deletes the entire Guest aggregate transactionally; its report exposes remaining work and inconsistency/alert state. Unknown/ambiguous database failure returns one stable unavailable code. Production scheduling plus durable pool/counter/deletion metrics and alerts remain required before Gate B1.

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

Future promotion operations require bounded redemption/denial/capacity/expiry/revoke metrics without promo secrets or high-cardinality tenant data. Entitlement authorization checks timestamps directly; scheduled expiry is reporting/notification assistance, not correctness. Key rotation, transactional capacity, reconciliation and restore evidence are release blockers.
External asset integrations (when runtime delivery exists): sync success/failure/duration, fetched/rejected record counts, candidate counts, 401/429 totals and lock contention. Never label metrics with tokens, raw URLs, owner login or unbounded provider values.
Notifications (when runtime delivery exists): outbox/queue age, attempts/success/failure, unknown outcomes, dead letters, bounce/complaint/suppression, Telegram rate limits, webhook-auth failures and binding failures. Never label or log addresses, chat IDs, tokens, message bodies or unbounded provider values.

Future Weekly Digest telemetry covers generation outcome/duration, closed suppression reason, selected item count, source staleness, queue backlog and delivery outcome. Labels/logs exclude organization identity, recipient and content; sustained generation/source/delivery failures use existing Ops notification policy. No scheduler or metric is active before ADR-0016 acceptance.

Future Check-in metrics use only bounded counts for eligibility, surfacing, answers, deferrals, preference changes and validation failures. Logs/analytics exclude selected answer, correctness, question text, user/organization identity and scoring metadata. The global rollout remains disabled until post-B2 privacy/security/UI evidence exists.

Deferred Action/Change operations measure action aging/assignment/report-to-verified time, recheck authorization outcomes, compatible diff/event counts, rule evaluation/delivery and TI/lifecycle freshness using bounded labels. They do not log evidence/notes/tenant values. Visual preview has no operational approval until a separate browser-isolation ADR and runbook exist.

Only the safe public projection may use public/CDN caching. Product visibility is not the scanner kill switch; scanner disable/rollback remains under the independent scanner policy and release process.

## Guest retention

Token TTL 30m.
Guest aggregate max 24h.
Deletion job has metrics/alert and verification test.

The current pure retention decision validates the fixed 24-hour deadline and emits `DELETE_NOW` at the exact boundary. Runtime deletion, retry/dead-letter handling and alert evidence remain pending.

Guest abuse counters are checked/reserved atomically for new/expired-replacement scans and concurrency is released idempotently on accepted terminal result or replacement. Fixed V1 limits are 3/10m, 10/day and 1 concurrent per authenticated session scope; 20/10m, 100/day and 4 concurrent per pseudonymous network signal. `0002_guest_abuse_counters.sql` stores only fixed digests, closed dimensions, counts and reservation/release metadata. Trusted-proxy configuration, key provisioning/rotation, non-success terminal release, cleanup/metrics and public mapping remain pending. Rotation must not silently create a quota-reset window: deployment needs retained-key/dual-read or a documented fail-closed migration before wiring.

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
