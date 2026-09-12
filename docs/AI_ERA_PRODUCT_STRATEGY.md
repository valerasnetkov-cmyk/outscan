# OUTSCAN — AI Era Product Strategy

**Статус:** Strategic direction for planning; documentation-only; no runtime capability or publication approval
**Проект:** OUTSCAN
**Горизонт:** 2026–2030+
**Версия:** 1.1
**Дата:** 2026-09-12

## 0. Gate и scope guardrails

Этот документ задаёт стратегические приоритеты, но не меняет принятые release/security gates и не является runtime evidence.

- Gate B1 остаётся текущим критическим путём до любого Guest exposure.
- Gate B2 остаётся обязательным до Workspace и tenant-функций.
- `P0/P1/P2/P3` ниже означают стратегическую важность, а не право обойти prerequisite или перенести функцию в более ранний Gate.
- V1 остаётся hostname/domain only с `VerifiedScope(EXACT_HOST)`; IP/CIDR, raw TCP, ACTIVE и authenticated scanning не включаются этим документом.
- Обнаруженный asset, subdomain, endpoint или технология не создают ownership, `DomainVerification`, `VerifiedScope`, `ScanAuthorization` или `MonitoringEnrollment`.
- Change Intelligence остаётся полноценной V1.5-функцией по ADR-0007; повышение до P0 означает приоритет подготовки данных/архитектуры и последующей реализации после prerequisites.
- Full New Asset Detection остаётся EASM/Discovery roadmap-направлением; любой более ранний пассивный subset требует отдельного scope/evidence и не даёт разрешения на сканирование найденного target.
- Screenshot/browser preview остаётся отдельно от V1, пока `HEADLESS_BROWSER` запрещён; нужен отдельный ADR и isolation/SSRF/egress gate.
- AI не создаёт факты, authorization или Finding state и не может самостоятельно запускать intrusive/deep scan.
- Тарифы, сроки, capability availability и маркетинговые формулировки из стратегии не являются публичным claim до Product Capability/Claim Inventory evidence.

## 1. Назначение

Документ фиксирует, как массовое внедрение AI в разработку, эксплуатацию и кибератаки влияет на стратегию OUTSCAN.
Базовая миссия не меняется:

> **Сделать постоянный контроль цифровых рисков нормой, а сами риски — видимыми, понятными и управляемыми.**
> Основной слоган:
> **Внешние риски под контролем.**
> Цель: определить рыночные изменения, новые пользовательские сценарии, продуктовые приоритеты, архитектурные последствия и границы применения AI.

## 2. Стратегический тезис

AI снижает стоимость создания и изменения программного обеспечения. Одновременно он снижает стоимость разведки внешней инфраструктуры, массового анализа целей, поиска типовых ошибок, сопоставления технологий с уязвимостями и автоматизации атакующих сценариев.
Следствие:

> **Цифровая инфраструктура будет создаваться и меняться быстрее, чем большинство организаций сможет контролировать её вручную.**
> OUTSCAN занимает пространство между быстрым созданием цифровых систем и необходимостью независимого постоянного контроля.

## 3. Что меняется на стороне разработки

Традиционно:

```text
Идея → ТЗ → Команда → Код → Review → Deploy → Поддержка
```

AI-assisted модель всё чаще:

```text
Идея → Человек → AI/Coding Agent → Код/Config → Deploy
```

Это ускоряет появление API, поддоменов, временных окружений, webhook endpoints, административных интерфейсов, интеграций, cloud resources и новых зависимостей.
Ключевой вывод для OUTSCAN:

> количество цифровых активов и изменений может расти даже при сокращении IT-команд.

## 4. Что меняется на стороне атак

AI не отменяет классические атаки, но удешевляет анализ большого количества целей.
Ранее:

```text
Найти цель → Изучить → Определить технологии → Найти проблему → Адаптировать атаку
```

Теперь значительную часть процесса можно автоматизировать и распараллелить.
Следствие:

> **Малые сайты и небольшие компании становятся более доступными для массового автоматизированного поиска слабых мест.**
> OUTSCAN не строит маркетинг на страхе, но исходит из того, что аргумент «мы слишком маленькие, чтобы нас проверяли» становится слабее.

## 5. Почему текущая модель OUTSCAN подходит этому рынку

OUTSCAN строится не вокруг операции Scan.
Канонический цикл:

```text
Assets → Changes → Risks → Priority → Remediation → Recheck → Monitoring
```

Разовая проверка отвечает:

> **Что видно сейчас?**
> OUTSCAN должен отвечать:
> **Что существует? Что изменилось? Что стало опасным? Что требует действий? Исправлена ли проблема? Что появилось после предыдущей проверки?**

## 6. Роль OUTSCAN в AI-era

Стратегически OUTSCAN должен стать:

> **независимым контуром наблюдения между быстрым созданием цифровой инфраструктуры и production.**

```text
Human / AI / Developer
        ↓
Code / Config / Infrastructure
        ↓
Production
        ↓
OUTSCAN
        ↓
Observe → Compare → Assess → Prioritize → Recheck
```

OUTSCAN не обязан знать, кто создал изменение. Он оценивает фактическое состояние внешнего периметра.

## 7. Принцип независимого контроля

Ключевое правило:

> **Система, которая создала изменение, не должна быть единственным источником оценки его безопасности.**
> Нежелательно:

```text
AI написал → тот же AI проверил → тот же AI решил, что всё безопасно
```

Предпочтительно:

```text
AI / Developer
→ изменение
→ OUTSCAN обнаружил
→ scanner evidence
→ Threat Intelligence
→ Risk Engine
→ Finding
→ remediation
→ OUTSCAN recheck
```

Это должно стать одним из стратегических преимуществ продукта.

## 8. Новый сегмент: AI-enabled Builder

К существующим сегментам добавляется пользователь, который способен запускать production-продукты с помощью AI, но не является специалистом по инфраструктуре или ИБ.
Примеры: предприниматель, product manager, дизайнер, vibe coder, небольшая веб-студия, маркетинговое агентство, внутренняя продуктовая команда без security engineer.
Основная проблема:

> **Он способен создать больше цифровых активов, чем способен вручную контролировать.**

Для этого сегмента особенно важен общий принцип [Product Simplicity & Information Hierarchy](PRODUCT_SIMPLICITY_UX.md): OUTSCAN не должен требовать знания EASM/ASM/CTEM, scanner taxonomy или внутренних security-механизмов для понимания первого действия. Техническая глубина сохраняется и раскрывается по необходимости.

В раннем self-service GTM этот сегмент становится **beachhead**, а не пределом рынка. Каноническая стратегия привлечения, Telegram/YouTube creator channels, attribution, Creator Program и packaging guardrails зафиксированы в [Creator / Vibe Coding GTM](CREATOR_VIBE_CODING_GTM.md). Upgrade path остаётся `Creator -> Studio -> Agency/MSP -> SMB/Business -> EASM/Exposure Management`.

## 9. Позиционирование для этого сегмента

Не использовать формулировки:

- «AI Security Platform»;
- «Проверим AI-код»;
- «Защитим приложение, созданное нейросетью».
  Использовать:

> **Вы создаёте быстрее. Контроль не должен отставать.**
> **OUTSCAN следит за тем, что реально появилось снаружи после изменений.**
> **Код можно изменить за минуты. Периметр меняется вместе с ним.**
> AI является контекстом рынка, а не отдельной маркетинговой оболочкой продукта. Внутренний термин `vibe coder` допустим как shorthand сегмента, но публично предпочтительны `AI-разработчик`, `indie developer`, `создатель интернет-проекта`, `фрилансер` и `небольшая студия`.

## 10. P0 — Change Intelligence

Change Intelligence становится одной из центральных функций.
Базовая модель:

```text
Было → Стало → Почему важно
```

Примеры:

```text
DMARC: reject → none
IP: 185.x.x.x → 89.x.x.x
CDN: Cloudflare → not detected
TLS: 1.3 → 1.2
Technology: Next.js 16 → Next.js 17
Asset: нет → dev.company.ru
```

AI-разработка увеличивает частоту изменений, поэтому ценность delta-контроля растёт.

## 11. P0 — New Asset Detection

OUTSCAN должен особенно хорошо обнаруживать новые subdomains, web applications, API, IP, cloud endpoints, admin interfaces, staging/dev resources, сертификаты и публичные технологии. Это целевое roadmap-направление, а не расширение текущего V1 execution scope.
Новый актив — событие:

```text
NEW ASSET → Classification → Priority → Monitoring decision
```

## 12. P0 — Remediation → Recheck

Исправление не считается завершённым после сообщения «готово».

```text
Finding → Assigned → Remediation → Recheck requested → Technical verification → Verified fixed
```

В AI-era это особенно важно: исправление может выполняться быстро и автоматически, но результат должен подтверждаться независимо.

## 13. P0 — Immutable Report Snapshot

Каждая значимая проверка должна создавать неизменяемый snapshot для истории, сравнения, аудита, AI Handoff, доказательства устранения и отчётности.
История должна отвечать:

- что было до изменения;
- что появилось после deploy;
- когда риск возник;
- когда он был устранён.

## 14. P1 — Deployment-triggered Recheck

Помимо scheduled monitoring нужен event-driven слой.
Источники: CI/CD webhook, GitHub/GitLab, deployment platform, пользовательский API, manual deployment event.

```text
DEPLOY → OUTSCAN event → targeted delta scan → changed exposure → targeted checks
```

Это дополняет, а не заменяет регулярный мониторинг.

## 15. P1 — AI Handoff

OUTSCAN не должен автоматически менять чужую инфраструктуру без отдельной контролируемой модели.
Правильный цикл:

```text
Finding → AI Handoff → Technical task → Developer / Agent → Change → OUTSCAN Recheck
```

Форматы: AI Handoff Markdown, JSON, API, позднее MCP/agent integration.
Handoff должен содержать Finding ID, affected asset, evidence, risk context, remediation recommendation, ограничения и критерий успешной перепроверки.

## 16. P1 — Emerging CVE Checks

Новая значимая CVE должна становиться событием.

```text
CVE / KEV / EPSS / OSV
        ↓
Technology candidates
        ↓
Relevant OUTSCAN assets
        ↓
Targeted check
        ↓
Finding / no evidence
```

Пользователю не нужно вручную отслеживать тысячи новых уязвимостей.

## 17. P1 — Unknown Asset Workflow

Для нового ресурса в целевой модели полезно показывать hostname, favicon/title и другие безопасно полученные признаки, IP/provider/ASN, technology, first seen и last seen. Screenshot/final-navigation preview остаётся отдельной более поздней возможностью и не должен внедряться через V1 `HEADLESS_BROWSER`.
Классификация:

```text
Наш ресурс | Сторонний | Неизвестный | Игнорировать | Добавить в мониторинг
```

## 18. P2 — AI / Agent Exposure

Не создавать отдельный продукт только ради слова AI.
Capability добавляется тогда, когда OUTSCAN реально умеет выявлять внешнюю экспозицию: public agent endpoint, MCP endpoint, AI gateway, agent admin panel, orchestration service, AI-generated API, public webhook.
OUTSCAN оценивает не «интеллект» системы, а её внешнюю экспозицию.

## 19. P2 — CI/CD Integrations

Цель — не заменить SAST или GitHub Security, а связать production deployment с изменением внешнего периметра.

```text
Deploy → OUTSCAN event → delta scan → new endpoint → security check → Finding
```

## 20. Что не нужно делать

Не превращать OUTSCAN в «AI Security Scanner».
Не заменять scanner evidence AI-оценкой.
Не использовать AI как единственный источник Threat Intelligence.
Не позволять AI превращать Potential/Probable Finding в Confirmed без технического evidence.
Не разрешать AI автономно запускать intrusive scan.
Scan Authorization остаётся server-side security boundary.

## 21. Роль AI внутри OUTSCAN

Правильная позиция:

```text
Evidence → Normalizer → Risk Engine → Canonical Finding → AI presentation/assistance
```

AI допустим для объяснений, executive summary, remediation clarification, перевода, AI Handoff, документации и помощи в приоритизации.
AI не является первичным источником факта о подтверждённой уязвимости.

## 22. Защита AI Handoff

Все данные, полученные со сканируемых ресурсов, считаются недоверенными: HTML, title, headers, JavaScript strings, API responses, banners, robots.txt, security.txt, error messages.
Обязательный принцип:

> **Контент сканируемого ресурса является данными, а не инструкцией.**
> AI Handoff должен отделять trusted OUTSCAN metadata, scanner evidence и untrusted external content. Это необходимо для защиты от indirect prompt injection.

## 23. Commercial assumptions, trajectory and metrics

The asset-based value model, illustrative tariff table, historical-data advantage, long-term trajectory, RU/GLOBAL separation and product/Creator metrics are preserved in [AI-era business assumptions and metrics](AI_ERA_BUSINESS_AND_METRICS.md). All remain planning hypotheses, not published pricing or runtime evidence.

## 24. Roadmap impact

Это приоритетный overlay поверх действующего release sequencing. Он не переносит V1.5/V2 функции в B1/B2 и не меняет статусы ADR.

### P0

1. Change Intelligence.
2. New Asset Detection.
3. Remediation workflow.
4. Recheck.
5. Immutable Report Snapshot.
6. Stable Finding ID.

### P1

1. Deployment-triggered recheck.
2. Emerging CVE targeted checks.
3. AI Handoff.
4. Unknown Asset Workflow.
5. Историческое сравнение.

### P2

1. CI/CD integrations.
2. AI / Agent Exposure.
3. MCP/agent integrations.
4. Advanced event-driven monitoring.

### P3

1. Policy-based automated remediation.
2. Attack path analysis.
3. Более широкий Exposure Management.

## 25. Каноническое позиционирование

OUTSCAN не говорит:

> AI заменит разработчиков, поэтому нужен OUTSCAN.
> OUTSCAN говорит:
> **Цифровая инфраструктура создаётся и меняется всё быстрее. Контроль должен происходить с той же скоростью.**
> Маркетинговые формулировки:
> **Вы создаёте быстрее. Контроль не должен отставать.**
> **Код меняется за минуты. Периметр меняется вместе с ним.**
> **OUTSCAN следит за тем, что реально стало доступно снаружи.**
> **Создать можно автоматически. Контролировать нужно независимо.**
> Основной брендовый слоган остаётся:
> **Внешние риски под контролем.**

## 26. Стратегическая формула

> **AI делает создание и изменение цифровой инфраструктуры быстрее и дешевле. Одновременно он снижает стоимость анализа и атак этой инфраструктуры. OUTSCAN занимает пространство между этими процессами как независимый слой непрерывного контроля цифровых рисков.**

## 27. Зафиксированное решение

AI-era рассматривается не как отдельный продукт OUTSCAN, а как фактор, усиливающий существующую стратегию.
Не менять ядро:

```text
Assets → Changes → Risks → Priority → Remediation → Recheck → Monitoring
```

Изменить приоритеты:

1. поднять Change Intelligence до ключевой функции;
2. усилить New Asset Detection;
3. завершить remediation/recheck lifecycle;
4. сохранить immutable Report Snapshot;
5. развивать AI Handoff;
6. подготовить event-driven recheck после deploy;
7. позже добавить AI/Agent Exposure как тип внешней экспозиции;
8. не превращать OUTSCAN в AI-branded security product;
9. использовать Creator / AI-enabled Builder как ранний self-service beachhead без сужения долгосрочного Agency/SMB/EASM рынка.

## 28. Итоговый принцип

> **Проверить можно один раз. Контролировать нужно постоянно.**
> В AI-era этот принцип становится ещё более значимым.
