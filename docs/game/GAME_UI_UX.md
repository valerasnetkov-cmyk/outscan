# Synchronization guardrail

Implementation instructions below describe future work only; no apps/game, route, analytics or deployment is authorized by this document. Publication remains subject to CLAIM_INVENTORY.md and UX_ACCEPTANCE.md.

Status: documentation-only planned promo surface. This file does not authorize runtime implementation, scanner access, Guest/Workspace route changes, promotion verification bypass, or any B1/B2/C gate advancement. Before implementation, reconcile it again with current repository architecture and security policy.

# Game UI / UX Direction

## Art direction

OUTSCAN: Периметр — **операционный стол управления внешним периметром**, а не «хакерская игра».

Характер:

- спокойный;
- точный;
- технологичный;
- B2B;
- живее основного Workspace, но без геймерского китча.

Бренд:

- графитовый `#1A1D21` как базовый темный цвет;
- оранжевый `#FF6A00` как ограниченный accent/action/change color;
- светлые нейтральные поверхности;
- без градиентов, неона, glow, glassmorphism.

Не использовать:

- щиты/замки/капюшоны;
- зеленый terminal aesthetic;
- глобус/радар;
- cyberpunk;
- декоративные сетки данных;
- бесконечные rounded cards;
- bento-layout ради bento-layout.

## Signature UI decisions

### 1. Perimeter Map

Desktop: центральная 2D схема активов с ясными линиями связи и изменениями состояния.

Это не force-directed graph. Координаты сценария детерминированы, чтобы композиция была стабильной.

Новый актив появляется как конкретное изменение схемы, а не как красная угроза.

### 2. Operational Rail

Справа: очередь задач и контекст выбранного актива.

Не превращать каждую мелочь в карточку. Использовать строки, разделители, статусы, типографическую иерархию.

## Layout desktop

```text
┌──────────────────────────────────────────────────────────┐
│ OUTSCAN: ПЕРИМЕТР      День 2/3       Команда 4/6       │
├───────────────────────────────────┬──────────────────────┤
│                                   │                      │
│        PERIMETER MAP              │  TASK / CONTEXT      │
│                                   │                      │
│                                   │  decision actions    │
│                                   │                      │
├───────────────────────────────────┴──────────────────────┤
│ Event timeline / consequence feedback                    │
└──────────────────────────────────────────────────────────┘
```

## Mobile

На <= 720px граф преобразуется в последовательный список активов и текущую задачу.

Запрещено требовать:

- hover;
- drag-and-drop;
- точного попадания в маленькие nodes;
- горизонтального скролла для принятия решения.

Порядок:

```text
status bar
current event
selected asset
context
choices
compact perimeter list
```

## Typography

- один основной grotesk из существующей brand system или system-safe fallback;
- display headline с контролируемыми переносами;
- status/data может использовать tabular numerals;
- uppercase только для коротких operational labels;
- избегать микро-текста <14px для содержательных элементов.

## Components

Минимальный набор:

- `GameHeader`
- `PerimeterMap`
- `AssetNode`
- `TaskRail`
- `DecisionList`
- `DecisionButton`
- `CapacityMeter`
- `StatusLabel`
- `EventToast` / `EventLog`
- `RecheckAction`
- `DayTransition`
- `ResultSummary`
- `ShareCard`

Не создавать отдельный компонент для каждого абзаца.

## Motion

Motion объясняет причинность:

- discovery: node появляется + связь прорисовывается;
- remediation: status transitions;
- recheck: короткая проверка состояния;
- day transition: смена временного контекста;
- new asset: map diff;
- capacity: точное уменьшение на подтвержденную стоимость.

Ориентиры:

- 140–220 ms micro-interaction;
- 300–500 ms structural transition;
- никаких perpetual animations;
- `prefers-reduced-motion: reduce` выключает необязательное движение.

## Decision UX

Каждое решение показывает до подтверждения:

- действие;
- стоимость команды;
- известное бизнес-последствие, если оно предсказуемо.

Пример:

```text
Отключить весь API                    1 единица
Оформление новых заказов остановится
```

Нельзя скрывать последствие и затем «наказывать» игрока.

## Status language

Использовать:

- Не проверено
- Обнаружено
- Требует внимания
- Изменение выполнено
- Нужна повторная проверка
- Проверено
- Под наблюдением
- Новый ресурс

Не использовать:

- 100% защищено;
- безопасно навсегда;
- взлом предотвращен;
- риск устранен до recheck.

## Accessibility

Цель: WCAG 2.2 AA.

- все действия keyboard reachable;
- visible focus;
- status не передается одним цветом;
- asset graph имеет эквивалентную semantic list representation;
- live region только для важных событий, без спама;
- min touch target 44x44;
- contrast AA;
- screen-reader labels для icon-only controls;
- dialogs корректно trap/return focus только если реально modal.

## Result screen

Сначала outcome, потом score.

Пример:

```text
ПЕРИМЕТР ПОД НАБЛЮДЕНИЕМ
1000 игровых очков

5/5 приоритетных задач подтверждены
Магазин работает
Кампания запущена
Новый ресурс добавлен в наблюдение
```

Ниже: `Что получилось`, `Что улучшить`, CTA OUTSCAN.
