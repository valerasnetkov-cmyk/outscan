# ADR-0017 — PostgreSQL SQL-first data access

**Status:** Accepted
**Accepted:** 2026-09-07
**Date:** 2026-09-07
**Owner:** Architecture / Data

## Context

Gate A and ADR-0010 already fix ownership, tenant-key, composite-FK and RLS rules. The first durable GuestScan slice now needs database constraints and transaction semantics without introducing an application framework that obscures those rules.

## Decision

1. PostgreSQL 18.x is the V1 system of record.
2. Versioned, append-only SQL files are the canonical schema migrations. V1 uses the low-level `pg` driver and no ORM or query builder.
3. Migrations run only through the dedicated CLI/deployment step, never automatically at API startup.
4. The migration ledger records SHA-256 checksums. A PostgreSQL advisory lock serializes runners; a changed, removed or out-of-order applied migration fails closed.
5. Every migration executes in its own transaction on one checked-out client. Application workflows that require a transaction must likewise use one checked-out client; pool-level query hopping is forbidden inside a transaction.
6. Application repositories use parameterized statements and explicit column projections. Dynamic SQL identifiers require a closed server-owned allowlist.
7. Connection configuration is bounded and explicit. Production requires certificate-validating TLS. Database URLs, credentials and provider error details are never logged or returned publicly.
8. Cryptographic hashes, digests and nonces use fixed-length `bytea`; timestamps use `timestamptz`. `jsonb` is allowed only for bounded, schema-validated and already sanitized projections, never arbitrary scanner output.
9. Guest tables remain separate PUBLIC_GUEST data with no `organization_id`. Tenant persistence will add mandatory organization keys, composite foreign keys and RLS before Gate B2.
10. Guest idempotency winner selection, abuse-counter reservation, terminal result commit/read and deletion will use explicit repository transactions. Serializable isolation and bounded retries are required where concurrent read-modify-write correctness depends on them.

## Initial migration

`0001_guest_scan.sql` creates `guest_scans`, `guest_scan_attempts` and `guest_results`. `0002_guest_abuse_counters.sql` adds server-owned pause state, digest-only counters and per-scan reservation/release identity; `0003_guest_abuse_expired_release.sql` adds a distinct closed `EXPIRED` release reason. Checks, unique keys, deferred relationships and guards enforce immutable identity, 30-minute access/idempotency, 24-hour deletion, job/attempt FSM and accepted result linkage.

The migrations are schema evidence. Current application slices add SERIALIZABLE Guest idempotency/abuse, exact-version attempt leases, cancellation, authenticated terminal result commit/no-write replay, strict result read and bounded retention. Migration `0004` adds an append-only, composite attempt/fence-bound Guest result-rejection event with closed codes and aggregate cascade. Migration `0005` adds immutable, 30-day PLATFORM/INTERNAL retention-run counters and closed alert state without Guest identity/content. Migration `0006` adds equivalent minimized immutable queue-outcome batches with exact replay and 30-day pruning. BullMQ composes PostgreSQL authority with supervisor heartbeat, mandatory rejection recording and worker-owned telemetry flushing. Production worker deployment/export, public cancellation authorization and HTTP routes remain Gate B1 work.

## Rejected now

- ORM schema generation or runtime schema synchronization;
- auto-migration during API startup;
- treating an in-memory store as persistence evidence;
- generic tenant tables with nullable organization ownership;
- storing raw scanner output in unbounded JSON.

## Consequences

- SQL invariants are reviewable and testable directly against PostgreSQL.
- Repository code must map database rows through the existing strict snapshot contracts.
- A future ORM/query builder requires a replacement ADR and must preserve the same constraints, migrations and transaction semantics.
- This post-Gate-A implementation decision does not reopen Gate A and does not make Gate B1 PASS.
