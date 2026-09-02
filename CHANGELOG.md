# CHANGELOG

Все существенные продуктовые, архитектурные, security, data и deployment изменения фиксируются здесь по датам.

Формат ориентирован на живой проект, а не только на релизы. Новые записи добавляются сверху внутри соответствующей даты.

## [Unreleased]

### Pending

- Scaffold monorepo и базовых приложений.
- Реализация guest Quick Scan.
- Authentication, organizations и domain verification.
- Isolated scanner worker и queue.
- Threat Intelligence ingest.
- Workspace и Platform Admin.

## 2026-09-02

### Product

- Зафиксировано название продукта **OUTSCAN** и домен `OUTSCAN.ru`.
- Зафиксировано позиционирование: платформа мониторинга внешних киберрисков.
- Зафиксирован слоган: **«Внешние риски под контролем.»**
- Продукт разделен на три слоя: Public Guest Scan, Customer Workspace, Platform Admin.
- Guest Scan доступен без регистрации и без подтверждения владения доменом.
- В guest result показываются базовые публичные параметры и агрегированное количество дополнительных потенциальных рисков.
- Детали потенциальных рисков, CVE, поддомены, endpoints и evidence скрыты до подтверждения владения.
- Полноценный OUTSCAN Security Score доступен только после verified baseline scan.

### Guest scan

- Разрешены DNS, RDAP, TLS/certificate, HTTP security headers, email security, ASN/BGP/RPKI, CDN/WAF, technology fingerprint и агрегированные Certificate Transparency данные.
- Добавлены обязательные V1 public/network параметры: registrar, domain dates, ASN, network provider, BGP prefix, RPKI, IPv6, HTTP/2-3, MTA-STS, TLS-RPT, HSTS status/preload.
- Зафиксировано хранение истории изменений IP, ASN, NS, MX, CA, CDN, TLS, DMARC, RPKI и других posture-параметров.
- Запрещены anonymous port scanning, Naabu, deep Katana, active Nuclei, ZAP, fuzzing, brute force, exploitation и authenticated scanning.

### Scanning architecture

- Nuclei выбран основным vulnerability detection engine V1.
- Зафиксирован pipeline: Discovery -> HTTP/TLS -> Network/Web -> Nuclei -> Findings Normalizer -> Threat Intelligence -> Risk Engine.
- Зафиксированы Subfinder, DNS/dnsx, httpx, Naabu, Katana и Nuclei как базовые engines.
- OWASP ZAP, OSV и MobSF перенесены на последующие этапы.
- Scanner workers определены как отдельная security boundary без прямого доступа к production DB/internal network/cloud metadata.
- Зафиксирована политика scanner/template updates: staging -> integration tests -> canary -> approve -> production.

### Threat Intelligence

- Зафиксированы NVD, CISA KEV и FIRST EPSS как источники V1.
- Зафиксирован отдельный Threat Intelligence pipeline и targeted re-evaluation существующих assets при появлении новых CVE.
- Утверждено различие `Potential`, `Probable`, `Confirmed`.

### Risk Engine

- OUTSCAN Risk отделен от severity конкретного scanner.
- В Risk Engine заложены CVSS/severity, EPSS, KEV, confidence, internet exposure и asset criticality.
- Зафиксировано требование объяснять пользователю приоритет, а не просто выводить scanner alerts.

### Architecture

- Базовой сущностью проекта принят `Asset`, а не `Website`.
- Все scanner adapters должны возвращать единый `Finding`.
- В модель заложен `AssetRelation` для будущего Asset Graph и Attack Paths.
- Принят подход modular-monolith-first с отдельно изолируемыми scanner workers.
- Platform Admin должен быть логически и архитектурно отделен от customer workspace.
- Для administrative support access предусмотрен будущий audited break-glass flow.

### Scale strategy

- Зафиксирован долгосрочный вектор: External Monitoring -> EASM -> Agency/MSP -> AppSec/API -> Supply Chain -> Cloud/Internal Exposure -> Asset Graph -> Attack Paths -> Exposure Management/CTEM.
- Agency/MSP/White Label и API поставлены раньше Mobile Security как более ранний коммерческий канал масштабирования.
- Зафиксирована API-first готовность доменной модели без преждевременного превращения проекта в набор микросервисов.

### Competitive analysis / product strategy

- Проведен анализ SMB website scanners, vulnerability platforms, EASM и public posture tools.
- Зафиксировано, что DNS/TLS/headers проверки сами по себе являются commodity и не должны считаться основным конкурентным преимуществом.
- Guest Scan закреплен как полезный Network & Domain Posture, а не пустой teaser.
- Отказались от A-F grade как центральной модели: Guest использует Baseline posture, verified workspace - OUTSCAN Security Score.
- Change Intelligence повышен до first-class capability и поставлен раньше широкого AppSec expansion.
- Asset Graph basics/attribution/provenance перенесены на ранний EASM-этап.
- Agency/MSP подтвержден как ранний revenue channel. Клиентские данные остаются в отдельных Organization tenants, партнер получает delegated access.
- Подтверждена monetization-модель monitored assets без credits за обычные scans.
- Зафиксирован двухслойный UX: business summary + technical drill-down.

### Architecture additions

- Добавлен `AssetPostureSnapshot` concept для versioned Change Intelligence.
- `AssetRelation` расширен attribution reason/provenance requirements.
- Добавлен будущий `PartnerDelegation` для безопасной Agency/MSP модели.
- В API добавлены posture/changes и graph-ready relation boundaries.
- Добавлены ADR 0007 Change Intelligence и ADR 0008 Agency delegated tenancy.

### Documentation

- Создан базовый комплект living documentation для Codex.
- Добавлены `README.md`, `AGENTS.md`, `agent.md`, `plan.md` и этот `CHANGELOG.md`.
- Добавлены архитектурные, security, scanning, data, API, Risk Engine, Threat Intelligence, UI, operations, testing, roadmap, monetization и legal документы.
- Добавлен `docs/COMPETITIVE_ANALYSIS.md` с рыночными выводами и продуктовой стратегией.
- Введен ежедневный audit-файл `docs/audit-YYYY-MM-DD.md` и шаблон аудита.
- Graphify запланирован после первого содержательного source scaffold; документационный scaffold намеренно не графируется.
