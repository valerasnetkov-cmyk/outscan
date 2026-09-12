# Synchronization guardrail

Implementation instructions below describe future work only; no apps/game, route, analytics or deployment is authorized by this document. Publication remains subject to CLAIM_INVENTORY.md and UX_ACCEPTANCE.md.

Status: documentation-only planned promo surface. This file does not authorize runtime implementation, scanner access, Guest/Workspace route changes, promotion verification bypass, or any B1/B2/C gate advancement. Before implementation, reconcile it again with current repository architecture and security policy.

# Game Security & Privacy

## Threat model

`game.outscan.ru` — публичный internet-facing origin. Хотя V1 не работает с клиентскими данными, он может стать путём к основному бренду/домену и позже к промобонусам.

## Security invariants

1. Anonymous player cannot cause scanner execution.
2. Game cannot create/modify DomainVerification or ScanAuthorization.
3. Client-provided score cannot create entitlement.
4. Game cookies/storage cannot become authenticated OUTSCAN session credentials.
5. Compromise of game frontend should not reveal OUTSCAN API/scanner secrets.
6. Game origin cannot read authenticated Workspace data by default.
7. No real target/domain input is required by V1.
8. No marketing consent is implied by game completion.

## Origin isolation

Use `game.outscan.ru` as distinct origin.

Do not configure shared auth cookie with `Domain=.outscan.ru` for the game.

Existing Workspace cookies should remain host-scoped / intentionally scoped and unavailable to game wherever architecture permits.

If cross-origin CTA/login handoff is later needed, use narrow signed/opaque one-time state, not shared privileged cookies.

## CSP baseline

Start restrictive and loosen only for actual dependencies.

Conceptual policy:

```text
default-src 'self'
script-src 'self'
style-src 'self'
img-src 'self' data: blob:
font-src 'self'
connect-src 'self' <explicit analytics/api hosts only>
object-src 'none'
base-uri 'none'
frame-ancestors 'none'
form-action 'self' https://outscan.ru
```

Exact header syntax belongs to deploy config and must be tested.

Avoid inline script/style exceptions if Astro build can emit external assets. Never add `unsafe-eval` for convenience.

## Local state

Game state is untrusted client data.

On load:

- JSON parse guarded;
- schema validated;
- numeric ranges bounded;
- unknown IDs rejected;
- impossible combinations normalized by reset rather than trusted;
- score recalculated from valid state.

Tampering can at most change local entertainment outcome. It cannot grant server benefits.

## Promo redemption boundary

If promo campaign is implemented:

```text
Game completion
  ↓
server issues bounded completion proof
  ↓
OUTSCAN account flow
  ↓
server validates proof + campaign + redemption constraints
  ↓
standard Access Grant
  ↓
normal domain verification
```

Requirements:

- short-lived or campaign-bounded proof;
- cryptographically protected server-side evidence or stored completion record;
- one-time redemption/idempotency;
- rate limit;
- anti-automation appropriate to campaign value;
- organization/campaign uniqueness enforced server-side;
- no client score trust;
- no `ADMIN_ATTESTED`;
- no intrusive privileges.

If no backend exists, UI must not claim an active reward.

## API/CORS

Prefer no game API in V1.

If needed later:

- exact allowed origin `https://game.outscan.ru`;
- CORS is not authentication;
- state-changing endpoints require normal auth/CSRF strategy where cookies are used;
- request body/schema/size limits;
- rate limiting on redemption/share generation.

## XSS

Scenario copy is repository-controlled content.

Still:

- render as text/default Astro escaping;
- no raw HTML from storage/query params;
- no user-controlled `innerHTML`;
- validate share/query values against enum/range allowlists.

## Analytics/privacy

V1 should work without analytics.

When enabled:

- minimize data;
- no real domain input;
- no email/name;
- no browser fingerprint;
- no full local game state;
- documented retention;
- respect applicable consent/legal policy.

## Abuse

Public static game has low server cost.

Potential abuse surfaces:

- promo redemption;
- server share-image generation;
- analytics flood.

Bound requests and costs before enabling these features.

## Supply chain

- use pnpm lockfile;
- avoid adding animation/state libraries unnecessarily;
- review every new direct dependency;
- no third-party scripts by default;
- no remote fonts by default;
- run existing dependency checks if configured.

## Security headers

Verify production effective headers, not only config source:

- CSP;
- HSTS;
- X-Content-Type-Options;
- Referrer-Policy;
- Permissions-Policy;
- frame protection via CSP;
- COOP/COEP only if required and compatibility-tested.

## Logging

V1 frontend should not send detailed logs containing local game state.

Server/deploy logs must not log auth cookies, redemption proofs or future account handoff tokens.
