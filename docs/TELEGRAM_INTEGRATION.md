# Telegram integration

**Status:** Accepted foundation architecture  
**Date:** 2026-09-06  
**Decision:** [ADR-0015](adr/0015-notifications-communications.md)

## Bot separation

OUTSCAN uses Telegram only for technical/operational alerts in the initial architecture:

- Customer Alerts Bot: direct messages to bound OUTSCAN users;
- OUTSCAN Ops Bot: trusted platform health/security destination.

The bots have separate tokens, webhook secrets, adapters, endpoints and authorization policy. Customer requests cannot select the Ops destination. Group delivery, bot mutation commands and Telegram marketing are out of scope.

## Customer binding

```text
authenticated OUTSCAN user
  → server issues 32-byte random one-time token
  → only versioned hash/reference is retained with user + expiry
  → user opens t.me deep link
  → authenticated Telegram webhook supplies numeric user ID
  → token/hash/TTL/unused state is checked
  → endpoint binds immutable Telegram user ID
  → token is consumed by a future atomic persistence transition
```

The foundation token is 43-character base64url, within Telegram's 64-character `start` limit. Username/display name is presentation metadata only and never authorizes identity or tenant membership.

## Webhook boundary

Production webhooks use HTTPS and separate secret values configured by `setWebhook`. Verify the exact `X-Telegram-Bot-Api-Secret-Token` before parsing body or changing state. Secret length is 1–256 and alphabet is `A-Z a-z 0-9 _ -`; comparison is constant-time.

Future handlers also require bounded body/schema, an explicit update-type allowlist, update-ID idempotency, safe logging and rate controls compatible with Telegram retry.

## Content

Messages contain a short machine-derived summary and canonical authenticated OUTSCAN link. They never include raw FindingEvidence, request/response dumps, cookies, authorization headers, credentials, scanner commands, exploit instructions or unrelated tenant data.

Telegram is not Workspace authentication. Detailed views/actions remain behind normal OUTSCAN authz.

## Disconnect and operations

Disconnect disables the endpoint and future deliveries; reconnect requires a new binding token. Bot-token/webhook-secret exposure requires rotation/revocation. Customer and Ops credentials rotate independently.

The current foundation provides token issuance/verification and webhook-secret verification only. It exposes no endpoint, bot call or credential.
