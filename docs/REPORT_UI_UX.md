# Reports UI/UX

Status: proposed post-B2 design/tests; no runtime or release evidence. [Reporting scope and prerequisites](REPORTING.md) and accepted ADRs govern this document.

## 1. Цель

Интерфейс Reports должен отвечать на два разных вопроса:

1. что OUTSCAN зафиксировал в конкретный момент;
2. что известно системе сейчас.

Historical report нельзя превращать в живой dashboard, который незаметно меняет прошлое.

## 2. Раздел Reports

Рекомендуемый список:

```text
Reports

11 Sep 2026   company.ru   Score 74   Ready
04 Sep 2026   company.ru   Score 80   Ready
28 Aug 2026   company.ru   Score 82   Ready
```

Поля:

- дата/время;
- primary target;
- scan type;
- score;
- delta относительно предыдущего report;
- Critical/High count;
- статус generation;
- actions.

## 3. Статусы генерации

Показывать явно:

- Готовится;
- Готов;
- Частичная ошибка artifacts, если модель допускает;
- Ошибка формирования.

Не показывать `Ready`, пока пользователь фактически не может открыть canonical report view.

## 4. Экран historical report

Структура:

```text
Report header
Executive summary
Priority actions
Changes
Findings
Resolved since previous
Coverage
Limitations
Downloads
```

## 5. Snapshot versus Current

Если finding изменился после report:

```text
OUT-FND-...
В отчете: OPEN
Сейчас: RESOLVED
Перепроверено 12 Sep 2026
```

Если current state неизвестен, не показывать inferred state.

## 6. Download menu

V1:

```text
Скачать

PDF
Markdown - русский
Markdown - English
Для AI / Codex / Claude
JSON
Полный пакет ZIP
```

AI export должен иметь короткое пояснение:

`Технический файл для передачи в coding assistant. Данные evidence обрабатываются как недоверенные.`

Не перегружать меню названиями внутренних schema versions.

## 7. AI Handoff action

Основной label:

`Скачать для AI`

Дополнительное описание:

`Codex / Claude / ChatGPT`

Если позднее появятся direct integrations, не смешивать действия:

- `Скачать для AI`;
- `Открыть в ...`.

Пользователь должен понимать, происходит ли передача данных внешнему сервису.

## 8. Executive summary

На экране и в PDF одинаковая смысловая иерархия:

- Security Score;
- delta;
- Critical/High;
- главное изменение;
- что исправить первым;
- что подтвержденно исправлено.

Не строить UI вокруг общего количества всех замечаний.

## 9. Priority actions

Показывать ограниченный список действительно важных действий.

Например:

```text
1. OUT-FND-...
   Confirmed High
   api.company.ru
   Обновить компонент

2. NEW ASSET
   dev.company.ru
   Определить принадлежность
```

Action Center может быть отдельным продуктовым модулем; Reports только отражает состояние на дату.

## 10. Finding row/card

Минимум:

- stable Finding ID;
- title;
- asset;
- severity;
- confidence;
- lifecycle status;
- first seen;
- current state indicator в historical view;
- remediation CTA/recheck, если разрешено текущему пользователю.

## 11. Confidence language

RU labels:

- Потенциальный;
- Вероятный;
- Подтвержденный.

Не заменять их эмоциональными labels вроде `опасно` без контекста.

## 12. Lifecycle language

UI должен различать:

- обнаружено;
- принято в работу;
- заявлено исправленным;
- перепроверяется;
- подтвержденно устранено;
- риск принят;
- false positive, если поддерживается.

`Заявлено исправленным` не визуализировать как зеленое `Исправлено`.

## 13. Coverage

Coverage должен быть заметным, но не доминировать над summary.

Пример:

```text
Покрытие проверки

Domain Security          Выполнено
TLS / HTTPS              Выполнено
Vulnerability Detection  Выполнено
Authenticated App Scan   Не выполнялось
```

Статус `Не выполнялось` не считать ошибкой, если capability не входила в scope/entitlement.

## 14. Limitations

Отдельный блок без мелкого серого disclaimer-текста.

Пример:

```text
Ограничения проверки

- authenticated area не проверялась;
- один актив не отвечал;
- версия технологии определена с недостаточной уверенностью.
```

## 15. PDF preview

Не обязательно строить полноценный WYSIWYG preview в V1.

Достаточно:

- показать report content в Workspace;
- кнопка PDF download;
- preview позже, если появляется реальная потребность.

## 16. Empty states

Нет previous report:

`Это первый отчет. Динамика появится после следующего сканирования.`

Нет Critical/High:

`В рамках выполненной проверки критические и высокие findings не обнаружены.`

Не писать:

`Уязвимостей нет.`

## 17. Failed artifact

Если PDF не построился, а report доступен:

```text
Отчет готов
PDF временно недоступен
[Повторить создание PDF]
```

Не скрывать весь report из-за ошибки одного renderer-а.

## 18. Permissions

UI скрывает недоступные actions для удобства, но authorization всегда проверяется server-side.

Роли и permissions переиспользовать из текущей модели OUTSCAN.

Не вводить отдельную роль `report admin`, если нет продуктовой необходимости.

## 19. Mobile

На мобильном executive summary и priority findings должны быть доступны без horizontal scroll.

Большие technical tables преобразовывать в stacked rows или адаптивное представление.

PDF оптимизируется под документ, а не под mobile viewport.

## 20. Accessibility

Severity/confidence/status не обозначать только цветом.

Поддержать:

- текстовые labels;
- keyboard navigation;
- focus states;
- semantic headings;
- readable contrast;
- table headers;
- downloadable file labels с format/language.

## 21. Localization

Language selector artifact-а не изменяет current Workspace locale автоматически.

Пользователь может работать в RU UI и скачать EN Markdown.

## 22. Report generation action

Если reports создаются автоматически после scan, UI не должен заставлять пользователя вручную "создать отчет" каждый раз.

Manual regeneration допустим для artifact renderer-а, но не должен создавать новый factual snapshot того же scan без явной причины.

## 23. Naming

Рекомендуемые пользовательские термины:

- `Отчет`;
- `История отчетов`;
- `Скачать`;
- `Для AI`;
- `Покрытие проверки`;
- `Ограничения проверки`;
- `Исправлено и перепроверено`.

Избегать внутренних названий:

- renderer;
- projection;
- snapshot schema;
- artifact job.

Они остаются техническими понятиями.

## 24. Future

Позднее:

- scheduled monthly reports;
- email delivery;
- share-link;
- White Label;
- compare two reports;
- Agency batch export;
- report comments/approvals.

## 25. Done criteria

UI готов, если пользователь может найти historical report, понять состояние на дату, увидеть отличие от current state и безопасно скачать каждый доступный формат без смешения snapshot и live data.
