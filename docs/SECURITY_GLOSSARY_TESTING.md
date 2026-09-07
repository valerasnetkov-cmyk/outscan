# Security Glossary testing

**Status:** Planned blocking suite for future implementation

**Parent contract:** [Security Glossary](SECURITY_GLOSSARY.md)

## Registry and content

- Reject unknown fields/categories/review states, malformed slugs/dates and empty required copy.
- Reject duplicate slugs/sort order and cross-term alias/abbreviation collisions after canonical search normalization.
- Reject unknown related terms and, in strict mode, unknown Capability Registry slugs.
- Prove related-term cycles are accepted and deterministic.
- Hidden, draft and deprecated records never appear in the active public projection.
- Enforce per-field/list/registry size ceilings and authored-source line limits.
- Editorial lint/review catches absolute-safety claims and current-feature claims that contradict V1 policy.

## Seed acceptance

- Parse the cleaned seed into exact records with no blank slug or unknown category.
- Record and assert the reviewed seed count; do not hard-code the archive's stale `84` claim.
- Confirm all `relatedTerms` resolve and all public capability links survive the fail-closed public Capability projection.
- Regression tests preserve Guest as safe/non-intrusive rather than purely passive and mark unavailable ACTIVE/IP/CIDR/raw-TCP/deep-testing concepts as general/future.
- Potential/Probable/Confirmed, CVE/CVSS/EPSS/KEV, Finding/Occurrence/Coverage and monitoring copy matches canonical project semantics.

## Search

- Exact abbreviation, Russian/English name and alias order above prefix/token matches.
- NFKC, case, surrounding/repeated whitespace and `ё`/`е` equivalence are deterministic.
- Normalized alias collisions fail registry validation instead of making results ambiguous.
- Query and returned result bounds prevent unbounded CPU/memory work.
- Stable ordering does not depend on insertion order or locale of the host process.

## Public API

- List/detail exact schemas and `schemaVersion: 1`; only approved public terms are returned.
- Category/query filtering is bounded and stable; empty search is safe.
- Unknown/malformed/alias-only slug receives standard 404 without path/filesystem behavior or stack/source disclosure.
- Public DTOs contain no review notes/state, hidden aliases, scanner commands, template IDs, engine/image versions, secrets or hidden capability identities.
- Requests cannot create jobs, modify glossary/capability state or influence ScanAuthorization/VerifiedScope.
- Cache headers and fail-closed registry error behavior match public API policy.

## Web, SEO and accessibility

- `/glossary` search/filter URL state, empty results and responsive layout work without client errors.
- Canonical term page renders required copy and validated related links; unknown term uses standard 404.
- Sitemap contains only canonical approved public terms; metadata/canonical URLs are unique and alias duplicates are absent.
- Structured plain text is escaped; markup/control/header/formula-like values cannot execute or corrupt output.
- Search/filter/hint controls have accessible names, semantic state, keyboard/touch operation, visible focus and WCAG 2.2 AA zoom/reflow behavior.
- Inline hint is not hover-only, Escape closes it, focus returns predictably and it is not nested in an interactive control.

## Cross-module negatives

- Changing `publicVisible`, relations or glossary copy cannot publish ProductCapability or alter ScannerCapability, VerifiedScope, ScanAuthorization, Risk or Finding state.
- A public term cannot enumerate a hidden/unapproved capability through `relatedCapabilities`.
- No tenant/customer data enters registry, cache, API response, page metadata or logs.
- No database, Redis, external search, external content fetch, CMS or runtime AI is introduced in V1.

## Release evidence

Before activation run targeted registry/search/API/Web tests, accessibility/browser checks, lint, typecheck, production builds, line-count, link/secret scans and `git diff --check`. PASS applies only to the glossary surface and does not advance Gate B1/B2/C.
