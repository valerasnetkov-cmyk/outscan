# Competitive analysis

Дата среза: **2026-09-02**.

Этот документ фиксирует продуктовые выводы из анализа текущего рынка. Он не является постоянным источником цен конкурентов: тарифы и наборы функций меняются, поэтому перед коммерческими решениями данные нужно перепроверять.

## 1. Рыночные группы

### Website security / SMB

Примеры: WebSentry, KeepSiteSafe и похожие сервисы.

Сильные стороны:

- почти нулевой порог входа;
- бесплатный scan без регистрации;
- понятный grade/report;
- недорогой мониторинг;
- Agency / White Label на ранних тарифах.

Слабые стороны:

- часто ограничиваются сайтом, headers, TLS, DNS и базовыми findings;
- слабее в asset attribution и attack surface;
- редко имеют развитый Threat Intelligence / Risk Engine;
- история изменения инфраструктуры обычно не является ядром продукта.

Вывод для OUTSCAN: базовые DNS/TLS/headers проверки сами по себе не являются дифференциатором.

### Vulnerability scanning / pentest platforms

Примеры: HostedScan, Pentest-Tools.com, Intruder.

Сильные стороны:

- зрелые scanners;
- большое покрытие CVE, web/network checks;
- scheduled scans, reports, alerts, APIs;
- модель targets/assets с повторными scan без поминутной оплаты.

Слабые стороны:

- интерфейс и терминология часто рассчитаны на security engineers;
- пользователь получает много технических результатов и должен сам определять приоритет;
- простой публичный вход без account встречается реже;
- продукт может восприниматься как набор инструментов, а не как управление риском.

Вывод для OUTSCAN: не конкурировать количеством scanners. Конкурировать нормализацией, объяснимостью, контекстом и изменениями во времени.

### EASM / Enterprise exposure management

Примеры: Hardenize, Censys ASM, Microsoft Defender EASM, Detectify Surface Monitoring.

Сильные стороны:

- asset discovery и attribution;
- inventory внешней инфраструктуры;
- certificates/DNS/network posture;
- история и постоянный мониторинг;
- масштабирование на большое число активов.

Слабые стороны для целевого раннего сегмента OUTSCAN:

- enterprise complexity;
- sales-led onboarding;
- высокая стоимость;
- продукт часто требует специалиста по ИБ.

Вывод для OUTSCAN: взять дисциплину EASM и asset inventory, но сохранить self-service UX для SMB и агентств.

### Public Internet posture checkers

Ключевой ориентир: Internet.nl.

Сильные стороны:

- domain input без регистрации;
- IPv6, DNSSEC, HTTPS, security headers, email standards, RPKI;
- понятный публичный результат;
- акцент на стандартах, а не на запугивании.

Вывод для OUTSCAN: широкий Network & Domain Posture в Guest Scan является обоснованным, но не должен изображаться как полноценный vulnerability assessment.

## 2. Подтвержденные продуктовые решения

На основе анализа конкурентов закрепляются следующие решения.

### 2.1. Guest Scan должен быть реально полезным

Guest Scan не является teaser с почти пустым результатом.

Он должен полноценно показывать безопасные общедоступные параметры:

- domain / RDAP;
- DNS / DNSSEC / CAA;
- IPv4 / IPv6;
- ASN / BGP / RPKI;
- HTTPS / TLS / certificate;
- HTTP security posture;
- mail security;
- CDN/WAF;
- базовый technology fingerprint;
- агрегированную Certificate Transparency информацию.

При этом активные vulnerability details остаются за verification boundary.

### 2.2. Не использовать A-F grade как ядро продукта

Многие простые website scanners сводят результат к grade.

OUTSCAN сохраняет более точное разделение:

- Guest: `Baseline posture`;
- Verified Workspace: `OUTSCAN Security Score`;
- Findings: отдельные risk/confidence/status.

Один grade не должен скрывать Critical finding.

### 2.3. Change Intelligence становится first-class capability

Главный долгосрочный дифференциатор OUTSCAN:

> не только показать текущее значение, но и определить, что изменилось, когда, почему это важно и создает ли изменение новый риск.

Приоритетные изменения:

- new asset;
- IP / ASN;
- NS / MX;
- certificate / CA;
- CDN/WAF;
- TLS;
- DMARC;
- RPKI;
- technology fingerprint;
- exposure/finding state.

Change Intelligence должен появиться раньше большого AppSec-модуля.

### 2.4. Asset Graph basics раньше AppSec

Asset relationships и attribution должны развиваться сразу после verified baseline.

Пользователь должен понимать не только `найден asset`, но и:

- почему OUTSCAN считает его связанным с организацией;
- каким способом он найден;
- с какими IP/domains/services он связан;
- confidence этой связи;
- first/last seen.

Полноценная graph visualization может появиться позже. Данные для графа должны собираться раньше.

### 2.5. Risk Intelligence важнее scanner severity

OUTSCAN не является thin wrapper над Nuclei.

Продуктовый слой строится вокруг:

```text
Detection
+ Threat Intelligence
+ Exposure
+ Confidence
+ Business Criticality
+ Change Context
= OUTSCAN Risk
```

### 2.6. Business summary + technical drill-down

Каждый значимый результат имеет два представления.

Business layer:

- что произошло;
- насколько важно;
- что сделать;
- изменилось ли состояние.

Technical layer:

- scanner/source;
- CVE/CVSS/EPSS/KEV;
- evidence;
- affected asset;
- raw-enough diagnostic details без секретов.

### 2.7. Agency / MSP является ранним коммерческим направлением

Рынок подтверждает спрос на:

- client workspaces;
- white-label reports;
- bulk monitoring;
- delegated access;
- API/webhooks;
- predictable per-target pricing.

Agency не должен реализовываться как хранение всех клиентов в одном tenant.

Каждый клиент остается отдельной `Organization`; партнер получает ограниченный delegated access.

### 2.8. Billing: monitored assets, not scan credits

Обычные повторные scans не должны расходовать credits.

Основная единица коммерческой модели:

- monitored/protected asset;
- тарифные limits;
- add-ons для более дорогих классов анализа.

Automatically discovered assets не становятся billable без явного действия пользователя.

## 3. Позиционирование относительно конкурентов

OUTSCAN не должен позиционироваться как:

- SSL checker;
- headers checker;
- online pentest button;
- интерфейс над Nuclei;
- тяжелая enterprise SOC-console на MVP.

Целевая позиция:

> Self-service External Cyber Risk Monitoring для SMB, web/digital agencies и небольших IT-команд с постепенным ростом в EASM / Exposure Management.

## 4. Основные дифференциаторы

1. Полезный Guest Network & Domain Posture без регистрации.
2. Жесткая verification boundary перед active scanning.
3. Change Intelligence и исторический diff.
4. Risk Intelligence: CVSS + EPSS + KEV + exposure + confidence + criticality.
5. Asset Inventory с provenance и ранними Asset Relations.
6. Два уровня объяснения: business и technical.
7. Agency/MSP workflow как ранний revenue channel.
8. Predictable monitored-asset billing без scan credits.
9. Спокойный минималистичный UX без cyber fear marketing.

## 5. Что не копировать

- A-F grade как единственный сигнал безопасности.
- free scan, который раскрывает operational exploitation details чужого ресурса.
- credits за каждую обычную проверку.
- интерфейс, построенный вокруг выбора scanner tools.
- автоматическое добавление найденных поддоменов в счет.
- десятки модулей до появления product-market evidence.

## 6. Риски

### Commodity risk

DNS/TLS/headers быстро становятся commodity. Поэтому MVP должен сразу хранить историю и готовить Change Intelligence.

### Scanner dependency risk

Сильная зависимость от Nuclei/ProjectDiscovery должна быть ограничена через `ScannerAdapter`, normalized findings и собственный Risk Engine.

### Agency tenant risk

Ошибочная модель parent tenant -> client records создаст высокий риск cross-client exposure. Клиенты должны оставаться отдельными tenants.

### Over-expansion risk

Не добавлять AppSec, Mobile, Cloud и Git одновременно. Следующий модуль выбирается по usage/revenue evidence.

## 7. Источники рыночного среза

Проверены публичные страницы и документация WebSentry, HostedScan, Hardenize, Detectify, Internet.nl и других сервисов в ходе анализа 2026-09-02.

Точные цены и feature limits являются изменяемыми внешними данными и не должны использоваться как неизменяемые project constants.

Reference pages used in the 2026-09-02 review:

- `https://websentry.dev/pricing/`
- `https://hostedscan.com/pricing`
- `https://www.hardenize.com/pricing`
- `https://detectify.com/pricing`
- `https://internet.nl/test-site/`

Перед использованием этих данных для pricing/feature decisions перепроверять страницы.
