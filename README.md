# OUTSCAN

**OUTSCAN** — SaaS-платформа мониторинга внешних киберрисков и цифрового периметра организации.

Domain: `outscan.ru`
Repository: `https://github.com/valerasnetkov-cmyk/outscan.git`
Slogan: **Внешние риски под контролем.**

## Product flow

`Guest Scan → Registration → Organization → Add exact host/Create Asset → DNS Verification → Verified Baseline → Asset Security Score → optional MonitoringEnrollment`.

Guest is safe/non-intrusive, not purely passive.

## V1 scope

Input: hostname/domain only.
VerifiedScope: EXACT_HOST only.

Disabled:

- DOMAIN_SUBTREE;
- IP/CIDR;
- Naabu/raw TCP;
- ACTIVE;
- authenticated scanning.

DNS verification requires persistent TXT and revalidation per ADR 0009.

## Guest idempotency boundary

Anonymous scan replay is scoped by a server-issued, Secure/HttpOnly host-only Guest-session cookie. IP/NAT/User-Agent/browser fingerprint are abuse signals only, not authorization/idempotency ownership.

Result-token derivation and replay semantics are defined in ADR 0011.

## Security architecture

```text
Web/Admin
  ↓
API
  ↓
PostgreSQL / BullMQ
                 ↓
         trusted supervisor
                 ↓
        disposable scanner
                 ↓
       controlled Internet
```

Outbound probes pin actual connection to validated IP while preserving Host/SNI/certificate hostname verification.

Scanner gets no DB/Redis/Result-Ingress credential.

## Core concepts

- ProductCapability registry for public/product metadata only;
- Asset / AssetRelation;
- DomainVerification / VerifiedScope;
- ScanRequest / ScanJob / ScanAttempt;
- ExecutionEnvelope;
- ResultEnvelope with ScannerResultEnvelope payload;
- Finding / FindingOccurrence / FindingEvent / FindingDisposition / FindingCoverage;
- AssetPostureSnapshot;
- Asset Security Score / Organization Security Score;
- MonitoringEnrollment;
- Notifications & Communications event/delivery boundary;
- PartnerDelegation / SupportAccessGrant.

Public capability surfaces are generated from the Product Capability Registry. Scanner execution remains independently controlled by `ScanAuthorization` and the ADR-0012 scanner policy.

The first External Asset Sources foundation supports bounded Yandex Metrika counter parsing, hostname normalization and candidate provenance without exposing routes or credentials. Metrika discovery never establishes verification or scan authority; the full Workspace delivery remains gated by Organization authz, RLS, audit and encrypted secret storage. See `docs/YANDEX_METRIKA_ASSET_IMPORT.md`.

Notifications use a closed event → future transactional outbox → server-side policy/preferences → isolated channel-adapter design. The current foundation contains pure contracts and Telegram security primitives only; no route, provider SDK, credential or external delivery exists. See `docs/NOTIFICATIONS_COMMUNICATIONS.md` and ADR 0015.

The current Guest supervisor foundation composes approved execution state, a frozen non-secret launch plan, bounded local IPC, canonical target-bound output and supervisor-only ResultEnvelope HMAC signing. Its process launcher and signing-key provider are injected test boundaries; no production child process, secret manager, queue, persistence, outbound scan or Guest route exists yet.

## Scores

Asset Security Score exists only when `SufficientBaselineV1=true`.
Organization Security Score includes explicitly monitored assets only.

## Change Intelligence

V1 stores snapshots/provenance.
V1.5 adds full diff/significance/timeline/alerts.

## Claims / design

Public copy follows `docs/CLAIM_INVENTORY.md`.
Design/accessibility contract: `docs/UX_ACCEPTANCE.md`.
`public/maket.png` is retained temporarily as a reference for the first-screen build. It is not accepted Gate A evidence and must not drive blocked claims or nonconforming visual decisions; before Gate B1/public deployment it must be moved/excluded if it would be served.

## Gate

See `docs/PRE_SCAFFOLD_GATE.md`.

Current: package/security/content consistency PASS; ADR-0009…ADR-0014 are Accepted; post-acceptance checks passed; Gate A PASS. Minimal source scaffold and CI/test harness are in place; Gate B1 work is in progress.

Capability Registry integration does not reopen Gate A. Its public API and homepage block remain non-deployed until applicable Gate B1 and claim/evidence requirements pass.

The Yandex Metrika foundation also leaves Gate A unchanged. It is not publicly exposed and does not make Gate B2 PASS.

ADR-0015 is an accepted post-Gate-A decision. Its notification foundation does not reopen Gate A/B1 and does not make Gate B2 PASS.

## Development

Read:

1. `AGENTS.md`;
2. `docs/PRE_SCAFFOLD_GATE.md`;
3. `plan.md`;
4. `CHANGELOG.md`;
5. relevant docs/ADR;
6. latest audit.

Graphify only after Gate A PASS and meaningful source scaffold.

### Local commands

Requirements: Node.js 24+ and pnpm 11.19.0.

```text
pnpm install
pnpm dev:web
pnpm dev:api
pnpm dev:admin
pnpm verify
```

The public scan control is intentionally disabled. No Guest Scan endpoint or outbound scanner is exposed before Gate B1.
