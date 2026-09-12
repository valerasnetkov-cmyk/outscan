# Synchronization guardrail

Implementation instructions below describe future work only; no apps/game, route, analytics or deployment is authorized by this document. Publication remains subject to CLAIM_INVENTORY.md and UX_ACCEPTANCE.md.

Status: documentation-only planned promo surface. This file does not authorize runtime implementation, scanner access, Guest/Workspace route changes, promotion verification bypass, or any B1/B2/C gate advancement. Before implementation, reconcile it again with current repository architecture and security policy.

# Astro Architecture — apps/game

## Решение

Создать отдельный Astro app в существующем pnpm monorepo:

```text
apps/game
```

Не переносить основной OUTSCAN на Astro и не встраивать игру внутрь `apps/web`.

Причины:

- независимый `game.outscan.ru`;
- минимальный JS shell;
- низкая связанность с SaaS;
- отдельный security/caching/deploy boundary;
- можно выпускать промоигру независимо от Workspace.

## Rendering model

V1 преимущественно static.

- `/` и `/about` — static Astro;
- `/play` — static shell + client island;
- `/result` — предпочтительно client-derived/local state; если маршрут мешает state flow, допустим result section внутри `/play`.

SSR не нужен до появления реального promo redemption endpoint или server-generated share images.

## Game island

Предпочтительно один небольшой framework-free/custom-element island либо минимальный TypeScript controller.

Если сложность DOM/state существенно растет, разрешается один UI framework island, но Codex обязан:

1. проверить, используется ли уже framework в repo;
2. обосновать новую зависимость;
3. не гидратировать всю страницу;
4. сравнить bundle impact.

## Modules

```text
src/game/types/
  game.ts
  scenario.ts

src/game/engine/
  reducer.ts
  commands.ts
  guards.ts
  consequences.ts

src/game/scenarios/
  mission-before-launch.ts
  assets.ts
  tasks.ts

src/game/scoring/
  score.ts
  ending.ts

src/game/persistence/
  storage.ts
  migrations.ts

src/game/analytics/
  events.ts
  adapter.ts
```

Dependency direction:

```text
UI → engine → scenario/types
UI → persistence
UI → analytics adapter
scoring → state/types
```

`engine` не импортирует Astro/DOM/localStorage/analytics.

## Scenario content

Данные миссии должны быть typed content, а не разбросаны по компонентам.

Допустимо:

- TypeScript data module;
- JSON/YAML + schema validation;
- Astro content collection только если это реально облегчает редактуру нескольких миссий.

Для одной миссии не вводить CMS и не создавать преждевременный content platform.

## Styling

```text
src/styles/
  tokens.css
  base.css
  layout.css
  game.css
  components/
```

CSS отдельно. Не использовать Tailwind автоматически. Если текущий repository уже стандартизирован на Tailwind для frontend, Codex должен сначала подтвердить это и только затем решить вопрос.

## Tokens

Определить небольшой набор:

- colors semantic;
- spacing scale;
- typography scale;
- border widths;
- 2–3 radii maximum;
- motion durations/easing;
- content widths;
- z-index layers.

Запрещены десятки one-off CSS magic values без системы.

## Navigation / transitions

Astro поддерживает browser View Transitions и `ClientRouter`, но V1 игры не требует SPA-router.

Использовать native/browser transitions только там, где есть реальная польза. Не подключать ClientRouter только ради «плавности».

Состояние самой игры меняется внутри island/state machine без route navigation.

## Persistence

Storage key:

```text
outscan.game.perimeter.v1
```

State schema versioned.

При parse/schema error:

- не падать;
- удалить только игровой key;
- показать возможность начать заново.

## Analytics

События без PII:

```text
game_started
day_completed
decision_selected
recheck_completed
game_completed
ending_viewed
outscan_cta_clicked
share_clicked
restart_clicked
```

Properties:

- scenario version;
- decision ID;
- day;
- remaining capacity;
- ending;
- score band.

Не отправлять полный local state, hostname пользователя, IP-derived identifiers или тексты произвольного ввода.

Analytics adapter должен быть no-op без настроенного provider/consent policy.

## Share card

V1 предпочтительно:

- deterministic client canvas/SVG export или Web Share text;
- без загрузки PII на сервер;
- отображать только score, ending, mission, URL.

Если server OG image появится позже, параметры должны быть allowlisted и score recalculated/treated as display-only, не entitlement evidence.

## Performance budget

Цели для production mobile:

- минимум client JS;
- initial route без ненужного framework runtime;
- графика SVG/CSS, не canvas engine;
- оптимизированные локальные assets;
- fonts: system stack или один хорошо оптимизированный family subset;
- lazy load того, что не требуется на первом экране.

Измерить Lighthouse/Web Vitals, но не подменять UX одним score.

## Build scripts

`apps/game/package.json` должен иметь как минимум:

```text
dev
build
preview
lint
typecheck
test
```

Root `pnpm build/test/typecheck/lint` уже рекурсивные, поэтому game должен корректно войти в общую verify pipeline.

## Deployment

`game.outscan.ru` отдельный origin/app deployment.

Требования:

- HTTPS only;
- HSTS на production domain по общей политике инфраструктуры;
- CSP;
- frame-ancestors;
- nosniff;
- Referrer-Policy;
- Permissions-Policy;
- cache immutable hashed assets;
- HTML cache policy отдельно;
- source maps не публиковать без осознанного решения.
