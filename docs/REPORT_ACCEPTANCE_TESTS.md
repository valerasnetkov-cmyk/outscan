# Report Engine Acceptance and Security Tests

## 1. Назначение

Этот документ задает минимальный release gate для Reporting V1.

Нельзя считать функцию готовой только потому, что PDF визуально открывается.

Нужно доказать:

- корректность snapshot;
- неизменяемость historical report;
- parity renderer-ов;
- tenant isolation;
- безопасность AI export;
- безопасность artifact storage/download;
- idempotency;
- graceful failure.

## 2. Test fixtures

Подготовить минимальный fixture набор.

### Fixture A - normal report

- один primary domain;
- несколько assets;
- score current + previous;
- Critical/High/Medium/Low findings;
- Potential/Probable/Confirmed;
- changes;
- resolved finding;
- accepted risk;
- coverage;
- limitation.

### Fixture B - first report

- previous score отсутствует;
- changes relative to previous отсутствуют.

### Fixture C - partial/limited coverage

- одна capability failed/skipped;
- один asset unreachable;
- limitation явно присутствует.

### Fixture D - hostile evidence

- prompt injection strings;
- Markdown fence breaking;
- HTML comments;
- command-like text;
- secret-like patterns;
- oversized content;
- unsafe links.

### Fixture E - multi-tenant

- Organization A;
- Organization B;
- одинаковые display target names допустимы;
- разные report IDs/artifacts.

## 3. Snapshot creation tests

### RPT-SNP-001

Given completed authorized scan
When report snapshot is built
Then snapshot validates against `outscan.report.v1`.

### RPT-SNP-002

Given incomplete required normalization
When snapshot build starts
Then build fails closed and no READY report is exposed.

### RPT-SNP-003

Given snapshot is finalized
When underlying Finding record later changes
Then historical snapshot content does not change.

### RPT-SNP-004

Given Threat Intelligence values later update
When old report is reopened
Then old EPSS/KEV/CVSS projection remains as recorded.

### RPT-SNP-005

Given optional enrichment is unknown
Then snapshot stores explicit unknown/null according to schema and renderer does not invent value.

## 4. Stable Finding ID tests

### RPT-ID-001

Same logical finding across consecutive scans retains same canonical Finding ID.

### RPT-ID-002

Severity changes HIGH -> MEDIUM without identity change; Finding ID remains stable.

### RPT-ID-003

Changing RU/EN translation does not change Finding ID.

### RPT-ID-004

Sorting findings differently does not change Finding ID.

### RPT-ID-005

Distinct findings on same asset do not collide.

### RPT-ID-006

Fingerprint algorithm version is explicit and regression fixture prevents silent identity drift.

## 5. Renderer parity

For one snapshot compare all V1 formats.

Must match:

- report ID;
- scan ID;
- primary target/scope;
- score;
- severity counts;
- stable Finding IDs;
- confidence;
- lifecycle status;
- CVE identifiers;
- coverage;
- limitations.

### RPT-PAR-001

JSON -> expected canonical values.

### RPT-PAR-002

MD RU contains same Finding IDs and factual fields.

### RPT-PAR-003

MD EN contains same Finding IDs and factual fields.

### RPT-PAR-004

AI MD includes only allowed subset but never contradicts canonical values.

### RPT-PAR-005

PDF extraction/structured test confirms report ID, score and Finding IDs represented correctly.

Не требовать byte equality PDF.

## 6. Localization tests

### RPT-L10N-001

RU and EN counts/statuses/IDs identical.

### RPT-L10N-002

JSON enums remain canonical English/system enums regardless of UI locale.

### RPT-L10N-003

Missing translation uses controlled fallback and is observable/tested.

### RPT-L10N-004

Vendor/product names and CVE are not translated or altered.

## 7. PDF tests

### RPT-PDF-001

PDF opens with valid MIME/content signature.

### RPT-PDF-002

Executive Summary appears before technical appendix.

### RPT-PDF-003

Coverage and limitations are present.

### RPT-PDF-004

Long finding titles/URLs do not break page layout catastrophically.

### RPT-PDF-005

Large report generation respects timeout/resource limits.

### RPT-PDF-006

Renderer failure marks only artifact FAILED and preserves snapshot/other artifacts.

### RPT-PDF-007

Severity remains understandable without color.

## 8. Markdown tests

### RPT-MD-001

UTF-8 valid output.

### RPT-MD-002

Stable heading structure.

### RPT-MD-003

Untrusted content cannot close a fenced block and create trusted section semantics in AI report.

### RPT-MD-004

Unsupported/unsafe URL schemes are not rendered as active links.

### RPT-MD-005

Control characters do not corrupt document structure.

## 9. JSON tests

### RPT-JSON-001

Schema validation passes.

### RPT-JSON-002

No NaN/Infinity.

### RPT-JSON-003

Timestamps are ISO 8601 with timezone.

### RPT-JSON-004

Unknown optional values represented consistently.

### RPT-JSON-005

No presentation-only HTML/layout fields required for consumers.

### RPT-JSON-006

Historical V1 fixture continues to parse after renderer updates.

## 10. Security test suite

Security-sensitive tests are defined in `REPORT_SECURITY_TESTS.md`. They are mandatory for the Reporting V1 release gate.

## 19. Build verification

Before release run actual project commands for:

- formatter/linter;
- typecheck;
- unit tests;
- integration tests;
- security negative tests;
- production build;
- authored-file line count.

Если команда отсутствует, зафиксировать это как unverified, а не считать PASS.

## 20. Release gate

### FAIL

Если остается хотя бы одно:

- cross-tenant report/artifact access;
- public artifact exposure;
- raw secrets in AI export;
- prompt injection breaks trusted AI structure/authority boundary;
- snapshot silently mutable;
- renderer factual divergence;
- report action expands scanner authorization;
- failing required security tests/build.

### PASS WITH ACCEPTED RISK

Только для явно документированных не-blocking ограничений без Critical/High security impact.

### PASS

Только для проверенного scope Reporting V1, а не как заявление о полной безопасности OUTSCAN.