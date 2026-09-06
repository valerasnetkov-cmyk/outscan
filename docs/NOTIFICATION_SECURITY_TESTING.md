# Notification security and testing

**Status:** Required controls  
**Date:** 2026-09-06  
**Decision:** [ADR-0015](adr/0015-notifications-communications.md)

## Release invariants

- recipients derive from server-owned identity/membership/policy, never arbitrary client destinations;
- tenant events cannot resolve another tenant's member/content;
- account, tenant and platform ownership remain distinct;
- marketing consent/unsubscribe cannot control mandatory account/security delivery;
- customer and Ops Telegram credentials/destinations remain separate;
- provider/webhook authenticity precedes state change;
- repeated events/webhooks are idempotent and late events cannot regress state;
- binding tokens are random, expiring, single-use and hash-only at rest;
- external content is minimized and credential/evidence-free;
- provider failure cannot corrupt the source transaction.

## Foundation unit/negative evidence

- accept the complete closed event catalog and reject unknown/marketing/provider event types, scopes, priorities and fields;
- reject recipient override fields and cross-tenant/removed-member delivery;
- keep mandatory account email independent from marketing consent;
- derive stable versioned delivery keys and separate template versions;
- cover allowed/denied FSM transitions, uncertain outcomes, replay and stale webhook events;
- reject unsafe content fields, noncanonical hostnames, HTML and external/ambiguous links;
- reject invalid, expired, used, revoked or malformed Telegram binding tokens;
- reject missing/mismatched/cross-bot webhook secrets;
- prove notification and webhook routes remain absent.

Tests use fake adapters and deterministic fixtures. They perform no external delivery and are not evidence for persistence, tenant RLS, webhook parsing or production providers.

## Future integration/E2E evidence

Before Phase 2/B2 delivery:

- atomic business transaction + outbox insertion;
- unique delivery winner and crash recovery;
- current membership/preference check immediately before tenant delivery;
- provider-authenticated, schema-bounded webhook and replay fixtures;
- verification/recovery message flow without token leakage;
- bounce/complaint/suppression policy;
- provider idempotency and `UNKNOWN` reconciliation.

Before Phase 4 customer/Ops delivery:

- Critical finding → tenant email/customer Telegram summary;
- removed member receives no later event;
- concurrent single-use Telegram binding;
- customer request cannot select Ops endpoint;
- platform failure → Ops alert without recursive alert storm.

Before marketing launch:

- consent provenance/policy version and confirmation decision;
- unsubscribe and suppression behavior;
- mandatory account delivery remains available;
- legal/privacy and sender-domain evidence.

## Release FAIL conditions

Return FAIL for the applicable notification release if arbitrary recipients, cross-tenant content, unauthenticated webhooks, reusable/plaintext binding tokens, secret leakage, uncontrolled duplicate delivery, account/marketing suppression coupling, shared customer/Ops credentials or raw finding evidence remain possible.
