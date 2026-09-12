# Synchronization guardrail

Implementation instructions below describe future work only; no apps/game, route, analytics or deployment is authorized by this document. Publication remains subject to CLAIM_INVENTORY.md and UX_ACCEPTANCE.md.

Status: documentation-only planned promo surface. This file does not authorize runtime implementation, scanner access, Guest/Workspace route changes, promotion verification bypass, or any B1/B2/C gate advancement. Before implementation, reconcile it again with current repository architecture and security policy.

# Gameplay State Machine

## Принцип

Game Engine должен быть детерминированной state machine. UI отправляет команды, engine валидирует переход, рассчитывает последствия и возвращает новое состояние.

Нельзя хранить бизнес-правила в обработчиках кнопок Astro-компонентов.

## Core state

```ts
type GameDay = 0 | 1 | 2 | 3;
type TeamCapacity = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type GameState = {
  version: 1;
  status: "INTRO" | "ACTIVE" | "FINISHED";
  day: GameDay;
  capacity: TeamCapacity;
  discoveredAssets: string[];
  decisions: Record<string, string>;
  rechecks: Record<string, boolean>;
  business: {
    storefront: "UP" | "DEGRADED" | "DOWN";
    orders: "UP" | "DOWN";
    campaign: "PENDING" | "LIVE" | "DELAYED";
    previewWorkflow: "UP" | "DOWN";
  };
  monitoringEnabled: boolean;
  saleAssetMonitoringEnabled: boolean;
  snapshotSaved: boolean;
  changeReviewed: boolean;
};
```

Использовать enum/union IDs, не свободные строки, в реальной реализации.

## Commands

```text
START_GAME
RUN_DISCOVERY
CHOOSE_DECISION
RUN_RECHECK
ADVANCE_DAY
SAVE_SNAPSHOT
ENABLE_MONITORING
REVIEW_CHANGE
ADD_NEW_ASSET_TO_MONITORING
FINISH_GAME
RESET_GAME
```

Каждая команда:

- валидируется против текущего state;
- идемпотентна там, где повтор безопасен;
- не должна повторно списывать capacity;
- не должна повторно начислять score;
- должна иметь unit test на запрещенный переход.

## Progression

```text
INTRO
 ↓ START_GAME
DAY_1_DISCOVERY
 ↓
DAY_1_TASKS
 ↓ eligible
DAY_2_QUEUE
 ↓
DAY_2_TASKS
 ↓ eligible
DAY_2_SNAPSHOT
 ↓
DAY_3_CHANGE
 ↓
DAY_3_TASK
 ↓
FINISHED
```

## Capacity rules

Начало: 6.

Списание происходит ровно один раз при подтвержденном изменении.

Если capacity недостаточно:

- destructive/paid action запрещается;
- UI показывает стоимость и остаток;
- бесплатные observe/recheck/planning действия остаются доступны;
- игрок всегда может завершить миссию через safe fallback.

## Recheck

После remediation задача получает внутренний статус `CHANGE_APPLIED_AWAITING_RECHECK`.

Только `RUN_RECHECK` переводит ее в `VERIFIED` при соответствующем сценарии.

Нельзя начислять recheck points за повторный recheck той же версии состояния.

## Known time condition

Если certificate renewal не выполнен до перехода в Day 3:

```text
orders/storefront → disrupted outcome according to scenario
```

Это детерминированное последствие заранее известного срока.

## Wrong-but-valid choices

Неверное решение не блокирует игру.

Примеры:

- выключить preview;
- выключить API;
- потратить 2 units на неподтвержденный component upgrade;
- сделать hardening слишком рано.

Engine фиксирует последствия, но дает пройти дальше.

## Score calculation

Scoring является чистой функцией:

```ts
calculateScore(state): ScoreBreakdown
```

Она не изменяет state и не доверяет сохраненному `totalScore`.

Score вычисляется из фактов:

- discovery completed;
- конкретные decision IDs;
- recheck facts;
- business state;
- monitoring/change facts.

## Ending calculation

Отдельная чистая функция:

```ts
calculateEnding(state, score): Ending
```

Приоритет:

1. `STORE_DISRUPTED` при нарушении обязательной работы магазина;
2. `LAUNCH_DELAYED` при campaign=DELAYED;
3. `PERIMETER_MONITORED` только при всех обязательных success conditions;
4. иначе `CONTROL_INCOMPLETE`.

Так score не может скрыть критическое нарушение бизнес-функции.

## Persistence

В localStorage/session storage сохранять только:

- schema version;
- game state;
- timestamp;
- optional anonymous analytics correlation ID при наличии consent/policy.

Не сохранять email, реальный домен, IP, fingerprint.

При неизвестной версии state: безопасно предложить начать новую игру.
