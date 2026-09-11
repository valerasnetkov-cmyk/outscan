# Operations

## Environments

local, test/CI, staging, production.

Current deployment target is an Ubuntu server with Docker Compose (owner accepted 2026-09-10). Staging/B1 evidence must exercise this target; Windows development or local Docker tests alone are insufficient. Kubernetes is a later destination for scanner execution workers, not a prerequisite for the current release. See [deployment target and B1 delivery order](DEPLOYMENT_TARGET.md).

Scanner/template promotion:
`staging → tests → owned canary → approval → production`.

## Runtime V1

The initial API-only container baseline and local commands are documented in [deployment target](DEPLOYMENT_TARGET.md#local-api-container-baseline). It publishes no ports and runs no worker/scanner/database; it is packaging/runtime-hardening evidence only, not the approved production topology.

web, admin, API, PostgreSQL, Redis/BullMQ, trusted supervisor, disposable scanners, TI jobs.

Future notification runtime adds an outbox dispatcher, delivery queue, email adapter, customer Telegram adapter, Ops Telegram adapter and authenticated provider-webhook handlers. The current foundation defines ports only and performs no delivery.

## Database changes

ADR-0017 fixes PostgreSQL 18 with append-only SQL migrations and the low-level `pg` driver. `pnpm --filter @outscan/api db:migrate` is an explicit deployment operation; API startup never migrates automatically. The runner uses a checksum ledger, one advisory lock and one checked-out client with a transaction per migration; drift or ordering conflicts fail closed. Production connections require explicit certificate-validating TLS. URLs/credentials and raw database errors must not be logged or returned publicly. CI runs the separate `pnpm verify:db` schema suite against an isolated PostgreSQL service.

Guest idempotency/admission/create/replacement, lease mutation and terminal result processing use SERIALIZABLE transactions with at most three attempts for serialization, deadlock or winner races. The internal creation service returns no result token until BullMQ acknowledges the exact stable GuestScan ID; if enqueue fails after commit, the same live idempotent request re-enqueues that ID without consuming quota or extending expiry. BullMQ transports only schema version and GuestScan ID; PostgreSQL remains attempt/fence authority. Queue delivery claims a fixed 15-second lease and 45-second attempt deadline; start/renew require current job, attempt, fence and exact lease version. The consumer renews every five seconds, aborts supervisor work on renewal loss and commits only after a clean run. Any rejected commit is idempotently recorded by closed code against the current attempt/fence before retry; a sink failure is itself fail-closed. The bounded retention process deletes rejection evidence with the 24-hour aggregate. It runs immediate non-overlapping cycles, then waits 60 seconds; each cycle executes at most ten 100-row batches. Production deployment and exported alert delivery remain required before Gate B1.

Queue/result-ingress telemetry aggregates only the twelve closed processor outcomes into stable immutable batches. Counts saturate at the PostgreSQL integer ceiling and derive one closed alert by fixed priority; no dynamic labels or Guest/target/session/tenant/payload/scanner fields exist. A failed store leaves the exact batch pending for idempotent replay while later outcomes accumulate separately. The worker runs a fixed ten-second non-overlapping cadence, reports only the closed flush result through a required callback, then closes queue intake, waits for any in-flight flush and performs one final flush. A final storage failure becomes `GUEST_WORKER_TELEMETRY_FLUSH_FAILED`; production worker deployment and approved Ops export must still be evidenced before Gate B1.

## Supervisor/scanner

Supervisor owns queue/result identity, policy and budgets.
Scanner has no DB/Redis/result credential, private network, metadata, privileged container, host network or Docker socket.

Outbound connections use validated-IP pinning with canonical Host/SNI/certificate validation.

Current implementation includes pre-launch authorization and a Guest orchestration layer over an injected process port: frozen non-secret launch input, one overall deadline and AbortSignal across launch/IPC/exit, exact exit validation, bounded one-result IPC, canonical output and supervisor HMAC signing. Failed/unknown process state requests TERM then KILL after a bounded grace; a valid handle returned after timeout/cancellation is killed without entering IPC. The fixed process adapter binds one approved artifact identity to one absolute executable/cwd and static bounded arguments, invokes no shell, inherits no environment, caps spawn plus stdin initialization at five seconds, sends only bounded canonical scanner input on stdin, ignores stderr and exposes stdout plus TERM/KILL. Fresh-read validation wrappers snapshot an exact active/revoked GUEST_SAFE approval and copied 256-bit signing key without caching. Concrete regular-file sources accept only `{schema_version:1,approval}` up to 16 KiB, `{schema_version:1,key_version,key_base64url}` up to 1 KiB and a 4 KiB `{schema_version:1,keys:[...]}` verification keyring containing 1–3 unique versioned 32-byte keys. Symlink/identity drift denies; POSIX approval is non-writable outside owner, while signing/keyring files are owner-only. A staged rotation must deploy/restart readers with active+retained verification keys before selecting the new signing version. Windows ACL and any symlink-based secret-volume adapter require separate evidence. The internal worker runtime composes PostgreSQL CAS lease/result/rejection adapters, server-owned context, heartbeat, supervisor and BullMQ behind idempotent ready/close. Redis URL and TLS mode are explicit; `rediss` requires authentication plus certificate validation. The dedicated CLI additionally denies startup unless the active signing-key version and bytes match the startup verification keyring. Production container/egress enforcement, managed secret service, worker deployment and approved alert export remain pending.

After a build, `pnpm --filter @outscan/api start:worker` requires `OUTSCAN_DATABASE_URL`, explicit `OUTSCAN_DATABASE_SSL`, `OUTSCAN_REDIS_URL`, explicit `OUTSCAN_REDIS_TLS`, and absolute paths in `OUTSCAN_GUEST_APPROVAL_FILE`, `OUTSCAN_RESULT_SIGNING_KEY_FILE`, `OUTSCAN_RESULT_VERIFICATION_KEYRING_FILE`, `OUTSCAN_SCANNER_EXECUTABLE` and `OUTSCAN_SCANNER_WORKING_DIRECTORY`. `OUTSCAN_SCANNER_ARGUMENTS_JSON` is a bounded JSON string array owned by deployment. Startup, pool failure and shutdown expose only stable local messages; stdout contains bounded `ready` and telemetry-flush status without job, target, session or payload identity. This local process contract is not a production runbook or deployment approval.

After a build, `pnpm --filter @outscan/api start:scanner -- '<runtime-json>'` runs the credential-free scanner process directly for controlled testing; normal execution is through the fixed launcher. The single bounded argument is exactly `{schema_version:1,dns:<RuntimeDnsConfig>,configured_internal_cidrs:[...]}` with literal resolver IPs, timeout/retry bounds and at most 128 unique CIDRs. Scanner stdin is the supervisor-owned canonical target/current policy document; stdout is exactly one bounded IPC frame and stderr exposes only a stable failure. Built-in and configured destination denial are both applied before transport, but production egress/isolation approval remains blocked.

## Observability

API: rates/errors/auth/tenant denials/Guest limits.
Jobs: states and bounded rejection-event code counts, lease/fence/digest/replay rejects, duration/profile, resource kills; never target, payload, digest or Guest IDs as metric labels.
Queue: only bounded outcome codes, backlog/age/retry/exhaustion/lease-loss; never GuestScan ID, target or payload as labels.
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

The runtime scheduler invokes the transactional `SKIP LOCKED` worker in bounded, non-overlapping cycles. Every completed cycle must be written before it is acknowledged to immutable `GuestRetentionRun` telemetry with `SUCCEEDED`, `PARTIAL` or `FAILED`, bounded counters, closed inconsistency/unavailable alert code and exact 30-day expiry. It contains no Guest ID, target, session/network digest, tenant field or scanner data. Store failure is a closed `RETENTION_RUN_STORE_UNAVAILABLE` process outcome. After a build, `pnpm --filter @outscan/api start:retention` runs the dedicated process with the same required TLS-explicit database environment; it never migrates automatically. The CLI emits only bounded status/counters; deployment and connection to an external Ops alert collector remain Gate B1 work.

Guest abuse counters are reserved atomically for new/replacement scans and released idempotently on accepted result, expired replacement, trusted internal cancellation, retry failure or access expiry. Cancellation locks the job/current attempt, invalidates a LEASED attempt as `SUPERSEDED` or a RUNNING attempt as `CANCELLED`, terminalizes the job and releases its reservation in one transaction; duplicate cancellation acknowledges without another decrement. This persistence command is not a public authorization boundary and has no route. Fixed V1 limits are 3/10m, 10/day and 1 concurrent per session scope; 20/10m, 100/day and 4 concurrent per pseudonymous network signal. `0002` stores only fixed digests/counters/reservations; `0003` adds the distinct `EXPIRED` release reason. Trusted ingress uses a closed proxy CIDR list and bounded forwarding chain. Normal network-HMAC rotation is two-stage: deploy the active+retained multi-digest reader everywhere, then select the new active key; keep old keys for at least 24 hours plus clock/deployment skew. Cleanup telemetry and public 429/cancellation mapping remain pending.

Guest-session MAC keys are a separate purpose/keyring from network HMAC, result-token and ResultEnvelope keys. Bootstrap and scan admission each read and copy a maximum of three 32-byte active/retained keys per request. The mounted-file adapter freshly reads a strict private JSON keyring and shares the regular-file, symlink/TOCTOU, size, UTF-8 and POSIX permission checks used by supervisor secrets. Normal rotation installs the new key plus retained prior keys before selecting it active and retains old keys through the 24-hour cookie lifetime plus skew; emergency removal takes effect on the next bootstrap/admission, causing a new scope through bootstrap while old-scope admission is denied. The PostgreSQL revocation store retains only a scope digest for exactly 24 hours; the existing retention scheduler performs its bounded expiry pruning and records only a deletion count. Provider/cleanup uncertainty returns the closed unavailable outcome. Managed key provisioning and deployment wiring remain Gate B1 work.

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
