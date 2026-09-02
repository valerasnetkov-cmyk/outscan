# OUTSCAN

**OUTSCAN** - SaaS-платформа мониторинга внешних киберрисков и цифрового периметра организации.

Домен продукта: `outscan.ru`  
Репозиторий: `https://github.com/valerasnetkov-cmyk/outscan.git`  
Слоган: **Внешние риски под контролем.**

## 1. Цель продукта

OUTSCAN должен отвечать пользователю на четыре вопроса:

1. Какие цифровые активы организации доступны извне?
2. Какие риски и небезопасные конфигурации обнаружены?
3. Что действительно важно исправить в первую очередь?
4. Что изменилось после предыдущей проверки?

OUTSCAN не обещает абсолютную безопасность и не называет ресурс безопасным только потому, что автоматическая проверка не нашла проблем.

## 2. Три уровня продукта

### Public / Guest Scan

Без регистрации и без подтверждения владения доменом.

Разрешены только пассивные и безопасные проверки общедоступных параметров: DNS, RDAP, TLS, сертификаты, HTTP security headers, почтовые политики, ASN/BGP/RPKI, CDN/WAF, базовый technology fingerprint и агрегированные CT-данные.

Гостю показываются базовые результаты и количество дополнительных **потенциальных рисков**. Детальные findings, CVE, поддомены, endpoints, версии потенциально уязвимых компонентов и доказательства не раскрываются.

### Customer Workspace

После регистрации и подтверждения владения активом доступны расширенные проверки, полноценный Security Score, Attack Surface, Findings, Vulnerabilities, Monitoring и Reports.

### Platform Admin

Отдельный административный контур владельца OUTSCAN: организации, пользователи, scan jobs, workers, очереди, Threat Intelligence, подписки, abuse, audit logs и состояние платформы.

## 3. Базовый технический стек

Точный набор версий определяется при scaffold и фиксируется lock-файлами. Не использовать плавающие версии в production.

- TypeScript.
- `pnpm` workspaces.
- Next.js для `apps/web` и `apps/admin`.
- Fastify для `apps/api`.
- PostgreSQL как основная БД.
- Drizzle ORM или другой SQL-first слой только после фиксации ADR; предпочтение SQL-прозрачному подходу.
- Redis + BullMQ для очередей scan jobs.
- Docker/OCI containers для изолированных scanner workers.
- Zod или эквивалент для runtime validation на trust boundaries.
- Собственный UI без зависимости от шаблонного SaaS-kit; CSS должен оставаться модульным и контролируемым.

Security engines V1:

- Subfinder - discovery.
- DNS/dnsx - DNS-проверки.
- httpx - HTTP/TLS probing и technology fingerprint.
- Naabu - network discovery только для подтвержденных активов.
- Katana - crawling только в разрешенном режиме.
- Nuclei - основной vulnerability detection engine.

Threat Intelligence V1:

- NVD.
- CISA KEV.
- FIRST EPSS.
- Nuclei Templates.

Позже: OSV, OWASP ZAP, MobSF, GitHub/GitLab, cloud connectors и private scanner.

## 4. Архитектурный принцип

MVP строится как **модульная система с небольшим числом deployable-компонентов**, а не как набор преждевременных микросервисов.

```text
Internet
   |
   v
apps/web --------> apps/api --------> PostgreSQL
                       |
                       +-----------> Redis / Queue
                                       |
                                       v
                               isolated scanner worker
                                       |
                                       v
                                 External Internet

apps/admin -------> apps/api (separate admin authz boundary)
```

Основные доменные модули:

- Identity / Auth.
- Organizations / Membership.
- Assets / Asset Relations.
- Verification.
- Scans / Scan Jobs.
- Findings / Evidence.
- Vulnerabilities / Threat Intelligence.
- Risk Engine.
- Monitoring / Events.
- Notifications.
- Reports.
- Billing / Entitlements.
- Platform Admin / Audit.

## 5. Ключевые сущности

Базовая сущность - `Asset`, а не `Website`.

Планируемые типы:

- DOMAIN
- SUBDOMAIN
- IP
- WEB_APP
- API
- SERVICE
- REPOSITORY
- MOBILE_APP
- CLOUD_RESOURCE

Все scanner adapters возвращают единый нормализованный `Finding`.

Это обязательное условие будущего Asset Graph, Attack Paths и Exposure Management.

## 6. Продуктовая дифференциация

После анализа прямых website-scanner, vulnerability-scanner и EASM конкурентов зафиксированы обязательные отличия OUTSCAN:

- Guest Scan должен давать полезный Network & Domain Posture, а не пустой teaser.
- Базовые DNS/TLS/headers проверки не считаются самостоятельным moat.
- `Change Intelligence` является first-class capability: важно не только текущее состояние, но и security-relevant diff во времени.
- Asset Relations и provenance собираются рано, чтобы постепенно строить Asset Graph.
- Risk Engine объясняет приоритет, а не копирует scanner severity.
- UI имеет business summary и technical drill-down.
- Agency/MSP проектируется как delegated access между отдельными tenant Organizations.
- Billing строится вокруг monitored assets, а не scan credits.

Подробности: [docs/COMPETITIVE_ANALYSIS.md](docs/COMPETITIVE_ANALYSIS.md).

## 7. Security invariants

Нельзя нарушать ни при каких feature-изменениях:

1. Anonymous scan не выполняет активное vulnerability scanning.
2. Активные расширенные проверки требуют подтвержденного владения и соответствующего режима сканирования.
3. Пользователь одной организации не может читать, изменять, удалять или перечислять данные другой организации.
4. Authorization проверяется server-side на каждом защищенном действии.
5. Scanner worker не имеет прямого доступа к production DB, внутренней сети, cloud metadata и master secrets.
6. User-controlled target не может использовать OUTSCAN как SSRF-proxy к localhost, private/link-local сетям или metadata endpoints.
7. Каждый redirect и повторный DNS resolve проходят повторную проверку destination IP.
8. Platform Admin физически и логически отделен от клиентского workspace; скрытая кнопка не является защитой.
9. Привилегированные действия журналируются.
10. Секреты не попадают в repository, client bundle, scan evidence, changelog и audit notes.
11. Nuclei templates и scanner binaries обновляются только через контролируемый release pipeline.
12. Наличие зеленого scanner result не является доказательством отсутствия уязвимостей.

Подробности: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).

## 8. Документация как часть Definition of Done

Каждое существенное изменение должно обновлять:

- `README.md`, если изменились setup, архитектура или продуктовые правила;
- `CHANGELOG.md`, если завершен значимый этап;
- `plan.md`, если изменились выполненные или будущие задачи;
- соответствующий файл в `/docs`;
- `docs/audit-YYYY-MM-DD.md` в каждый активный день разработки, когда были существенные изменения, аудит, миграция или security review.

Feature считается незавершенной, если документация противоречит коду.

## 9. Codex

Перед любой работой Codex обязан прочитать:

1. `AGENTS.md`.
2. `README.md`.
3. `plan.md`.
4. `CHANGELOG.md`.
5. Документы из `/docs`, относящиеся к задаче.

Полный workflow: [docs/CODEX_WORKFLOW.md](docs/CODEX_WORKFLOW.md).

## 10. Graphify

Graphify должен быть подключен после появления первого содержательного source scaffold.

Рекомендуемый порядок:

```bash
uv tool install graphifyy
graphify install --project --platform codex
graphify .
```

Не запускать `graphify .` только по документационному scaffold. После существенных изменений архитектуры или module boundaries граф должен быть регенерирован и проверен на отсутствие чувствительных данных.

## 11. Текущий статус

Проект находится на стадии архитектурной фиксации и подготовки к scaffold. Production release запрещен до прохождения базового security/release gate.

Текущие задачи: [plan.md](plan.md).  
Текущий аудит: [docs/audit-2026-09-02.md](docs/audit-2026-09-02.md).
