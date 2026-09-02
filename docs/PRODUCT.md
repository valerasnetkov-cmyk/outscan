# Product specification

## Positioning

**OUTSCAN - платформа мониторинга внешних киберрисков.**

OUTSCAN показывает, какие цифровые активы организации доступны из интернета, какие риски с ними связаны, что требует внимания и что изменилось со временем.

Главный принцип: не запугивать и не обещать абсолютную безопасность.

## User journey

```text
OUTSCAN.ru
  -> domain input
  -> guest safe scan
  -> baseline public posture + N potential risks
  -> registration
  -> domain verification
  -> verified baseline scan
  -> Security Score / Assets / Findings
  -> continuous monitoring
  -> alerts / reports / remediation / recheck
```

## Layer 1 - Public

Не требует registration/verification.

Цель:

- дать полезный baseline;
- показать ценность продукта;
- не превратить OUTSCAN в reconnaissance proxy по чужой инфраструктуре.

Показываем:

- публичные DNS/domain/network/TLS/mail/HTTP posture параметры;
- статусы `Норма / Требует внимания / Не определено`;
- количество дополнительных потенциальных рисков;
- распределение по high/medium/low только если оно рассчитано из safe signals.

Не показываем:

- список discovered subdomains;
- CVE details;
- vulnerable version details;
- endpoints;
- exploit evidence;
- intrusive scanner output.

## Layer 2 - Workspace

После verification:

- Security Score;
- Assets;
- Asset Relations;
- Findings;
- Vulnerabilities;
- Infrastructure posture;
- Monitoring changes;
- Reports;
- Notifications;
- Recheck/remediation lifecycle.

## Layer 3 - Platform Admin

Назначение:

- состояние SaaS;
- organizations/users/subscriptions;
- scanner fleet/queue;
- Threat Intelligence freshness;
- abuse;
- audit;
- support access governance.

Platform Admin не должен иметь неограниченное молчаливое чтение клиентских findings. Детальный support access проектируется как отдельное audited действие.

## Confidence terminology

- `Potential` - сигнал возможной проблемы без достаточного подтверждения.
- `Probable` - несколько согласованных признаков, но нет прямого подтверждения.
- `Confirmed` - техническая проверка подтверждает finding.

## Competitive product guardrails

OUTSCAN не должен превращаться в простой website checker или thin wrapper над Nuclei.

Обязательные продуктовые способности:

- Guest Network & Domain Posture без регистрации;
- verified active scanning;
- Change Intelligence и история security-relevant изменений;
- Asset Inventory + relation provenance;
- Threat Intelligence + собственный Risk Engine;
- business summary + technical drill-down;
- Agency/MSP delegated access как раннее направление.

Guest `Baseline posture` не заменяется A-F grade. Полный Security Score существует только в verified workspace.

Подробности конкурентного среза: [COMPETITIVE_ANALYSIS.md](COMPETITIVE_ANALYSIS.md).

## Finding lifecycle

- NEW
- ACTIVE
- ACKNOWLEDGED
- FIXED
- ACCEPTED_RISK
- FALSE_POSITIVE
- REOPENED

## Communication language

Разрешено:

- `Обнаружен новый риск`;
- `Требует внимания`;
- `Потенциальный риск`;
- `Проверка завершена`;
- `Мониторинг активен`;
- `Риск больше не подтверждается`.

Не разрешено:

- `100% безопасно`;
- `защищено от взлома`;
- `гарантированная защита`;
- `полный автоматический пентест`.
