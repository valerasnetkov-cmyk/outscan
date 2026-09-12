# OUTSCAN Trust & Evidence — Security and Acceptance Testing

Status: proposed documentation only; no runtime, publication or gate evidence. [Proposed ADR 0019](adr/0019-trust-methodology-evidence.md), accepted ADRs and [integration decisions](TRUST_PACKAGE_INTEGRATION.md) govern this specification.

## 1. Scope

Проверки относятся к:

- Finding provenance;
- public Trust projection;
- source freshness semantics;
- Risk explainability;
- Proof Scan grant/authorization;
- Demo Report;
- future Validation Lab publication gate.

Документ не заменяет `docs/TESTING.md` и существующие report/scanner security tests.

## 2. Security objectives

Система должна доказать, что прозрачность результата:

- не раскрывает secrets/internal execution controls;
- не ломает tenant isolation;
- не расширяет scan scope/profile;
- не превращает unknown/stale intelligence в ложное `safe/no`;
- не позволяет получить второй бесплатный verified scan через race/replay;
- не создает public customer data leak;
- не создает ложные accuracy/assurance claims.

## 3. Provenance contract tests

### P-01 Stable identity

При изменении severity/confidence/risk priority existing Finding ID не меняется только из-за этих изменений.

### P-02 Observation timestamp

Finding provenance содержит валидный `observed_at`, связанный с фактическим occurrence/scan.

### P-03 Coverage linkage

Finding provenance ссылается на фактический detector/coverage state соответствующего scan.

### P-04 No invented evidence

Если safe evidence summary невозможно сформировать из validated data, projection показывает `unknown/unavailable`, а не генерирует догадку.

### P-05 Raw scanner output isolation

Public/user-safe provenance не содержит raw stdout/stderr/body вне специально разрешенной sanitized projection.

### P-06 Secret redaction

Fixtures с `Authorization`, cookies, bearer-like tokens, API keys и secret-like strings не попадают в user-safe export.

### P-07 Hostile markup

Evidence с HTML/JS/template-like content отображается как data/text и не исполняется.

### P-08 Oversized evidence

Oversized evidence отвергается или bounded/redacted согласно policy; renderer не зависает и не принимает unbounded content.

### P-09 Internal identifiers

Public projection не содержит:

- job/attempt/fence/lease;
- worker image;
- template digest;
- scanner command;
- signing key/version;
- queue/storage internals.

### P-10 Cross-tenant denial

User A не может получить provenance/private evidence finding организации B по guessed IDs, report IDs или artifact references.

## 4. Threat Intelligence freshness tests

### TI-01 Missing EPSS

Отсутствующий EPSS отображается как unknown/unavailable, не `0`.

### TI-02 Stale EPSS

Устаревшая score date отображается как stale и не маскируется под current.

### TI-03 Unknown KEV

Неуспешная/устаревшая KEV sync не отображается как `KEV: No`.

### TI-04 Current KEV no

`No` допустим только когда текущий нормализованный dataset действительно подтверждает отсутствие записи по принятой semantics.

### TI-05 Source outage

Source outage не повреждает accepted scan result, если enrichment optional; state сохраняется как unavailable и retry выполняется отдельно.

### TI-06 Parser provenance

Normalized record сохраняет parser/schema version и timestamps, требуемые current TI contract.

### TI-07 Upstream hostile input

Malformed/oversized external feed record fail-closed на parser boundary и не интерполируется в shell/query/template execution.

## 5. Risk explainability tests

### R-01 CVSS is not risk

Высокий CVSS без остальных факторов не обязан автоматически давать Critical.

### R-02 Confirmed + KEV + exposed guardrail

Если текущий Risk Engine guardrail требует повышенный priority, explainability projection показывает соответствующие major factors.

### R-03 Model version

Каждое snapshot risk decision содержит model version.

### R-04 Internal formula privacy

User-safe explainability не раскрывает закрытые thresholds/weights, если они не предназначены для публичной документации.

### R-05 Missing coverage

Недостаточное coverage явно ограничивает интерпретацию и не выглядит как `problem not found`.

## 6. Report snapshot tests

### RS-01 Freeze intelligence

После обновления live EPSS/KEV/NVD historical Report Snapshot сохраняет исходные frozen values.

### RS-02 Freeze confidence/risk

Historical report сохраняет confidence, priority и model version момента snapshot.

### RS-03 Renderer parity

JSON/MD/PDF одного report ID используют одну snapshot provenance semantics.

### RS-04 No live bypass

Renderer не читает live TI/Finding state для silently replacing frozen values.

### RS-05 Public demo isolation

Demo report строится только из demo/lab scope и не содержит tenant/customer identifiers.

## 7. Public Trust endpoint tests

Если реализован `GET /v1/public/trust/status` или эквивалент:

### T-01 Closed schema

Unknown/internal fields не проходят public serializer.

### T-02 No tenant data

Ответ не содержит organization/asset/finding/report identifiers.

### T-03 No operational secrets

Нет private URLs, credentials, tokens, internal hostnames, queue depth, secret versions.

### T-04 Honest health

Internal source error отображается safe state `UNAVAILABLE/UNKNOWN`, а не fake `CURRENT`.

### T-05 Bounded response

Количество sources/fields строго ограничено; endpoint не превращается в arbitrary diagnostics API.

### T-06 Safe caching

Cache headers соответствуют public status policy и не кэшируют случайные private diagnostic details.

### T-07 Error projection

Internal exceptions не выводятся клиенту со stack trace/upstream payload.

## 8. Claim tests

### C-01 No blocked accuracy claims

До Validation Lab public UI/docs не содержат detection rate/false-positive rate/complete coverage claims.

### C-02 Source state gating

PLANNED source не показывается как ACTIVE/current.

### C-03 Capability evidence gating

Trust page не заявляет capability как выполняемую без production evidence/Claim Inventory condition.

### C-04 No absolute safety claim

Нет `100% safe`, `no vulnerabilities`, `full pentest` и эквивалентов.

### C-05 Demo honesty

Static mockup не маркируется как real scan/report.

## 9. Proof Scan authorization matrix

Минимальные actors:

- anonymous;
- authenticated user without organization;
- member A of organization A;
- member B of organization B;
- privileged organization role if required;
- Platform operator, только если текущая модель реально участвует в flow.

### PS-01 Anonymous denied

Anonymous не может создать/использовать Proof Scan grant.

### PS-02 Wrong organization denied

User A не может применить grant к asset организации B.

### PS-03 Unverified denied

Asset без текущего successful EXACT_HOST verification не запускает Proof Scan.

### PS-04 Stale verification denied

STALE/expired verification блокирует execution до revalidation.

### PS-05 Target substitution denied

После grant activation нельзя заменить target/asset/host через API manipulation.

### PS-06 Profile escalation denied

Client-supplied `CONTROLLED_DEEP`, `ACTIVE` или неизвестный profile отвергается.

### PS-07 Capability escalation denied

Client не может добавить raw TCP/port enumeration/headless/arbitrary templates или иные denied capabilities.

### PS-08 One grant, one accepted result

После accepted verified-baseline result grant атомарно становится consumed.

### PS-09 Replay denied

Consumed grant не создает новый ScanRequest.

### PS-10 Concurrent duplicate

Два одновременных запуска не создают два logical Proof Scan execution.

### PS-11 Platform failure semantics

Failure до accepted result следует детерминированной retry/recovery policy и не выдает новый независимый grant.

### PS-12 No monitoring side effect

Proof Scan не создает `MonitoringEnrollment`.

### PS-13 No verification side effect

Proof grant не создает/продлевает `VerifiedScope`.

### PS-14 Fresh ScanAuthorization

Execution использует current server-side authorization, а не старый eligibility snapshot.

### PS-15 Idempotency/abuse identity

IP/NAT/browser fingerprint не используется как ownership identity.

## 10. Demo Lab tests

### D-01 Owned target only

Demo scan target присутствует в approved lab inventory.

### D-02 No production customer dependency

Demo generation не требует customer DB rows/credentials.

### D-03 Reproducible configuration

Lab configuration/version фиксируются.

### D-04 Safe evidence

Demo export не содержит reusable credentials/exploit payloads/internal scanner secrets.

### D-05 Snapshot integrity

Published demo report имеет immutable snapshot identity/version.

## 11. Validation Lab tests, future

Перед публикацией accuracy metrics обязательно проверить:

- versioned corpus;
- known truth labels;
- deterministic counting rules;
- scanner/profile/version capture;
- repeatability;
- exclusions documented;
- methodology version;
- review/approval;
- no cherry-picked subset presented as global accuracy.

## 12. Required verification after implementation

Запускать существующие repository checks, минимум применимые:

- targeted unit/integration tests;
- security negative tests;
- typecheck;
- lint/format;
- build;
- database tests/migrations when schema changes;
- `git diff --check`;
- authored file line-count gate;
- public browser/accessibility checks for `/trust` when route exists.

Не заявлять выполнение команды, если она не была реально запущена.

## 13. Release blockers

Для соответствующего scope release блокируют:

- cross-tenant provenance leak;
- Proof Scan scope/profile escalation;
- repeatable free grant abuse due authorization/idempotency flaw;
- secret/raw evidence exposure;
- public customer data in demo;
- stale intelligence rendered as definitive negative;
- public accuracy claim without validation evidence;
- Trust endpoint exposing internal scanner control data;
- failing relevant security tests.

## 14. Acceptance summary

Trust functionality проходит gate только для фактически проверенного scope. Зеленый результат этих тестов не является утверждением, что OUTSCAN обнаруживает все существующие уязвимости.

## 15. Repository suite mapping and reconciliation cases

This is a planned automation matrix, not an executed/manual-only release checklist.
P-* map to future normalizer/provenance and tenant API/DB suites; TI-* and R-* to
canonical TI/Risk tests; RS-* and D-* to [report security](REPORT_SECURITY_TESTS.md);
T-* and C-* to future public serializer/content/browser suites; PS-* to entitlement,
ADR-0011 job/transaction and tenant authorization integration suites. Runtime slices
must add automated tests in the existing workspace harness before activation.

- Confidence: integer 0–100 input is not automatically CONFIRMED; proposed labels
  cannot silently change persisted/API/report confidence or Guest disclosure.
- Coverage: preserve separate ADR-0013 execution/completeness axes; no automatic
  RESOLVED and no score without SufficientBaselineV1.
- Freshness: cached CURRENT ages to stale under canonical policy; stale positive
  KEV retains historical date/value and cannot turn into a negative assertion.
- Proof: crash between result persistence and consumption cannot permit a second
  accepted result; stale fence/expired lease/deadline cannot commit or consume.
  Terminal same-digest replay acknowledges without writes; differing digest conflicts.
- Guest cannot obtain Workspace provenance through guessed IDs or disclosure controls.
