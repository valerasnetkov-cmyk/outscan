# Risk Engine

## Objective

OUTSCAN Risk должен отвечать на вопрос **«насколько важно исправить это для данного актива сейчас?»**, а не копировать severity внешнего scanner.

## Inputs V1

- scanner/finding base severity;
- CVSS when applicable;
- EPSS;
- CISA KEV;
- confidence: Potential / Probable / Confirmed;
- internet exposure;
- asset business criticality;
- recency/recurrence context;
- change context when a finding or exposure is new, reopened, or associated with a meaningful posture regression.

## Initial model

Не фиксировать формулу как неизменяемую бизнес-истину. Она должна иметь `model_version` и проходить калибровку.

Первый heuristic может использовать нормализованные компоненты:

```text
base severity      0..100
exploitability     0..100
threat context     0..100
exposure           0..100
confidence         0..100
criticality        0..100
```

Пример начального веса:

```text
0.35 * base severity
0.20 * exploitability
0.15 * threat context
0.10 * exposure
0.10 * confidence
0.10 * criticality
```

Это стартовая гипотеза, не production-calibrated formula.

## Deterministic boosts / floors

Допускаются понятные правила, например:

- `KEV + Confirmed + Public exposure` не может получить Low/Medium;
- `Potential` без подтверждения не должен автоматически превращаться в Critical только из-за высокого CVSS;
- отсутствие CVSS не означает отсутствие риска для misconfiguration/exposure findings.

Все rules должны быть покрыты unit tests.

## Bands

Пример:

- 0-24 Low
- 25-49 Medium
- 50-74 High
- 75-100 Critical

Пороговые значения подлежат калибровке до production.

## Change significance

Not every change is a vulnerability. Change Intelligence has its own significance logic.

Examples with higher significance:

- new public asset;
- DMARC `reject/quarantine -> none`;
- RPKI `Valid -> Invalid`;
- disappearance of previously detected WAF/CDN where relevant;
- newly exposed public service;
- finding `FIXED -> REOPENED`.

Change significance may trigger an alert or Risk Engine re-evaluation. It must remain explainable and versioned.

## Security Score

Workspace Security Score агрегирует состояние verified monitored assets.

Требования:

- объяснимость;
- model version;
- score change event;
- не скрывать Critical finding высоким средним score;
- new/unknown asset exposure учитывается отдельно;
- accepted risk не должен исчезать из истории.

## Guest baseline posture

Guest result использует **Baseline posture**, а не полноценный Security Score.

Он оценивает только доступный public configuration subset и не должен визуально создавать впечатление полного security assessment.

## Explainability

Для каждого score/risk UI должен уметь ответить:

- какие факторы дали основной вклад;
- что изменит score;
- что подтверждено, а что только предполагается;
- какие внешние intelligence sources использованы и когда обновлены.
