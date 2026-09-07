# Security Glossary

**Status:** Planned post-B1 public metadata module; no runtime implementation

## Purpose

Security Glossary is the canonical Russian-first vocabulary for public pages and explicit help links in OUTSCAN results, findings, reports and future educational surfaces.

It explains security concepts but is not a scanner, Risk Engine, evidence source, capability catalog or authorization policy.

```text
GlossaryTerm/publicVisible
  != ProductCapability release/publication
  != ScannerCapability
  != VerifiedScope
  != ScanAuthorization
```

The module does not reopen Gate A, does not block Gate B1 and is scheduled only after the current Guest/B1 critical path.

## V1 boundary

- Code-first package `@outscan/glossary`, following the existing dependency-free Capability Registry pattern.
- Russian canonical copy with optional English name, abbreviation and normalized aliases.
- Read-only public projection, deterministic in-process search and static/indexable web pages.
- No database, CMS/Admin CRUD, external search service, runtime AI generation, user content or external content ingestion.
- Editorial changes use version control, security/content review and the normal release process.

No ADR is required for this metadata-only V1. A later database/CMS, external ingestion, AI-authored production content or dedicated search service requires a separate accepted decision.

## Canonical term model

Every registry record has an exact closed shape:

```text
slug
termRu
termEn?
abbreviation?
aliases[]
category
shortDefinition
plainExplanation
whyItMatters
example?
importantNote?
relatedTerms[]
relatedCapabilities[]
audience[]
reviewState
reviewedAt?
publicVisible
sortOrder
```

Closed categories:

```text
core
risk-intelligence
domain-dns
email-security
web-security
network-infrastructure
vulnerabilities
security-testing
```

`reviewState` is `DRAFT | APPROVED | DEPRECATED`. Public projection is fail-closed and includes only `APPROVED + publicVisible` records. Reviewer identity/internal notes are outside the public DTO. A review date alone is not approval evidence.

Slugs are immutable lowercase ASCII kebab-case identifiers, 1–80 characters and globally unique. Published slug changes require an explicit reviewed redirect; V1 seed import creates no alias routes.

All strings and arrays have implementation-time length/count ceilings. Definitions are structured plain text, never arbitrary HTML/Markdown. Related-term cycles are allowed because the graph is navigational.

## Registry validation

Build/test validation rejects:

- unknown/missing fields, enum values and malformed dates/slugs;
- duplicate slugs, sort orders or normalized aliases/abbreviations that resolve to different terms;
- blank required copy or public terms without APPROVED review state;
- unknown `relatedTerms`;
- unknown capability slugs in strict cross-registry validation;
- values exceeding field, alias, relation or total registry limits;
- prohibited scanner commands, template/engine/image identifiers, secrets or unsupported absolute-security claims in public projection.

`relatedCapabilities` is internal descriptive navigation. The public projection resolves it only through the existing safe public Capability projection; hidden/unapproved capability identities are omitted and never enumerable through glossary responses.

## Seed-content acceptance

The supplied package is an editorial draft, not canonical data. Pre-import review must resolve these observed findings:

- package manifest says 84 terms, while structured parsing finds 91 records: 90 non-empty unique slugs plus one blank `Мониторинг` slug;
- nine records use category `infrastructure`, absent from the proposed model; normalize them to `network-infrastructure` after editorial review;
- Guest must remain `safe/non-intrusive, not purely passive`; glossary copy cannot call the current Guest flow a passive scanner;
- ACTIVE, IP/CIDR, raw TCP, DAST/SAST/SCA and other unavailable functions must be described as general/future concepts, not current OUTSCAN V1 capabilities;
- rate-limit wording must not turn raw IP/browser signals into authorization or Guest ownership;
- generic definitions mentioning public IP, ports or deep testing must not imply present V1 target support;
- Potential, Probable and Confirmed copy must match canonical confidence/finding terminology and never convert a match into confirmation.

All seed records require security/content review before `APPROVED`. The accepted initial count is determined by the cleaned registry, not by the archive manifest.

## Search contract

V1 uses bounded deterministic local search over public projection only. Normalization applies Unicode NFKC, trim, whitespace collapse, Russian/English lowercase and `ё`/`е` search equivalence. Validation detects normalization collisions.

Ranking is stable:

1. exact abbreviation;
2. exact Russian/English term;
3. exact alias;
4. name/alias prefix;
5. token match in names/aliases.

V1 has no fuzzy edit-distance or description-body search. Query length and result count are bounded; stable ties use `sortOrder`, Russian term and slug.

## Future public API

No glossary route exists now. The planned contracts are:

```text
GET /v1/public/glossary?q=&category=
GET /v1/public/glossary/:slug
```

The list returns a bounded complete matching set for the V1 registry with `{ data, meta: { schemaVersion: 1, count } }`; no pagination/search service is needed while the validated registry remains within its V1 cap. Unknown query/category/fields fail safely. Detail accepts canonical slug only; unknown, malformed, alias-only and non-public terms return the standard 404 without filesystem lookup.

List DTO contains only slug, display names/abbreviation, category and short definition. Detail may additionally expose explanation, why-it-matters, optional example/note, canonical related public terms/capabilities and review date. Internal review state, aliases used only for search and all scanner/capability operational metadata remain private.

Public caching may use immutable build/application data plus normal CDN response policy. Redis or a database is not added solely for the glossary.

## Future Web UX and SEO

Planned pages:

- `/glossary` — semantic heading, labelled search and keyboard-accessible category filtering;
- `/glossary/[slug]` — plain-language detail, caveats and canonical related links.

Search query may be represented by `/glossary?q=...` for shareable navigation. Canonical public term pages enter sitemap and receive unique Russian metadata. No alias duplicate pages are generated in V1.

Inline help is added only at explicit reviewed product labels where it improves understanding. It uses the same canonical hint projection, is keyboard/touch accessible, closes with Escape, has visible focus and is never hover-only or nested inside another interactive control. Automatic over-linking of every matching word is forbidden.

Public copy follows `CLAIM_INVENTORY.md`, uses calm language and never promises completeness, safety or protection. Decorative shields, hacker imagery and noisy card grids remain prohibited.

## Rollout

1. Correct and review the seed set; record the accepted count and review evidence.
2. Add the dependency-free registry, strict validation, search and public projections.
3. Add API list/detail with safe cache/error behavior.
4. Add index/detail pages, metadata/sitemap and empty/404 states.
5. Add one explicit real integration using an available public label such as DNSSEC, DMARC or TLS; do not invent a CVE surface that does not exist.
6. Pass [Security Glossary testing](SECURITY_GLOSSARY_TESTING.md), browser accessibility/reflow evidence and repository verification before public activation.

Runtime Admin editing, exam/game integration and multilingual editorial workflow remain later work.

The separately planned server-only Security Question Registry may link approved glossary slugs in educational explanations, but never imports scoring/correct-answer data into this public registry. See `SECURITY_CHECKINS.md`.
