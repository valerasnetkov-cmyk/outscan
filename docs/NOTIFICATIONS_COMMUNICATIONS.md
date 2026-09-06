# Notifications & Communications

**Status:** Accepted foundation architecture  
**Date:** 2026-09-06  
**Decision:** [ADR-0015](adr/0015-notifications-communications.md)

## Purpose

Notifications are a first-class domain/integration boundary. Auth, Risk, Monitoring, Scanner and Platform Admin emit events; they do not invoke vendors.

```text
Domain event
  → transactional outbox
  → notification dispatcher
  → current recipient policy/membership/preferences
  → delivery queue
  → email/customer Telegram/Ops Telegram adapter
```

Provider failure never rolls back the source business transaction.

## Streams

- `ACCOUNT_TRANSACTIONAL`: verification, recovery, account security and invitations; email only in the foundation policy.
- `CUSTOMER_TECHNICAL`: finding, threat-intelligence, asset, posture, certificate, score and monitoring events; technical email/customer Telegram.
- `PLATFORM_OPERATIONS`: worker, queue, scanner release, TI sync, delivery health, abuse and platform-security events; trusted Ops Telegram.
- Marketing is a separate future consent/campaign domain. No marketing event or adapter is active in the foundation.

Marketing consent never authorizes technical delivery, and unsubscribe never disables mandatory account/security delivery.

## Ownership

Account and user endpoint records are user-scoped. Tenant events, deliveries and preferences require organization ownership and future RLS. Ops records are platform-owned. Nullable tenant ownership is not used to combine these contours.

Tenant membership and endpoint state are re-evaluated before delayed delivery is planned/sent. Removed members do not receive new tenant messages.

## Recipient policy

Recipient resolution consumes only trusted user, membership, preference and platform configuration. Public/customer input cannot supply an email address, Telegram identity/chat ID or Ops endpoint to a privileged send path.

The foundation produces endpoint references, not raw addresses. Provider adapters receive resolved delivery messages only after policy and future persistence boundaries succeed.

## Delivery semantics

Delivery states are closed and include queued, sending, provider accepted, delivered, retry scheduled, unknown, permanent failure, bounced, complained and suppressed.

`UNKNOWN` represents a provider request whose acceptance cannot be proven after connection failure. Local idempotency prevents duplicate delivery rows, while provider idempotency/reconciliation is required later where supported. Exactly-once external delivery is not claimed.

Provider event IDs are processed idempotently. Stale events acknowledge without regressing state; complaint may supersede delivered.

## Content

Templates are versioned application content. External payloads contain allowlisted machine fields, customer-visible hostname/status/risk/action and a canonical `https://outscan.ru` link.

Never include raw evidence, arbitrary HTML/Markdown, headers, cookies, credentials, scanner payloads, provider tokens, internal commands or unrelated tenant data.

## Current implementation boundary

`apps/api/src/notifications` contains pure foundation primitives and ports. There is no route, persistence, queue, renderer, provider SDK, external call, UI or production credential.

## Roadmap

- Phase 2: account/transactional email provider ADR, persistence, outbox and webhook handling.
- Phase 4: customer technical email/Telegram and platform Ops alerts with monitoring.
- Later/Commercial: marketing consent, confirmation, campaign delivery and legal review.
