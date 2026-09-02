# AGENTS.md - правила Codex для OUTSCAN

Этот файл является главным repository-level контрактом для AI-агентов и разработчиков.

## 1. Перед началом любой задачи

Обязательно прочитать:

1. `README.md`.
2. `plan.md`.
3. `CHANGELOG.md`.
4. Соответствующие файлы `/docs`.
5. Последний `docs/audit-YYYY-MM-DD.md`, если задача затрагивает архитектуру, безопасность, БД, сканирование или deployment.

Сначала изучить существующую реализацию. Не заменять текущие решения шаблонными только потому, что другое решение привычнее агенту.

## 2. Основной принцип разработки

OUTSCAN - security-sensitive internet-facing SaaS. Любое изменение оценивается по двум критериям одновременно:

- выполняет ли оно продуктовую задачу;
- не нарушает ли security invariants.

Security является release gate, а не финальной проверкой.

## 3. Обязательные архитектурные правила

- Базовая доменная сущность: `Asset`, не `Website`.
- Результаты любых scanners нормализуются в единый `Finding`.
- Scanner integration реализуется через узкий `ScannerAdapter`/contract, а не через вызовы CLI из route/controller.
- UI, API, domain logic, persistence, integrations и transformations разделяются.
- Route/controller/page файлы только оркестрируют, детальная логика выносится в модули.
- Не создавать generic `utils.ts` для несвязанных функций.
- Не вводить микросервис без доказанной необходимости.
- Сначала модульный монолит + отдельно изолированные scanner workers.
- Не создавать циклические зависимости между modules/packages.

## 4. Лимит размера файлов

Авторские source-файлы должны быть не более **400 физических строк**.

Исключения: generated files, lockfiles, vendored content и атомарные migrations.

Если безопасное разделение невозможно в текущей задаче, нарушение фиксируется в `plan.md` с путем файла и предложенной границей разделения.

Не сокращать форматирование и комментарии искусственно ради лимита.

## 5. Product differentiation guardrails

При реализации не сводить OUTSCAN к `scanner + dashboard`.

Обязательные направления:

- полезный Guest Network & Domain Posture;
- Change Intelligence как first-class capability;
- Asset Relations с provenance/confidence для будущего Asset Graph;
- собственный Risk Engine поверх scanner + Threat Intelligence;
- business summary + technical drill-down;
- Agency/MSP только через delegated access между отдельными Organization tenants;
- monitored-asset billing без credits за обычные повторные scans.

Перед существенным product/UI/data изменением читать `docs/COMPETITIVE_ANALYSIS.md`.

Не копировать A-F grade как основной security model и не делать scanner-selection центральным пользовательским workflow.

## 6. Security invariants

### Tenant isolation

Organization A не может читать, перечислять, изменять или удалять данные Organization B.

Для защищенных объектов проверять:

- authenticated user;
- organization membership;
- role;
- object ownership / tenant id;
- entitlement при необходимости.

### Guest scan

До подтверждения владения разрешены только safe/passive checks из `docs/SCANNING_POLICY.md`.

Запрещено в guest mode:

- port scanning;
- Naabu;
- Nuclei active vulnerability templates;
- Katana deep crawl;
- ZAP active scan;
- fuzzing;
- brute force;
- exploitation;
- authenticated scan;
- intrusive API testing.

### Target validation / SSRF

Любой user-controlled target:

- canonicalize;
- resolve DNS;
- reject localhost/private/link-local/metadata ranges;
- re-resolve/re-check после каждого redirect;
- применять timeout, redirect limit, response-size limit и request budget;
- fail closed при неоднозначной destination validation.

### Scanner workers

Worker не получает:

- production DB credentials;
- unrestricted Redis/admin credentials;
- internal API master token;
- cloud metadata access;
- доступ к private application network.

Worker должен быть disposable, resource-limited и иметь минимальный job payload.

### Admin

Admin authorization только server-side. Platform routes должны иметь отдельный policy boundary. Любой support/break-glass access журналируется.

### Secrets

Никогда не:

- коммитить реальные `.env` значения;
- печатать tokens/keys/passwords в логи;
- помещать секреты в changelog/audit;
- возвращать secrets в client bundle;
- сохранять лишние scanner credentials в evidence.

## 7. Scanning policy

Перед изменением scanner pipeline прочитать `docs/SCANNING_POLICY.md`.

Категории checks:

- `SAFE` - разрешено автоматически в соответствующем контексте;
- `CONTROLLED` - только verified assets;
- `ACTIVE` - verified asset + явный opt-in;
- `DISABLED` - не запускать в SaaS.

Не считать severity Nuclei финальным OUTSCAN risk. Все результаты проходят normalization + Risk Engine.

## 8. Threat Intelligence

Источники внешних данных считаются недоверенными input.

- Валидировать schema.
- Хранить source/provenance и timestamps.
- Поддерживать incremental sync.
- Не обновлять production scanners/templates напрямую из runtime job.
- Новые versions/templates: staging -> tests -> canary -> approve -> production.

## 9. Tests обязательны

Для security-sensitive feature happy path недостаточен.

Минимальные negative tests при релевантности:

- anonymous access rejected;
- user A cannot access user B / tenant B object;
- non-admin admin action rejected;
- unverified domain cannot request active scan;
- private/link-local/metadata target rejected;
- redirect to forbidden address rejected;
- malformed/oversized input rejected;
- duplicate/replayed request preserves idempotency;
- secrets absent from responses/logs;
- scanner timeout/resource limit handled safely.

## 10. Проверки перед завершением задачи

Запустить доступные проверки в таком порядке:

1. Targeted tests.
2. Lint/format.
3. Typecheck.
4. Unit/integration tests.
5. Security negative tests.
6. Production build.
7. Source file line-count check.
8. Diff review: secrets, debug code, accidental dependencies, stale docs.

Нельзя писать `готово`, если обязательная проверка не запускалась. Нужно явно указать, что не было проверено и почему.

## 11. Living documentation

В том же change:

- обновить `CHANGELOG.md`;
- обновить `plan.md`;
- обновить durable docs;
- создать/обновить `docs/audit-YYYY-MM-DD.md` при существенной работе.

Changelog не должен содержать эксплуатационные инструкции или секреты.

## 12. Dependency policy

Перед добавлением dependency:

- объяснить необходимость;
- предпочитать maintained package;
- не добавлять библиотеку ради нескольких строк security-sensitive logic;
- проверить permissions/execution surface;
- проверить lockfile delta;
- фиксировать значимые dependency changes в changelog.

## 13. UI правила

OUTSCAN использует строгий минимализм:

- без decorative cyber imagery;
- без glassmorphism;
- без необязательных gradients/glows;
- минимум cardization;
- акцент на typography, whitespace, lines, tables, status;
- статусный цвет только по смыслу;
- не копировать внешний вид типового SaaS dashboard kit.

Основные UI primitives: `TEXT + NUMBER + STATUS + LINE + TABLE`.

## 14. Запрещенные заявления продукта

Не писать в UI/маркетинге:

- `100% secure`;
- `сайт безопасен`;
- `защищено от взлома`;
- `гарантированная защита`;
- `полный автоматический пентест`.

Использовать: `обнаружен риск`, `требует внимания`, `потенциальный риск`, `подтвержденный риск`, `мониторинг активен`.

## 15. Git и scope

- Не менять несвязанные файлы.
- Не делать broad rewrite без необходимости.
- Маленькие законченные изменения предпочтительнее больших пачек.
- Не force-push и не удалять историю без явного указания владельца.
- Не выполнять production deploy без отдельного запроса.

## 16. Definition of Done

Задача завершена только если:

- поведение реализовано;
- security invariants сохранены;
- есть релевантные tests;
- проверки выполнены;
- docs синхронизированы;
- changelog обновлен;
- plan обновлен;
- аудит обновлен при существенном изменении;
- remaining risks явно записаны.
