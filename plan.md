# OUTSCAN - plan

Этот файл является рабочим планом разработки. Выполненные пункты не удалять: отмечать `[x]`. Новые риски и задачи добавлять по мере обнаружения.

## Phase 0 - Foundation

- [x] Зафиксировать продуктовую концепцию OUTSCAN.
- [x] Зафиксировать три слоя: Public / Workspace / Platform Admin.
- [x] Зафиксировать guest scanning boundary.
- [x] Зафиксировать V1 scanner stack.
- [x] Зафиксировать Threat Intelligence и Risk Engine принципы.
- [x] Зафиксировать стратегию масштабирования.
- [x] Провести конкурентный анализ и зафиксировать product differentiation.
- [x] Зафиксировать Change Intelligence как first-class capability.
- [x] Зафиксировать Agency/MSP delegated-tenancy model.
- [x] Создать living documentation для Codex.
- [ ] Создать source scaffold.
- [ ] Выбрать и зафиксировать ADR для ORM/data-access слоя.
- [ ] Подключить Graphify после появления содержательной source-структуры.
- [ ] Добавить CI с lint, typecheck, tests, build, secret scan и dependency review.

## Phase 1 - Public Guest Scan

### Public UI

- [ ] Landing/hero с domain input.
- [ ] Scan progress state.
- [ ] Guest result page.
- [ ] Блок базовых Network & Domain Posture параметров.
- [ ] Блок `N потенциальных рисков` без раскрытия чувствительных деталей.
- [ ] CTA регистрации/подтверждения домена.
- [ ] Не использовать A-F grade как основной signal.
- [ ] UX performance budget и измерение scan duration; не обещать фиксированное время без production metrics.

### Guest scan API

- [ ] Нормализация domain input.
- [ ] IDN/punycode handling.
- [ ] Public DNS resolve.
- [ ] SSRF destination validation IPv4/IPv6.
- [ ] Redirect revalidation.
- [ ] Rate limiting по IP и domain.
- [ ] Request/response size/time budgets.
- [ ] Abuse/CAPTCHA hook.

### Guest posture checks

- [ ] A / AAAA / NS / SOA / TTL / CNAME / PTR.
- [ ] MX / SPF / DMARC.
- [ ] CAA / DNSSEC.
- [ ] MTA-STS / TLS-RPT.
- [ ] RDAP registrar / creation / expiry / status.
- [ ] HTTPS redirect.
- [ ] TLS version / certificate issuer / validity / SAN summary.
- [ ] HSTS / CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy / Permissions-Policy.
- [ ] Cookie flags для доступного public response.
- [ ] HTTP protocol / ALPN / HTTP2 / HTTP3 indicators.
- [ ] CDN/WAF / server / technology fingerprint без раскрытия опасных деталей.
- [ ] IPv4 / IPv6 / ASN / provider / BGP prefix / RPKI.
- [ ] Connection timings.
- [ ] Certificate Transparency aggregate count; не раскрывать discovered subdomains гостю.
- [ ] `security.txt` presence.
- [ ] Baseline posture evaluator, отдельный от Security Score.

### Acceptance gate Phase 1

- [ ] Guest scan не способен обратиться к private/link-local/metadata address даже через redirect/DNS rebind path.
- [ ] Guest scan не запускает active vulnerability/network scan.
- [ ] Public result не раскрывает CVE/evidence/subdomain list/endpoints.
- [ ] Abuse limits покрыты integration tests.
- [ ] Guest result дает самостоятельную полезность, а не пустой teaser.

## Phase 2 - Identity, Organizations, Verification

- [ ] Registration/login/logout/recovery.
- [ ] Secure httpOnly session cookies.
- [ ] CSRF/session hardening для выбранной auth architecture.
- [ ] Organization creation.
- [ ] Roles: Owner/Admin/Analyst/Viewer.
- [ ] Central server-side authorization helpers.
- [ ] Cross-tenant negative test matrix.
- [ ] Domain add flow.
- [ ] DNS TXT verification.
- [ ] Verification expiry/recheck policy.
- [ ] Audit events для privileged actions.

## Phase 3 - Assets and Verified Baseline

- [ ] `Asset` + `AssetRelation` model.
- [ ] Relation provenance/confidence/attribution reason.
- [ ] Domain/subdomain/IP/web-app/service types V1.
- [ ] Subfinder discovery.
- [ ] httpx enrichment.
- [ ] Safe Naabu profile только для verified domain scope.
- [ ] Katana controlled crawl.
- [ ] Technology observations with provenance/confidence.
- [ ] First/last seen history.
- [ ] Newly discovered asset event.
- [ ] Пользователь сам включает discovered asset в billable monitoring.
- [ ] API способен объяснить, почему discovered asset связан с организацией.

## Phase 4 - Vulnerability Detection

- [ ] Isolated scanner worker contract.
- [ ] Queue/job leases, timeout, retry, idempotency.
- [ ] Nuclei SAFE template profile.
- [ ] CONTROLLED/ACTIVE/DISABLED policy enforcement.
- [ ] Finding normalization.
- [ ] Finding evidence minimization/redaction.
- [ ] Status lifecycle NEW/ACTIVE/ACKNOWLEDGED/FIXED/ACCEPTED_RISK/FALSE_POSITIVE/REOPENED.
- [ ] Recheck flow.

## Phase 5 - Threat Intelligence and Risk Engine

- [ ] NVD incremental ingest.
- [ ] CISA KEV ingest.
- [ ] EPSS daily ingest.
- [ ] Provenance, timestamps, schema validation.
- [ ] Technology/CPE/CVE matching strategy.
- [ ] Targeted CVE scan job.
- [ ] Risk Engine V1.
- [ ] `Potential / Probable / Confirmed` confidence model.
- [ ] Security Score V1 for verified workspace.
- [ ] Calibration dataset and false-positive review.
- [ ] Business-summary explanation of each High/Critical priority.

## Phase 6 - Change Intelligence + Workspace Core

- [ ] Versioned/snapshotted posture storage.
- [ ] Diff engine for IP/ASN/NS/MX/CA/CDN/TLS/DMARC/RPKI.
- [ ] New/disappeared asset events.
- [ ] Technology change events.
- [ ] Finding fixed/reopened events.
- [ ] Change significance model/version.
- [ ] Monitoring timeline `before -> after -> when -> why it matters`.
- [ ] Dashboard.
- [ ] Assets list/detail.
- [ ] Findings list/detail.
- [ ] Vulnerabilities view.
- [ ] Infrastructure/domain/mail/certificate posture.
- [ ] Business summary + technical drill-down.
- [ ] Recheck action.
- [ ] Report generation.
- [ ] Email notifications.

## Phase 7 - Attack Surface / EASM + Asset Graph Basics

- [ ] Expanded passive discovery.
- [ ] Unknown/shadow asset workflow.
- [ ] Richer relation types.
- [ ] Relation attribution/provenance UX/API.
- [ ] Attack surface summary/trends.
- [ ] Graph-ready endpoints/data model.
- [ ] Do not require full visual graph before relationship data is useful.

## Phase 8 - Platform Admin + Commercial MVP

### Platform Admin

- [ ] Separate admin authentication/policy boundary.
- [ ] Overview metrics.
- [ ] Organizations/users/assets statistics.
- [ ] Scan jobs / queues / workers.
- [ ] Threat Intelligence freshness.
- [ ] Scanner/template versions.
- [ ] Abuse / blocklist.
- [ ] Audit log.
- [ ] Support access grants / break-glass design.
- [ ] Admin negative authorization tests.

### Commercial

- [ ] Subscription/entitlements model.
- [ ] Free / Starter / Business / Agency plan definitions.
- [ ] Asset limits.
- [ ] Billing provider ADR before implementation.
- [ ] Usage metering without scan-credit model.
- [ ] Annual plan policy.
- [ ] Price validation against current SMB/scanner/agency competitors before launch.
- [ ] Security badge language review.
- [ ] Legal review of SaaS positioning in РФ before commercial launch.

## Phase 9 - Agency / MSP + API

- [ ] Partner/delegation data model.
- [ ] Each client remains isolated Organization tenant.
- [ ] Delegated access authorization matrix.
- [ ] Multi-client partner workspace.
- [ ] Bulk actions authorize every client organization.
- [ ] White Label reports.
- [ ] Partner billing.
- [ ] Platform API.
- [ ] Webhooks.

## Later

- [ ] AppSec / authenticated DAST / ZAP.
- [ ] API Security / OpenAPI / GraphQL.
- [ ] GitHub/GitLab / OSV / SBOM / secrets / SCA.
- [ ] Cloud connectors.
- [ ] Private scanner.
- [ ] Full Asset Graph UI.
- [ ] Attack Paths.
- [ ] Mobile APK/IPA / MobSF.
- [ ] Exposure Management / CTEM workflows.
- [ ] Managed Security service.

## Known risks / open decisions

- [ ] Юридически проверить границу SaaS и лицензируемых услуг по контролю защищенности/мониторингу ИБ в РФ.
- [ ] Зафиксировать exact authentication implementation после threat model review.
- [ ] Зафиксировать data retention policy для scan evidence и posture snapshots.
- [ ] Зафиксировать data residency/hosting strategy.
- [ ] Определить billing provider только после требований по юрлицу и рынку.
- [ ] Определить production container/orchestrator после load model.
- [ ] Определить storage/query strategy для Change Intelligence после первых load estimates.
- [ ] Не допустить размывания differentiation: DNS/TLS/headers сами по себе не являются продуктовым moat.
- [ ] Graphify не установлен на стадии docs-only; установить сразу после source scaffold.
