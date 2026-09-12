# Shared Report Rendering Rules

Status: proposed post-B2 design/tests; no runtime or release evidence. [Reporting scope and prerequisites](REPORTING.md) and accepted ADRs govern this document.

These rules apply across human-readable and machine-oriented Reporting V1 renderers.

## 12. Severity rendering

Не полагаться только на цвет.

Использовать text labels:

- CRITICAL;
- HIGH;
- MEDIUM;
- LOW;
- INFO, только если это уже каноническая категория проекта.

## 13. Confidence rendering

Preserve the canonical confidence type/value and provenance in JSON and every renderer. Editorial potential/probable/confirmed labels are not machine states or an accepted threshold mapping. Labels may be translated only without changing uncertainty or implying confirmation; future mappings require explicit domain acceptance and parity tests.

## 14. Findings ordering

Ordering должен быть deterministic.

Рекомендуемый порядок:

1. risk priority;
2. severity;
3. confidence;
4. asset criticality;
5. stable finding ID.

Не менять идентичность finding при смене сортировки.

## 15. Resolved section

Отдельно показывать только канонически подтверждённые устранения. Automatic RESOLVED remains disabled until ADR-0013 compatible-coverage policy and negative tests exist; the following future display example grants no transition authority.

Пример:

```text
OUT-FND-...
DMARC policy
Reported fixed: 2026-09-08
OUTSCAN rechecked: 2026-09-08
Result: RESOLVED
```

Это важный элемент ценности продукта: отчет показывает прогресс, а не только количество проблем.

## 16. Accepted risk

Если проект поддерживает `ACCEPTED_RISK`, отчет обязан отличать его от `RESOLVED`.

Принятый риск означает управленческое решение, а не доказательство устранения проблемы.

## 17. False positive

Если существует `FALSE_POSITIVE`, historical report может показывать:

- что finding был в snapshot;
- что позднее классификация изменена;
- текущую метку отдельно.

Не переписывать исходный snapshot.

## 18. Coverage and limitations

В каждом human-readable формате должен быть отдельный видимый раздел.

Пример:

```text
Проверено
- DNS Security
- TLS / HTTPS
- Email Security
- Vulnerability Detection

Не выполнялось
- Authenticated application scan

Ограничения
- один обнаруженный актив не отвечал во время проверки
```

## 19. Localization rules

Не локализовать технические identifiers.

Не переводить vendor/product names.

Не изменять содержание remediation при переводе.

Если локализация отсутствует, использовать controlled fallback и явно тестировать его, а не генерировать текст внешним AI без deterministic review.

## 20. References

References должны быть deduplicated и безопасно rendered.

Разрешать только поддерживаемые URL schemes, как минимум `https`.

Не превращать произвольный scanner text в clickable link.

## 21. Output size limits

Нужны разумные лимиты:

- максимальное число findings в одном synchronous preview;
- максимальный размер evidence item;
- максимальный размер Markdown/JSON artifact;
- PDF generation timeout;
- bundle size.

Большой отчет формировать асинхронно через существующую queue infrastructure.

## 22. Renderer parity tests

Для одного fixture автоматически сравнивать:

- report ID;
- scan ID;
- finding IDs;
- finding counts;
- severity/confidence/status;
- score;
- coverage;
- limitations.

Текст и layout могут отличаться, факты - нет.

## 23. Future formats

После V1 можно добавить:

- SARIF;
- API push/delivery;
- signed share-link;
- scheduled report delivery;
- White Label PDF;
- customer-specific templates.

Они также должны строиться только из canonical snapshot.

## 24. Definition of Done

Форматы готовы, когда пользователь может скачать все V1 artifacts для одного report_id, а автоматические parity tests доказывают, что каждый renderer отражает один и тот же snapshot без factual divergence.
