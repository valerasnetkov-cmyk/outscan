# ADR-0015 — Event-driven Notifications & Communications

**Status:** Accepted  
**Date:** 2026-09-06  
**Owner acceptance:** confirmed in the implementation directive.

## Context

OUTSCAN needs account email before Workspace auth can ship, customer security notifications with monitoring, and platform operations alerts. Direct provider calls from Auth, Risk, Monitoring, Scanner or Platform Admin would mix recipient authorization, retries, secrets and vendor state with domain transactions.

The former generic TENANT `Notification` entry in ADR-0010 cannot represent pre-Organization account delivery or platform Ops delivery without nullable tenant ownership and ambiguous RLS.

## Decision

1. Domain modules emit closed, schema-versioned events and never call email or Telegram providers directly.
2. Persisted delivery will use `business transaction → transactional outbox → dispatcher → current policy/membership/preferences → delivery queue → channel adapter`.
3. Recipient endpoints are resolved server-side. Client payloads cannot select an arbitrary email address, Telegram identity/chat or Ops destination.
4. Ownership is separated:
   - account events/deliveries and user endpoints/bindings are user-scoped GLOBAL SENSITIVE rows;
   - tenant events/deliveries/preferences require `organization_id`, tenant constraints and RLS;
   - platform/Ops events/deliveries/endpoints are PLATFORM and cannot carry routine customer evidence;
   - marketing consent/suppression is separate from technical/account policy.
5. Account/technical email uses the planned logical sender `notify.outscan.ru`; marketing uses the planned `news.outscan.ru`. These are not production-ready claims until DNS/provider/legal evidence exists.
6. Customer Telegram and Ops Telegram have separate bots, credentials, webhook secrets, adapters and destinations.
7. Telegram binding uses a random short-lived single-use token stored only as a hash/reference and binds immutable numeric Telegram user ID, never username.
8. External content is an allowlisted summary and canonical OUTSCAN link. Raw FindingEvidence, scanner payloads, credentials, cookies, authorization headers and exploit-ready details remain inside authorized views.
9. Provider webhooks are authenticated before body-driven state changes, schema-validated and idempotent. Late events cannot regress delivery state.
10. Local delivery creation is idempotent, but provider acceptance can be uncertain; the domain models `UNKNOWN` and does not promise exactly-once external delivery.
11. Concrete email provider selection requires a later ADR.

## ADR-0010 refinement

This ADR supersedes only the single generic `Notification` matrix row in ADR-0010. All existing tenant composite-FK/RLS and grant rules remain unchanged. The canonical entity matrix now lists the separate ownership contours above.

## Current foundation

The initial source slice provides a closed catalog, strict event validation, recipient-policy decisions, versioned delivery keys, delivery FSM, safe content projection, adapter/outbox ports, fake test adapters and Telegram token/webhook primitives.

It provides no database schema, transaction implementation, HTTP route, UI, provider SDK, credential, webhook body parser or external send.

## Consequences

- Gate A remains PASS; this is a post-Gate-A decision.
- Gate B1 is unchanged because no Guest surface is added.
- Phase 2/B2 must add transactional email persistence and verified provider integration before Workspace auth flows depend on it.
- Customer and Ops technical notifications align with current Phase 4 TI/Risk/Monitoring work.
- Marketing remains Later/Commercial and requires consent/legal review.

## References

- [Notifications & Communications](../NOTIFICATIONS_COMMUNICATIONS.md)
- [Email delivery](../EMAIL_DELIVERY.md)
- [Telegram integration](../TELEGRAM_INTEGRATION.md)
- [Notification security/testing](../NOTIFICATION_SECURITY_TESTING.md)
- [ADR-0010](0010-tenancy-data-classification.md)
