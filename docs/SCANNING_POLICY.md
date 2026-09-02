# Scanning policy

## Purpose

Этот документ определяет, какие проверки OUTSCAN имеет право выполнять в каждом пользовательском контексте.

## Scan classes

### SAFE

Низкорисковые проверки, которые не должны изменять состояние цели и не создают существенную нагрузку.

### CONTROLLED

Активные проверки только для verified assets и разрешенного scope.

### ACTIVE

Более глубокие проверки: verified scope + явный opt-in + отдельные rate/resource limits.

### DISABLED

Не запускать в SaaS, пока не принято отдельное security/legal решение.

## Guest Scan - разрешено

### Domain / DNS

- A / AAAA.
- NS / SOA / TTL.
- CNAME.
- MX.
- CAA.
- DNSSEC indicators.
- SPF.
- DMARC.
- MTA-STS.
- TLS-RPT.
- RDAP registrar / dates / status.

### Network posture

- resolved public IPv4/IPv6.
- ASN.
- network provider.
- BGP prefix.
- RPKI status.
- reverse DNS/PTR when safely available.

### HTTP/TLS

- HTTP -> HTTPS redirect.
- negotiated TLS/protocol information.
- certificate issuer/validity/SAN count or safe summary.
- HTTP/1.1, HTTP/2, HTTP/3 indicators.
- ALPN.
- security headers.
- public cookie flags from response.
- CDN/WAF detection.
- server/technology fingerprint without exposing sensitive version evidence.
- connection timings.
- `security.txt` presence.

### Certificate Transparency

Guest may receive aggregate information such as count/history summary. Do not expose discovered subdomain list before verification.

## Guest Scan - запрещено

- Naabu/port sweep.
- Service brute discovery.
- Nuclei active vulnerability templates.
- Deep Katana crawl.
- ZAP active scan.
- Fuzzing.
- Brute force.
- Credential testing.
- Exploitation.
- Authenticated scan.
- Intrusive API testing.
- Destructive checks.
- DoS/load checks.

## Guest potential risks

`N potential risks` must be derived only from guest-safe observations and passive intelligence.

Guest output may include severity aggregate only if calculation does not require an active scan and does not reveal operational details.

Do not call a guest signal `Confirmed vulnerability`.

## Verified scan profiles

### VERIFIED_BASELINE

- Subfinder discovery.
- httpx enrichment.
- approved safe network discovery.
- approved Nuclei SAFE templates.
- limited crawler as required.

### CONTROLLED_DEEP

- expanded Katana.
- controlled Naabu profile.
- additional Nuclei templates marked CONTROLLED.

### ACTIVE

Future only. Requires explicit customer opt-in and separate design review.

## Nuclei template governance

Every template/profile has local classification:

- SAFE
- CONTROLLED
- ACTIVE
- DISABLED

Production worker uses allowlists, not `run everything`.

Runtime cannot silently download and execute a new community template during a customer job.

Update flow:

```text
new engine/templates
 -> staging
 -> schema/signature/source review
 -> regression tests
 -> canary scans against owned test targets
 -> approval
 -> production image/profile
```

## Job limits

Each job defines:

- max duration;
- max requests;
- max concurrency;
- retries;
- redirects;
- response size;
- CPU/RAM/PIDs;
- allowed scanner profile;
- verified scope id when required.

## Evidence

Store only evidence necessary to explain/reproduce a finding safely.

Avoid storing:

- complete sensitive response bodies;
- credentials/tokens;
- unnecessary PII;
- dangerous exploitation payloads when a safer proof exists.
