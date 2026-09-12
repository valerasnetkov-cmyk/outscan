# AI-era business assumptions and metrics

Status: planning companion to [AI-era strategy](AI_ERA_PRODUCT_STRATEGY.md); no approved pricing, claims, telemetry or deployment. Existing gates and [Creator GTM](CREATOR_VIBE_CODING_GTM.md) apply.

## 23. Влияние на коммерческую модель

В AI-era количество сотрудников может уменьшаться, но количество assets, deployments, APIs, integrations, changes и external dependencies может расти.
Поэтому asset-based модель OUTSCAN устойчивее чистой seat-based модели.
Каноническая единица ценности:

> **контролируемый цифровой актив и его изменения во времени.**

## 24. Тарифная логика

Ниже приведена стратегическая модель ценности, а не опубликованный прайс, entitlement contract или обещание текущей доступности функций.

| Тариф      | Основная ценность в AI-era                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------- |
| Free       | Разовая безопасная диагностика                                                                  |
| Starter    | Небольшое число активов + scheduled monitoring                                                  |
| Business   | Change Intelligence, daily monitoring, Emerging CVE, уведомления, remediation, history, reports |
| Agency/MSP | Десятки и сотни клиентских активов, API, White Label, AI Handoff                                |
| Enterprise | Event-driven monitoring, CI/CD integrations, private scanner, advanced API, custom policies     |

Отдельный «AI-тариф» не нужен. Возможна отдельная self-service упаковка `Creator` как коммерческий эксперимент для раннего сегмента, но не как новый security mode: её цена, лимиты и название требуют проверки unit economics и никогда не меняют verification/authorization/scanner policy. Предварительный тестовый диапазон `490–990 ₽/мес.` является гипотезой, а не опубликованным прайсом.

## 25. Формирование moat

Scanner сам по себе не является долгосрочным конкурентным преимуществом.
Moat OUTSCAN должен формироваться из:

```text
Asset History
+ Change History
+ Finding Lifecycle
+ Threat Intelligence correlation
+ Risk prioritization
+ Remediation history
+ Recheck evidence
+ Organization context
```

Чем дольше организация использует OUTSCAN, тем выше ценность накопленного исторического слоя.

## 26. Долгосрочная траектория

AI-era не меняет выбранную стратегию:

```text
External Monitoring
→ EASM
→ AppSec / API Security
→ Supply Chain
→ Cloud / Internal Exposure
→ Asset Graph
→ Attack Paths
→ Exposure Management / CTEM
```

Он делает её более актуальной.

## 27. OUTSCAN и OUTLYRA

```text
OUTSCAN  → RU realm     → outscan.ru
OUTLYRA  → GLOBAL realm → outlyra.net
```

Общими могут быть product core, security core, capability model, scanner abstractions и AI-era strategy.
Независимыми остаются deployments, data residency, legal policies, providers и integrations.

## 28. Ключевые продуктовые метрики

Не ограничиваться количеством scans.
Приоритетные метрики:

- Assets monitored;
- New assets detected;
- Meaningful changes detected;
- Critical/High findings;
- Reopened findings;
- Verified remediations;
- Mean Time To Remediate;
- Change-to-Detection Time;
- Deploy-to-Recheck Time;
- Emerging CVE match rate;
- Monitoring retention;
- Creator campaign CAC/payback;
- Guest -> registration -> verification -> Monitoring -> paid conversion;
- Creator/Starter -> Agency upgrade rate.
  Особенно важная будущая метрика:

> **Change-to-Detection Time = время от реального изменения до его обнаружения OUTSCAN.**
