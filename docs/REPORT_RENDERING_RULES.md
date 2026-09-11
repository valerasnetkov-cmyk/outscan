# Shared Report Rendering Rules

These rules apply across human-readable and machine-oriented Reporting V1 renderers.

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