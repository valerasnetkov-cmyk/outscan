# Email delivery

**Status:** Accepted provider-neutral foundation design  
**Date:** 2026-09-06  
**Decision:** [ADR-0015](adr/0015-notifications-communications.md)

## Separation

Planned logical domains:

```text
notify.outscan.ru → account and technical/security email
news.outscan.ru   → future marketing email
```

Addresses are configuration, not domain constants. Real sending requires provider-domain verification, one valid SPF policy per owner name, DKIM, DMARC, bounce/complaint feedback and production evidence.

Marketing credentials, reputation, consent and suppression remain independent from mandatory account and technical delivery.

## Adapter contract

`EmailProviderAdapter` consumes a server-resolved endpoint reference, delivery/idempotency identity, template ID/version and validated safe content. Provider SDK objects and arbitrary template names never enter domain events.

The foundation supplies only the port and fake adapters. Provider selection requires a separate ADR covering availability/legal fit, webhook authenticity, deliverability, suppression, rate limits, data location, cost and migration.

## Webhooks and state

Provider authenticity is verified before parsing state-changing content. Events are matched through local delivery correlation, not provider-supplied tenant/user IDs. Replays acknowledge without duplicate effects; late events cannot regress delivery state.

Normalized outcomes include accepted, delivered, unknown, permanent failure, bounce, complaint and suppression. Transient failures use bounded retry/backoff; permanent validation/bounce failures are not retried as network errors.

If provider acceptance is uncertain, record `UNKNOWN` and reconcile. Do not blindly resend while claiming exactly-once semantics.

## Content and privacy

- escape all rendered variables for their output context;
- reject arbitrary HTML, template paths and redirect origins;
- keep detailed findings in authenticated OUTSCAN views;
- do not log rendered bodies, verification/recovery tokens or credentials;
- do not enable marketing open/click tracking for technical mail by default.

## Suppression

Distinguish hard bounce, complaint, marketing unsubscribe and administrative suppression. Marketing unsubscribe cannot suppress verification, recovery or explicitly mandatory security messages.

## Failure independence

Provider outage changes delivery state only. It cannot roll back a Finding, MonitoringEvent or committed account request, block scanners, or exhaust synchronous request workers. Account ownership remains pending until the delivered verification/recovery proof is successfully used.
