# Sync status: DRAFT editorial seed; not approved/public runtime data.

# Initial Glossary Terms

This file is an editorial draft for a future OUTSCAN glossary registry; it is not approved runtime content.
Runtime import requires individual content/security review under SECURITY_GLOSSARY.md and SECURITY_GLOSSARY_TESTING.md; this documentation sync does not perform an import.

Seed defaults unless a record explicitly overrides them: `audience = ALL`, `publicVisible = false`, `reviewedAt = null`, `reviewState = DRAFT`.

## HTTP

- `slug`: `http`
- English: Hypertext Transfer Protocol (HTTP)
- Category: `web-security`
- Aliases: `hypertext transfer protocol`
- Простыми словами: Протокол обмена данными между веб-клиентом и сервером.
- Объяснение: HTTP определяет запросы, ответы, заголовки и способы передачи веб-данных.
- Почему это важно: Многие проверки OUTSCAN анализируют именно HTTP-ответы и конфигурацию веб-сервиса.
- Важно: Обычный HTTP не шифрует соединение; для публичных сайтов обычно используется HTTPS.
- Связанные термины: `https`, `security-headers`
- Связанные capability: `web-security`

## HTTPS

- `slug`: `https`
- English: HTTP Secure (HTTPS)
- Category: `web-security`
- Aliases: `http over tls`
- Простыми словами: HTTP-соединение, защищённое TLS.
- Объяснение: HTTPS шифрует данные между клиентом и сервером и позволяет проверить сертификат сервера.
- Почему это важно: Это базовая защита для веб-сайтов, API и форм входа.
- Важно: HTTPS защищает канал связи, но не означает, что само веб-приложение не содержит уязвимостей.
- Связанные термины: `http`, `tls`, `tls-certificate`
- Связанные capability: `tls-https`

## TLS

- `slug`: `tls`
- English: Transport Layer Security (TLS)
- Category: `web-security`
- Aliases: `transport layer security`, `ssl`
- Простыми словами: Протокол, защищающий сетевое соединение шифрованием и проверкой подлинности.
- Объяснение: TLS используется в HTTPS и других защищённых сетевых протоколах.
- Почему это важно: Версия и конфигурация TLS влияют на безопасность передачи данных.
- Важно: Термин SSL часто используют разговорно, но современные защищённые соединения используют TLS.
- Связанные термины: `https`, `tls-certificate`
- Связанные capability: `tls-https`

## TLS-сертификат

- `slug`: `tls-certificate`
- English: TLS Certificate
- Category: `web-security`
- Aliases: `ssl-сертификат`, `ssl certificate`, `сертификат https`
- Простыми словами: Цифровой сертификат, связывающий доменное имя с криптографическим ключом.
- Объяснение: Браузер проверяет сертификат при установлении HTTPS-соединения.
- Почему это важно: Просроченный или неверный сертификат может нарушить доступность и доверие пользователей.
- Важно: Действующий сертификат подтверждает защищённое соединение, но не отсутствие уязвимостей в приложении.
- Связанные термины: `tls`, `https`, `caa`
- Связанные capability: `tls-https`

## HSTS

- `slug`: `hsts`
- English: HTTP Strict Transport Security (HSTS)
- Category: `web-security`
- Aliases: `strict transport security`
- Простыми словами: HTTP-политика, заставляющая браузер использовать HTTPS для домена в течение заданного времени.
- Объяснение: Она уменьшает риск случайного перехода пользователя на незашифрованный HTTP после получения политики.
- Почему это важно: HSTS полезен для сайтов, которые должны работать только по HTTPS.
- Важно: Неправильное включение HSTS для неподготовленных поддоменов может вызвать проблемы доступности.
- Связанные термины: `https`, `security-headers`
- Связанные capability: `web-security`

## CSP

- `slug`: `csp`
- English: Content Security Policy (CSP)
- Category: `web-security`
- Aliases: `content-security-policy`
- Простыми словами: Политика браузера, ограничивающая источники загружаемого и выполняемого содержимого.
- Объяснение: CSP может ограничить скрипты, стили, фреймы и другие ресурсы.
- Почему это важно: Хорошая CSP уменьшает последствия некоторых XSS и ошибок загрузки стороннего контента.
- Важно: CSP является дополнительной защитой и не заменяет исправление XSS в приложении.
- Связанные термины: `xss`, `security-headers`
- Связанные capability: `web-security`

## CORS

- `slug`: `cors`
- English: Cross-Origin Resource Sharing (CORS)
- Category: `web-security`
- Aliases: `cross origin resource sharing`
- Простыми словами: Механизм браузера, управляющий доступом веб-страниц к ресурсам другого origin.
- Объяснение: Сервер через HTTP-заголовки сообщает, каким внешним сайтам и методам разрешён доступ.
- Почему это важно: Слишком широкая CORS-конфигурация может раскрыть данные или действия неподходящим origin.
- Важно: Само наличие CORS не является уязвимостью; важна конкретная политика и контекст авторизации.
- Связанные термины: `http`, `security-headers`
- Связанные capability: `web-security`

## Защитные HTTP-заголовки

- `slug`: `security-headers`
- English: Security Headers
- Category: `web-security`
- Aliases: `http security headers`
- Простыми словами: HTTP-заголовки, которые дают браузеру дополнительные правила безопасного поведения.
- Объяснение: К ним относятся HSTS, CSP, X-Content-Type-Options, Referrer-Policy и другие.
- Почему это важно: Они помогают снизить класс рисков на стороне браузера и показать качество базовой конфигурации.
- Важно: Отсутствующий заголовок может быть рекомендацией по hardening, а не подтверждённой уязвимостью.
- Связанные термины: `hsts`, `csp`, `http`
- Связанные capability: `web-security`

## Cookie

- `slug`: `cookie`
- English: HTTP Cookie
- Category: `web-security`
- Aliases: `cookies`, `куки`
- Простыми словами: Небольшой фрагмент данных, который сайт просит браузер хранить и отправлять обратно.
- Объяснение: Cookies часто используются для сессий, авторизации и пользовательских настроек.
- Почему это важно: Параметры cookie важны, если в ней хранится идентификатор сессии или другой чувствительный токен.
- Важно: Содержимое и назначение cookie важнее самого факта её наличия.
- Связанные термины: `httponly`, `secure-cookie`, `samesite`
- Связанные capability: `web-security`

## HttpOnly

- `slug`: `httponly`
- English: HttpOnly
- Category: `web-security`
- Aliases: `http only`
- Простыми словами: Флаг cookie, запрещающий обычному JavaScript читать её через браузерный API.
- Объяснение: Это может уменьшить риск кражи сессионной cookie через некоторые XSS-сценарии.
- Почему это важно: Особенно важен для cookies, которые используются как серверные сессии.
- Важно: HttpOnly не предотвращает сам XSS и не делает сессию автоматически безопасной.
- Связанные термины: `cookie`, `xss`, `secure-cookie`
- Связанные capability: `web-security`

## Secure Cookie

- `slug`: `secure-cookie`
- English: Secure Cookie
- Category: `web-security`
- Aliases: `secure flag`
- Простыми словами: Cookie с флагом Secure, которая должна передаваться браузером только по защищённому HTTPS-соединению.
- Объяснение: Это уменьшает риск отправки чувствительной cookie по незашифрованному HTTP.
- Почему это важно: Флаг важен для сессионных и других чувствительных cookies.
- Важно: Secure не шифрует значение cookie отдельно; защищён транспорт HTTPS.
- Связанные термины: `cookie`, `https`, `httponly`
- Связанные capability: `web-security`

## SameSite

- `slug`: `samesite`
- English: SameSite Cookie Attribute
- Category: `web-security`
- Aliases: `same site cookie`
- Простыми словами: Параметр cookie, ограничивающий её отправку при некоторых межсайтовых запросах.
- Объяснение: Режимы Strict, Lax и None по-разному влияют на межсайтовую передачу cookies.
- Почему это важно: Правильный режим может уменьшить риск части CSRF-сценариев.
- Важно: SameSite не следует считать единственной защитой от CSRF.
- Связанные термины: `cookie`, `csrf`
- Связанные capability: `web-security`

## IP-адрес

- `slug`: `ip-address`
- English: IP Address (IP)
- Category: `network-infrastructure`
- Aliases: `ip`
- Простыми словами: Сетевой адрес, по которому устройства и сервисы взаимодействуют через IP-сети.
- Объяснение: Домен может указывать на один или несколько IP-адресов, а IP может обслуживать множество доменов.
- Почему это важно: OUTSCAN использует IP как часть внешнего профиля актива и отслеживает его изменения.
- Важно: Совпадение IP не всегда означает одного владельца из-за облачных платформ и shared hosting.
- Связанные термины: `a-record`, `asn`
- Связанные capability: `infrastructure`

## Порт

- `slug`: `port`
- English: Network Port
- Category: `network-infrastructure`
- Aliases: `tcp port`, `udp port`
- Простыми словами: Числовой идентификатор сетевой службы на IP-адресе.
- Объяснение: Например, HTTPS обычно доступен через TCP-порт 443.
- Почему это важно: Порты помогают понять, какие сервисы доступны снаружи.
- Важно: Порт - это часть адресации сервиса, а не физический разъём и не уязвимость сам по себе.
- Связанные термины: `open-port`, `public-service`
- Связанные capability: `infrastructure`

## Открытый порт

- `slug`: `open-port`
- English: Open Port
- Category: `network-infrastructure`
- Aliases: `открытый tcp порт`
- Простыми словами: Порт, на котором удалённый узел отвечает на сетевые подключения.
- Объяснение: Открытый порт обычно означает, что за ним доступен какой-либо сетевой сервис.
- Почему это важно: Неожиданный публичный порт может увеличивать поверхность атаки.
- Важно: Открытый порт не является автоматическим доказательством уязвимости.
- Связанные термины: `port`, `public-service`, `exposure`
- Связанные capability: `infrastructure`

## Публичный сервис

- `slug`: `public-service`
- English: Public Service
- Category: `network-infrastructure`
- Aliases: `internet-facing service`
- Простыми словами: Сетевая служба, доступная из интернета.
- Объяснение: Это может быть веб-сервер, VPN, SSH, база данных или иной протокол.
- Почему это важно: OUTSCAN должен помогать отличать ожидаемые публичные сервисы от случайно открытых.
- Важно: Не каждый публичный сервис нужно закрывать; важно понимать необходимость и уровень защиты.
- Связанные термины: `open-port`, `exposure`
- Связанные capability: `infrastructure`

## ASN

- `slug`: `asn`
- English: Autonomous System Number (ASN)
- Category: `network-infrastructure`
- Aliases: `autonomous system number`
- Простыми словами: Уникальный номер автономной системы, участвующей в маршрутизации интернета.
- Объяснение: По ASN можно понять, к какой крупной сети или оператору относится IP-префикс.
- Почему это важно: Изменение ASN может быть признаком миграции инфраструктуры или провайдера.
- Важно: ASN не является точным доказательством владельца конкретного приложения.
- Связанные термины: `ip-address`, `bgp`, `rpki`
- Связанные capability: `infrastructure`

## BGP

- `slug`: `bgp`
- English: Border Gateway Protocol (BGP)
- Category: `network-infrastructure`
- Aliases: `border gateway protocol`
- Простыми словами: Протокол обмена маршрутами между автономными системами в интернете.
- Объяснение: Через BGP сети сообщают, какие IP-префиксы они могут доставлять.
- Почему это важно: BGP-контекст помогает OUTSCAN описывать сетевую инфраструктуру актива.
- Важно: OUTSCAN не должен трактовать обычное изменение BGP-маршрута как атаку без дополнительного контекста.
- Связанные термины: `asn`, `rpki`
- Связанные capability: `infrastructure`

## RPKI

- `slug`: `rpki`
- English: Resource Public Key Infrastructure (RPKI)
- Category: `network-infrastructure`
- Aliases: `route origin validation`
- Простыми словами: Механизм криптографической авторизации того, какая автономная система может объявлять определённый IP-префикс.
- Объяснение: RPKI используется для проверки происхождения маршрута и может давать статусы вроде Valid, Invalid или Not Found.
- Почему это важно: Он добавляет полезный сигнал о корректности маршрутизации внешней инфраструктуры.
- Важно: RPKI оценивает происхождение маршрута, а не безопасность самого веб-приложения.
- Связанные термины: `bgp`, `asn`
- Связанные capability: `infrastructure`

## CDN

- `slug`: `cdn`
- English: Content Delivery Network (CDN)
- Category: `network-infrastructure`
- Aliases: `content delivery network`
- Простыми словами: Распределённая сеть, которая доставляет содержимое пользователям через узлы, расположенные ближе к ним.
- Объяснение: CDN может кэшировать контент, завершать TLS и скрывать origin-сервер за своей сетью.
- Почему это важно: Определение CDN помогает правильнее интерпретировать IP, TLS и доступность.
- Важно: CDN не заменяет защиту приложения и может скрывать фактический origin от простого внешнего наблюдения.
- Связанные термины: `waf`, `ip-address`
- Связанные capability: `infrastructure`

## WAF

- `slug`: `waf`
- English: Web Application Firewall (WAF)
- Category: `network-infrastructure`
- Aliases: `web application firewall`
- Простыми словами: Фильтр веб-трафика, который пытается выявлять и блокировать нежелательные HTTP-запросы.
- Объяснение: WAF работает перед веб-приложением и может применять правила по сигнатурам, поведению и другим признакам.
- Почему это важно: Его наличие является важным контекстом для внешней поверхности атаки.
- Важно: WAF не гарантирует отсутствие уязвимостей и может иметь обходы или неверные настройки.
- Связанные термины: `http`, `cdn`, `vulnerability`
- Связанные capability: `web-security`
