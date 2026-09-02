# UI / UX direction

## Art direction

OUTSCAN - спокойный, строгий, data-first security product.

Основной язык интерфейса:

```text
TEXT + NUMBER + STATUS + LINE + TABLE
```

## Не использовать

- decorative shields/locks/hackers;
- neon cyberpunk;
- random gradients/glows;
- glassmorphism;
- bento ради bento;
- каждую строку данных в отдельной card;
- emoji как product icons;
- marketing fear language.

## Public first screen

Минимум элементов:

- OUTSCAN;
- короткое позиционирование;
- domain input;
- `Проверить`;
- `Без регистрации`;
- вход для существующих пользователей.

## Guest result

Приоритет:

1. target/domain;
2. `Базовая проверка завершена`;
3. основные posture sections;
4. `N дополнительных потенциальных рисков`;
5. CTA verification.

Suggested sections:

### Инфраструктура

- IP;
- ASN/provider;
- BGP/RPKI;
- IPv6;
- HTTP protocol;
- TLS;
- CDN/WAF.

### Домен

- registrar;
- created;
- expires;
- nameservers;
- DNSSEC;
- CAA.

### Почта

- MX/provider;
- SPF;
- DMARC;
- MTA-STS;
- TLS-RPT.

### Сертификат

- issuer;
- expires;
- key summary;
- HSTS;
- CT aggregate.

Do not expose discovered subdomains before verification.

Не использовать A-F grade как основной продуктовый signal. Guest использует `Baseline posture`, verified workspace использует `OUTSCAN Security Score`.

## Two-layer information model

Конкурентный анализ подтверждает необходимость разделять presentation для бизнеса и технические детали.

### Business summary

Показывает:

- что произошло;
- насколько это важно;
- что сделать;
- изменилось ли состояние;
- подтвержден ли риск.

### Technical drill-down

Показывает по запросу:

- source/scanner;
- CVE/CVSS/EPSS/KEV;
- affected asset;
- sanitized evidence;
- technical remediation context.

Не заставлять нетехнического пользователя читать scanner output, чтобы понять priority.

## Change Intelligence UI

Изменения являются отдельным пользовательским сценарием, а не второстепенным audit log.

Примеры:

- `IP изменился`;
- `DMARC: reject -> none`;
- `CDN/WAF больше не обнаруживается`;
- `обнаружен новый asset`;
- `certificate issuer изменился`;
- `finding reopened`.

Для каждого значимого изменения показывать: `что было -> что стало -> когда -> почему важно`.

## Workspace dashboard

Пользователь за несколько секунд должен понять:

- Security Score;
- Critical/High count;
- что требует внимания;
- какие assets изменились;
- что появилось с прошлого scan;
- что исправить первым.

## Navigation V1

- Обзор
- Активы
- Риски / Findings
- Уязвимости
- Мониторинг
- Отчеты
- Организация
- Тариф
- Настройки

Проверить на этапе UI прототипа, нужны ли одновременно `Риски` и `Уязвимости`; не допускать дублирования mental model.

## Platform Admin

Admin UI может быть плотнее customer workspace, но сохраняет ту же typographic system.

Не смешивать client navigation и platform operations.

## Accessibility

- keyboard navigation;
- visible focus;
- semantic tables/headings;
- severity никогда не передавать только цветом;
- sufficient contrast;
- status text всегда присутствует рядом с color indicator.
