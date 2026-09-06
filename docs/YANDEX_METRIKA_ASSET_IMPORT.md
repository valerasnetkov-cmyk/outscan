# OUTSCAN — интеграция с Яндекс Метрикой

## Импорт цифровых активов из Яндекс Метрики

**Статус:** Foundation implemented; Workspace delivery pending  
**Тип:** Product + Technical Specification  
**Дата:** 2026-09-03

Текущий закрытый foundation-срез реализован в `apps/api/src/integrations/yandex-metrika` и `apps/api/src/external-assets`: OAuth request/state/PKCE contract, bounded Management API client, строгий partial-record parser, hostname/public-suffix normalization и детерминированная provenance/deduplication projection. Маршруты, обмен code на token, хранение credentials, tenant persistence, sync/import transactions, scheduler, UI и scan handoff намеренно не опубликованы до появления B2 auth/Organization/RLS/audit prerequisites.

## 1. Цель

Реализовать функцию **«Импорт из Яндекс Метрики»**.
Пользователь подключает аккаунт Метрики, OUTSCAN получает доступные счётчики, извлекает сайты и зеркала, нормализует hostname, сопоставляет их с Asset Inventory и предлагает выбрать ресурсы для добавления.
Метрика используется как **External Asset Source**, а не как подтверждение права на активное security-сканирование.

## 2. Пользовательская ценность

Ускорение onboarding и массового импорта, обнаружение забытых ресурсов, сопоставление с Assets, поддержка Agency/MSP-сценария и будущего Business Context в Risk Engine.

## 3. Security invariant

Доступ к счётчику Метрики не означает `OUTSCAN_VERIFIED`.
Правильный flow:
`Metrika → Asset Candidate → User Import → QUICK_SCAN → DNS TXT Verification → VERIFIED → Extended Scan → Monitoring`.
Запрещённый flow:
`Metrika access → VERIFIED → Deep Scan`.

## 4. OAuth

Использовать только scope `metrika:read`.
Не запрашивать `metrika:write`.
OUTSCAN V1 не создаёт и не изменяет счётчики, цели, права или данные Метрики.
Callback: `https://outscan.ru/api/integrations/yandex-metrika/callback`.
Flow:

1. Backend создаёт cryptographically random `state` и PKCE verifier/challenge (`S256`).
2. Пользователь перенаправляется в Yandex OAuth.
3. Yandex возвращает authorization code.
4. Backend проверяет `state`.
5. Code обменивается на access token.
6. Token шифруется и хранится server-side.
7. Frontend token не получает.
8. Запускается первичная синхронизация.

## 5. API Яндекс Метрики

Основной endpoint:
`GET https://api-metrika.yandex.net/management/v1/counters`
Header: `Authorization: OAuth <TOKEN>`.
Обязательно поддержать пагинацию.
Минимальные поля:

- `id` — внешний ID счётчика;
- `name` — название проекта;
- `site2.site` — основной кандидат;
- `mirrors2[].site` — дополнительные кандидаты;
- `owner_login` — provenance metadata;
- `permission` — уровень доступа;
- `status` — состояние объекта;
- `source` — дополнительная metadata.

## 6. Permission mapping

Поддержать значения: `own`, `edit`, `analyst`, `view`, `view_access_filter`, `analyst_access_filter`.
UI mapping:

- `own` → Владелец;
- `edit` → Редактирование;
- `analyst` → Аналитика;
- `view` → Просмотр;
- `view_access_filter` → Ограниченный просмотр;
- `analyst_access_filter` → Ограниченная аналитика.
  Permission хранится как metadata и не меняет verification status.

## 7. External Asset Sources

Не добавлять Yandex-specific поля непосредственно в `Asset`.
Ввести общий provider layer `External Asset Sources`.
Первый provider: `YANDEX_METRIKA`.
Будущие providers: `YANDEX_CLOUD`, `GITHUB`, `GITLAB`, `CERTIFICATE_TRANSPARENCY`, `DNS_DISCOVERY`, `SCANNER_DISCOVERY`, `MANUAL_IMPORT`.

## 8. Модель данных

### IntegrationConnection

Поля: `id`, `organization_id`, `provider`, `status`, `external_account_id`, `external_account_label`, `encrypted_access_token`, `connected_by_user_id`, `connected_at`, `last_sync_at`, `last_sync_status`.
`provider = YANDEX_METRIKA`.

### ExternalCounter

Поля: `id`, `organization_id`, `connection_id`, `external_id`, `name`, `owner_login`, `permission`, `status`, `source`, `primary_site`, `raw_metadata`, `first_seen_at`, `last_seen_at`, `synced_at`.

### AssetCandidate

Поля: `id`, `organization_id`, `asset_type`, `raw_value`, `canonical_hostname`, `source_type`, `source_connection_id`, `source_external_id`, `source_name`, `source_permission`, `first_seen_at`, `last_seen_at`, `status`, `metadata`.
Статусы: `DISCOVERED`, `SELECTED`, `IMPORTED`, `IGNORED`, `ALREADY_EXISTS`, `INVALID`.

### AssetSourceLink

Поля: `id`, `organization_id`, `asset_id`, `source_type`, `source_connection_id`, `source_external_id`, `source_role`, `source_metadata`, `first_seen_at`, `last_seen_at`.
Для Метрики `source_role`: `PRIMARY_SITE` или `MIRROR`.

## 9. Нормализация hostname

Pipeline: `raw → trim → parse http/https URL → reject credentials → extract hostname while discarding port/path/query/fragment → lowercase → IDN canonicalization → hostname validation → ICANN public suffix validation → canonical hostname`.
Пример: `https://EXAMPLE.RU/catalog/?utm_source=x` → `example.ru`.
Не склеивать автоматически `example.ru`, `www.example.ru`, `api.example.ru`, `shop.example.ru`: для security monitoring это разные Assets.

## 10. Дедупликация

Один hostname может находиться в нескольких счётчиках, быть основным сайтом/зеркалом, уже существовать в OUTSCAN или быть найден другим source.
Правило: один Asset может иметь несколько `AssetSourceLink`.
Повторный sync не создаёт duplicate `ExternalCounter`, `AssetCandidate`, `Asset` или `AssetSourceLink`.
Ключи дедупликации учитывают `organization_id`, provider, external counter id, canonical hostname и source role.

## 11. UI подключения

Путь: `Настройки → Интеграции → Яндекс Метрика`.
До подключения:

> Импортируйте сайты, доступные в вашем аккаунте Метрики, и добавьте их в OUTSCAN.
> Кнопка: **Подключить**.
> После подключения показывать:

- статус подключения;
- количество счётчиков;
- уникальные ресурсы;
- связанные Assets;
- новые кандидаты;
- время последнего sync;
- действия `Импортировать ресурсы`, `Синхронизировать`, `Отключить`.

## 12. UI импорта

Использовать таблицу, не карточки.
Колонки:

- checkbox;
- hostname;
- counter id/name;
- permission;
- status OUTSCAN.
  Статусы OUTSCAN: `Новый`, `Уже добавлен`, `Игнорируется`, `Некорректный`.
  Фильтры: `Все`, `Новые`, `Уже в OUTSCAN`, `Игнорируемые`, `Владелец`, `Редактирование`, `Просмотр/Аналитика`.
  Поиск по hostname, имени счётчика и counter ID.
  Основной CTA: **Добавить N ресурсов**.

## 13. Импорт

После подтверждения пользователя:
`AssetCandidate → SELECTED → find/create Asset → create AssetSourceLink → IMPORTED → schedule QUICK_SCAN`.
Если Asset уже существует: установить `ALREADY_EXISTS` и создать отсутствующий `AssetSourceLink`.
Candidate не расходует лимит тарифа.
Импорт не включает платный monitoring без явного opt-in.

## 14. QUICK_SCAN

После импорта будущий QUICK_SCAN может запросить только существующий `GUEST_SAFE` profile и всё равно требует отдельного текущего `ScanAuthorization`. Импорт не создаёт новый scanner profile и не расширяет ADR-0012 policy. В пределах `GUEST_SAFE` автоматически разрешены только безопасные проверки:

- DNS;
- HTTPS/TLS;
- сертификат;
- HTTP security headers;
- email security;
- базовая technology detection;
- безопасные infrastructure checks.
  Автоматически запрещены: `Naabu`, active Nuclei templates, Katana deep crawl, ZAP, fuzzing, brute force, authenticated scan, intrusive checks.
  После QUICK_SCAN показать CTA DNS TXT verification.
  Пример TXT: `outscan-verification=<token>`.

## 15. Синхронизация

MVP: ручной sync + один автоматический sync в сутки.
Flow: `fetch counters → normalize → compare → update ExternalCounter → update AssetCandidate → mark stale sources`.
Новый ресурс должен создать уведомление/событие с действиями **Добавить в OUTSCAN** и **Игнорировать**.
По умолчанию: auto-discovery ON, auto-add-to-monitoring OFF.

## 16. Исчезновение ресурса из Метрики

Если счётчик или зеркало пропали из API:

- не удалять Asset;
- не удалять Verification, Findings, Reports или Monitoring;
- обновить `last_seen_at`;
- отметить source как `STALE/REMOVED`.
  Метрика отвечает за provenance, но не за lifecycle OUTSCAN Asset.

## 17. Disconnect

При отключении деактивировать/удалить OAuth credentials и sync schedule.
Сохранить Assets, Verification, Findings, Reports, Monitoring, AssetSourceLink history и Audit Log.

## 18. Security requirements

OAuth token:

- только server-side;
- encrypted at rest;
- не возвращается frontend;
- не попадает в logs;
- не попадает в scanner jobs;
- недоступен scanner workers;
- удаляется/деактивируется при disconnect.
  OAuth protection: random `state`, strict callback allowlist, one-time OAuth session, TTL, проверка `state`.
  Tenant isolation: каждая сущность содержит `organization_id`; Organization A не видит данные Organization B.
  Подключение/отключение: только `Organization Owner` и `Organization Admin`.
  Все authorization checks выполняются server-side.

## 19. Audit Log

Журналировать:

- `YANDEX_METRIKA_CONNECTED`;
- `YANDEX_METRIKA_DISCONNECTED`;
- `YANDEX_METRIKA_SYNC_STARTED`;
- `YANDEX_METRIKA_SYNC_COMPLETED`;
- `YANDEX_METRIKA_SYNC_FAILED`;
- `ASSET_CANDIDATE_DISCOVERED`;
- `ASSET_IMPORTED_FROM_METRIKA`;
- `ASSET_CANDIDATE_IGNORED`.
  OAuth token не журналировать.

## 20. Errors и rate limits

Обработать: `401`, `403`, `429`, `5xx`, timeout, revoked token, invalid hostname, duplicate data, partial sync failure.
Требования: bounded concurrency, retry только retryable errors, exponential backoff + jitter, уважение `429`, sync lock на connection, запрет parallel duplicate sync.
Ошибка одной записи не должна ломать всю синхронизацию.

## 21. OUTSCAN API

Рекомендуемые endpoints:

- `POST /api/integrations/yandex-metrika/connect`;
- `GET /api/integrations/yandex-metrika/callback`;
- `GET /api/integrations/yandex-metrika`;
- `POST /api/integrations/yandex-metrika/sync`;
- `DELETE /api/integrations/yandex-metrika`;
- `GET /api/integrations/yandex-metrika/candidates`;
- `POST /api/integrations/yandex-metrika/import`;
- `POST /api/integrations/yandex-metrika/candidates/{id}/ignore`.
  Финальные имена должны соответствовать API conventions проекта.

## 22. Scanner boundary

`Application Backend → Yandex API` использует OAuth token.
`Application Backend → Queue → Scanner Worker` передаёт только нормализованный scan target/job contract.
Scanner worker никогда не получает Yandex OAuth credentials.

## 23. Observability

Минимальные метрики:

- `metrika_connections_total`;
- `metrika_sync_success_total`;
- `metrika_sync_failure_total`;
- `metrika_sync_duration`;
- `metrika_counters_fetched`;
- `metrika_candidates_discovered`;
- `metrika_assets_imported`;
- `metrika_api_401_total`;
- `metrika_api_429_total`.

## 24. Agency / MSP

Архитектура должна позволять позднее mapping `Metrika Counter → Customer Workspace`.
MVP: импорт только в текущую Organization.
Будущее UI: `Импортировать в текущую организацию` или `Импортировать как клиентские ресурсы`.

## 25. Business Context — V2

Не включать в первый релиз.
Будущая цепочка: `Yandex Metrika → Reporting API → aggregated traffic/goals → Business Criticality → Risk Engine enrichment`.
Данные Метрики не меняют technical severity Finding.
Они могут влиять на Business Criticality, Remediation Priority и Executive Risk.

## 26. Privacy / Logs API

Logs API в V1 не использовать.
Не импортировать визиты, visitor IDs, пользовательские сессии, raw events или другие неагрегированные данные.
Asset Import хранит только connection metadata, counters и provenance.

## 27. Не делать в MVP

- `metrika:write`;
- изменение счётчиков/целей;
- Logs API;
- raw visits;
- автоматический `VERIFIED`;
- deep scan сразу после импорта;
- автоматическое подключение всех Assets к тарифу;
- удаление Asset при исчезновении счётчика;
- traffic-based Risk Engine;
- multi-client Agency mapping;
- bidirectional sync.

## 28. MVP scope

1. Yandex OAuth + `metrika:read`.
2. Secure token storage.
3. Counter list + pagination.
4. `site2.site` и `mirrors2[].site`.
5. Permission metadata.
6. Hostname normalization.
7. Deduplication.
8. `IntegrationConnection`.
9. `ExternalCounter`.
10. `AssetCandidate`.
11. `AssetSourceLink`.
12. Import table + filters.
13. User selection + manual import.
14. QUICK_SCAN.
15. DNS verification CTA.
16. Manual + daily sync.
17. New candidate discovery.
18. Disconnect.
19. Audit Log.
20. Retry/rate-limit handling.

## 29. Acceptance criteria

Текущий foundation evidence: counter contract/pagination/normalization/deduplication/OAuth request security и scanner-boundary negative tests реализованы. Остальные критерии относятся к Workspace delivery и не считаются PASS до auth/persistence/UI/runtime evidence.

### OAuth

- подключение работает;
- scope только `metrika:read`;
- callback защищён `state`;
- token не доступен frontend/logs/workers.

### Sync

- импортируются все доступные counters;
- пагинация работает;
- sync идемпотентен;
- partial failure не ломает job.

### Assets

- `site2.site` и `mirrors2[].site` создают candidates;
- hostname нормализуется;
- duplicate hostname не создаёт duplicate Asset;
- разные subdomains не склеиваются.

### Security

- Metrika access ≠ verification;
- deep scan до verification запрещён;
- tenant isolation server-side;
- scanner не получает OAuth credentials.

### Billing

- Candidate не тарифицируется;
- monitoring требует отдельного opt-in.

### Disconnect

- credentials отключаются;
- Assets, Findings и Monitoring сохраняются.

## 30. Definition of Done

Полный DoD ниже пока не закрыт; foundation-срез не равен production integration.

`OAuth PASS`
`Token storage PASS`
`Tenant isolation PASS`
`Counter sync PASS`
`Pagination PASS`
`Normalization PASS`
`Deduplication PASS`
`Import UI PASS`
`Asset provenance PASS`
`QUICK_SCAN handoff PASS`
`Verification boundary PASS`
`Sync idempotency PASS`
`Rate-limit handling PASS`
`Disconnect flow PASS`
`Audit logging PASS`
`Security review PASS`

## 31. Источники

- `https://yastatic.net/s3/doc-binary/src/support/metrica/ru/MetricaIntegrationInstructions.pdf`
- `https://yandex.ru/dev/metrika/ru/intro/authorization`
- `https://yandex.ru/dev/metrika/ru/management/openapi/counter/counters`
- `https://yandex.ru/dev/metrika/ru/`
  Документация подтверждает OAuth, `metrika:read`, `/management/v1/counters`, `site2`, `mirrors2`, `owner_login`, `permission` и значения permission, используемые в этом документе.

## 32. Итоговое решение

Интеграцию реализовать как первый provider общего слоя **External Asset Sources**.
Универсальная модель:
`DISCOVER → NORMALIZE → DEDUPLICATE → PROVENANCE → USER CONFIRMATION → ASSET → VERIFY → SCAN → MONITOR`.
Ключевой invariant:

> **Метрика обнаруживает ресурс. Пользователь выбирает ресурс. OUTSCAN отдельно подтверждает право на расширенное сканирование.**
