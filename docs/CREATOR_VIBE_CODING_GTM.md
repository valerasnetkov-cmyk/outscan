# OUTSCAN — Creator / Vibe Coding Go-to-Market Strategy

**Статус:** Strategic direction for planning; documentation-only; no runtime capability or publication approval
**Проект:** OUTSCAN
**Дата:** 2026-09-12
**Версия:** 1.0

## 0. Направление для планирования

OUTSCAN использует `AI-enabled Builder / Creator` как **beachhead-сегмент для раннего self-service роста**, но не ограничивает им долгосрочный рынок продукта.

Внутренне допустим термин `vibe coder` как описание поведения сегмента. В публичной коммуникации предпочтительны: AI-разработчик, независимый разработчик / indie developer, создатель сайта или интернет-проекта, фрилансер, небольшая веб-студия, небольшая команда без выделенного security engineer.

> **Vibe coder — входной рынок, а не потолок OUTSCAN.**

Долгосрочная траектория не меняется:

```text
Creator / AI Builder
→ Freelancer / Studio
→ Agency / MSP
→ SMB / Business
→ EASM / Exposure Management
```

## 1. Почему сегмент подходит OUTSCAN

Крупные EASM/Exposure Management продукты в основном оптимизированы под зрелые корпоративные команды, procurement-процессы и большие инфраструктуры. OUTSCAN может занять пространство между двумя состояниями:

```text
«Я только что нажал Deploy»
            ↓
«Мне уже нужен постоянный внешний контроль»
```

AI-assisted разработка снижает барьер создания production-систем, но не гарантирует отдельный security review, инвентаризацию внешних активов, историю изменений и постоянный мониторинг.

OUTSCAN должен давать пользователю независимую проверку фактического внешнего состояния без обязательного знания EASM/ASM/CTEM и scanner taxonomy.

## 2. Основные ICP

| Сегмент                    | Типичная ситуация                    | Основная ценность OUTSCAN            |
| -------------------------- | ------------------------------------ | ------------------------------------ |
| Первый AI-проект           | опубликован без отдельного ИБ-review | понятная внешняя проверка            |
| Vibe coder / indie builder | частые deploy через Coding Agent     | независимая проверка после изменений |
| Фрилансер                  | сдаёт клиенту сайт или приложение    | контроль перед сдачей + recheck      |
| Небольшая студия           | ведёт несколько клиентских проектов  | единый мониторинг и история          |
| Indie SaaS                 | постоянно меняет production          | Change Intelligence + alerts         |
| Малый бизнес               | нет выделенной ИБ-команды            | контроль без enterprise-сложности    |

Для платной модели наиболее сильны пользователи, у которых есть изменения, несколько активов, необходимость мониторинга или клиентский портфель. Один редко меняющийся статический сайт может оставаться Free/low-touch acquisition-сценарием.

## 3. Основной пользовательский цикл

Для Creator-аудитории поверх общего цикла OUTSCAN используется простой сценарий:

```text
Создал
→ Опубликовал
→ Проверил OUTSCAN
→ Получил понятный приоритет
→ Исправил сам / с разработчиком / с AI
→ OUTSCAN перепроверил
→ Подключил мониторинг
→ Получил уведомление об изменении
```

Это presentation/GTM-модель. Она не создаёт новый Finding lifecycle, scan profile или security boundary. Канонический внутренний цикл остаётся:

```text
Assets → Changes → Risks → Priority → Remediation → Recheck → Monitoring
```

## 4. Product wedge

Для раннего захвата сегмента важнее не добавлять много scanners, а сделать короткий путь к ценности:

1. домен вводится без регистрации;
2. выполняется существующий Guest Safe Scan;
3. пользователь получает базовую оценку и potential-risk aggregate;
4. для деталей проходит стандартную регистрацию и verification;
5. после B2 получает Workspace и Monitoring;
6. после реализации Reporting/AI Handoff передаёт finding разработчику или Coding Agent;
7. OUTSCAN независимо выполняет recheck.

Главный JTBD:

> **Я быстро выпустил интернет-проект. Покажите, что реально доступно снаружи, что требует внимания и исправил ли я это после следующего deploy.**

## 5. AI Fix / AI Handoff

Маркетинговая кнопка уровня `Исправить с AI` допустима только после реализации безопасного deterministic AI Handoff:

```text
Canonical Finding
→ bounded AI Handoff
→ пользователь / разработчик / Coding Agent
→ изменение проекта
→ Deploy
→ OUTSCAN Recheck
```

Публикация кнопки требует отдельного Claim Inventory/UX review. Она не означает автоматическую выдачу repository/shell/cloud/DNS-доступа, передачу сырого внешнего контента как доверенных инструкций, изменение Finding в `RESOLVED`, ослабление scanner policy, разрешение intrusive/deep scan или гарантию корректности AI-исправления.

Техническая истина определяется каноническими данными OUTSCAN. Report/AI export не меняет Finding; automatic RESOLVED остаётся отключённым по ADR-0013 до принятого и проверенного compatible-coverage контракта.

## 6. Telegram: acquisition + retention

Telegram рассматривается не только как канал уведомлений, но и как потенциальный acquisition surface.

### 6.1 Proposed public acquisition flow

После Gate B1 и доказанной безопасной Guest execution:

```text
Telegram
→ пользователь отправляет hostname
→ строгая canonicalization/validation
→ существующий Guest Safe Scan
→ короткий результат
→ deep link в OUTSCAN
→ registration / verification
```

Telegram не получает отдельного более сильного scan profile. Запрещены arbitrary URL/path/port/userinfo/IP, выбор scanner/template/profile через сообщение, обход Guest rate limits/SSRF/egress validation, раскрытие скрытых guest-данных и запуск verified/deep scan без существующей authorization-модели.

До отдельного channel/security решения Telegram acquisition использует ссылку на web Guest. Прямой chat scan остаётся предложением: B1 сам по себе его не включает. Нужна проверенная привязка к server-authenticated Guest-session cookie по ADR-0011; Telegram user/chat ID, referral и fingerprint не заменяют session ownership/idempotency. Bot не принимает result token в URL; переход в web не раскрывает скрытые Guest-данные. Customer/Ops notifications остаются разделёнными по ADR-0015.

Один bot UI может сочетать Guest entry и authenticated notifications только при строгом разделении backend flows, identities, permissions и rate limits. Альтернативно acquisition bot может быть отдельным surface; решение принимается при реализации.

### 6.2 Retention flow

После B2/Monitoring пользователь может получать технические уведомления о значимых рисках, изменениях, истечении сертификатов и результате recheck. Маркетинговые сообщения не смешиваются с обязательными/техническими уведомлениями и требуют отдельного consent policy.

## 7. Telegram-каналы

Приоритетный формат — нативная демонстрация продукта, а не баннерная реклама:

- автор проверяет собственный AI-built проект;
- `что нашёл OUTSCAN после deploy`;
- `AI сказал, что всё готово — смотрим внешний результат`;
- разбор проекта подписчика с разрешением владельца;
- finding → исправление → повторный recheck;
- серия `до → изменение → после`.

Контент показывает ценность независимого контроля, не эксплуатирует страх и не обещает абсолютную безопасность.

## 8. YouTube

Для YouTube приоритетен повторяемый формат **OUTSCAN Check**:

```text
Проект / сайт
→ как был создан
→ Guest/verified check в допустимом scope
→ 1–3 понятных finding/изменения
→ исправление
→ recheck
→ вывод о постоянном мониторинге
```

Темы: AI/Coding Agent проект, сайт после быстрого deploy, небольшой SaaS после запуска, разбор production-конфигурации, изменения через неделю после первой проверки.

YouTube API не является prerequisite MVP. На первом этапе достаточно creator partnership, tagged links, campaign attribution и разрешённых промомеханик.

## 9. Creator Program

Минимальная партнёрская модель:

```text
Creator
→ персональная campaign/referral ссылка
→ Guest Scan
→ registration
→ verification
→ MonitoringEnrollment
→ paid conversion
```

Промокоды/Access Grants допустимы только в рамках действующей entitlement-модели. Creator promotion никогда не обходит verification, не создаёт `VerifiedScope`/`ScanAuthorization`, не разрешает arbitrary target/intrusive scan и не меняет Finding evidence/state.

Вознаграждение партнёров, recurring revenue share и срок атрибуции являются коммерческими гипотезами и требуют отдельной финансовой модели и антифрода.

## 10. Packaging / Creator plan

Отдельный `AI tariff` не нужен. Допускается эксперимент с self-service упаковкой `Creator` или аналогичным названием, если она помогает конвертировать одиночного разработчика в мониторинг.

Предварительная ценовая гипотеза для теста спроса:

> **490–990 ₽/мес.**

Это не утверждённый публичный прайс и не entitlement contract. Эксперимент допустим только при доказанной unit economics: ограниченные monitored assets/projects, контролируемая стоимость scan jobs, low-touch support, alerts, history/recheck и AI Handoff после готовности capability.

Цена или название тарифа не меняют scanner authorization. Не допускается unlimited heavy scanning ради дешёвого acquisition-плана.

## 11. Лестница роста клиента

Creator-сегмент ценен не только прямым MRR:

```text
1 проект
→ 3–5 проектов
→ фрилансер с клиентами
→ маленькая студия
→ Agency/MSP
→ десятки/сотни клиентских активов
```

Продукт должен сохранять понятный upgrade path без миграции в отдельную платформу.

## 12. Каналы привлечения

Приоритет тестов:

1. Telegram-каналы про AI-разработку, Coding Agents, web/SaaS и VPS.
2. YouTube-каналы про разработку, AI-code, запуск SaaS и веб-проекты.
3. Партнёрства с веб-студиями и developer-сообществами.
4. Собственный контент OUTSCAN с безопасными разборами.
5. Referral/Creator Program.
6. Позже — developer/deployment integrations после security review.

Не строить стратегию только на платной рекламе или только на слове `vibe coding`.

## 13. Attribution funnel и метрики

Каждая creator integration измеряется до денег:

```text
Creator / campaign
→ click / deep link
→ Guest Scan
→ registration
→ domain verification
→ MonitoringEnrollment
→ paid conversion
→ retained MRR
```

Основные метрики: creator-channel CAC, конверсии Guest→registration→verification→Monitoring→paid, D30/D90 retention, MRR by campaign, payback, projects/assets per cohort и Free→Creator/Starter→Agency upgrade rate. `Views`, `likes` и raw scan count — вспомогательные, не главные критерии успеха.

## 14. Rollout по Gate/release

### До Gate B1

Разрешены стратегия, creator outreach, контент-план, campaign/referral data design и landing copy без недоступных capability claims. Публичный Guest execution и Telegram scan bot запрещены.

### После Gate B1

Можно тестировать web Guest Scan acquisition, creator landing/deep links, attribution и ограниченные creator campaigns. Public Telegram Guest Scan требует отдельной abuse/rate-limit/input/egress проверки bot surface и повторно использует существующий Guest security boundary.

### После Gate B2 и требуемых Phase prerequisites

Можно добавлять authenticated Telegram binding/technical alerts, Creator Workspace packaging, Monitoring conversion flows, remediation workflow и Reporting/AI Handoff по мере готовности их canonical prerequisites.

### V1.5 / V2+

Сильнейшие retention-функции: Change Intelligence, New Asset Detection, deployment-triggered recheck, Emerging CVE checks и Agency/MSP upgrade path.

## 15. Brand language

Основной бренд не меняется:

> **Внешние риски под контролем.**

Creator-specific campaign copy может тестировать:

> **Сделал. Запустил. Проверь.**

> **Вы создаёте быстрее. Контроль не должен отставать.**

> **AI написал код. OUTSCAN проверяет то, что реально оказалось доступно снаружи.**

Последняя формулировка требует Claim Inventory review и не означает проверку всего AI-кода или доказательство безопасности приложения. Внутренний provocative shorthand `Vibe coding заканчивается там, где начинается production` не является автоматически утверждённым публичным слоганом.

## 16. Что стратегия не меняет

Документ не меняет миссию OUTSCAN, корпоративный/Agency/EASM roadmap, tenant roles, scanner profiles или V1 `hostname/domain + EXACT_HOST`; не разрешает `ADMIN_ATTESTED`, HEADLESS_BROWSER, Naabu/raw TCP, ACTIVE или authenticated scan; не делает Telegram/YouTube security authority; не позволяет creator/referral payload выбирать scanner target/profile/template; не делает AI output источником Finding confirmation/resolution.

## 17. Стратегическое направление

OUTSCAN использует Creator / AI-enabled Builder как ранний массовый рынок, потому что эта аудитория быстро создаёт и меняет интернет-проекты, но часто не имеет отдельного постоянного внешнего security-control слоя.

> **Создал → Опубликовал → Проверил → Исправил → Перепроверил → Контролируй изменения.**

> **Creator/Vibe Coding — beachhead. Agency/SMB/EASM — путь масштабирования.**

## Data and verification prerequisites

Creator/referral attribution is also planning-only: it needs a separate ownership/sensitivity/consent/retention review before persistence. Campaign or Telegram identifiers never replace Guest-session identity or confer ownership/verification/scan authority; no generic ChangeEvent or AuditLog is added.

Future channel tests must reject target/profile/template injection, chat/referral identity substitution, replay quota bypass, token-bearing deep links and hidden Guest data disclosure. Deployment-triggered recheck requires fresh server-derived authorization; campaign analytics require privacy/consent review and must omit scan tokens, credentials and raw evidence. No outreach or data collection is performed by a documentation sync.
