# Security Policy

## Scope

Этот документ описывает правила безопасной разработки и будущий канал disclosure для OUTSCAN.

Пока проект не опубликован как production service, vulnerability disclosure channel считается не настроенным. До публичного запуска необходимо добавить актуальный security contact.

## Development security

Основные требования находятся в:

- `AGENTS.md`
- `docs/SECURITY_MODEL.md`
- `docs/SCANNING_POLICY.md`
- `docs/TESTING.md`

## Reporting vulnerabilities

До настройки официального канала не публиковать в issue tracker:

- реальные credentials;
- session tokens;
- private keys;
- данные клиентов;
- подробные exploitation steps против production.

После запуска создать отдельный security contact и при необходимости `/.well-known/security.txt` для самого OUTSCAN.

## Release policy

Production release блокируется при:

- unresolved Critical/High security issue;
- непроверенной tenant authorization;
- SSRF path из user-controlled target;
- secret exposure без rotation/containment;
- failing security-sensitive tests;
- scanner worker с недопустимым доступом к application infrastructure.
