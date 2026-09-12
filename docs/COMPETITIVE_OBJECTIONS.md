# Competitive objections — internal response candidates

Status: internal planning companion to [positioning](COMPETITIVE_POSITIONING_AND_OBJECTIONS.md). These answers describe intended value, not implemented features or approved public claims. [Claim Inventory](CLAIM_INVENTORY.md) and actual release evidence take precedence; do not promise unimplemented monitoring, recheck, discovery or reports.

## 9. Objections: administrator / developer

### O1. "I can run Nmap myself"

Recommended answer:

> Yes. If you need to inspect ports on a specific host once, Nmap is an appropriate tool. OUTSCAN is needed when you want the external perimeter to be checked continuously and to know when a new asset, service or relevant risk appears without manually repeating and comparing checks.

Do not answer:

> OUTSCAN scans better than Nmap.

### O2. "Nuclei is free. Why should I pay?"

Recommended answer:

> Nuclei is an effective detection engine. OUTSCAN does not need to compete with it. The paid value is in asset inventory, scheduling, updates, correlation with threat intelligence, history, deduplication, prioritization, notifications and rechecks around the scanner.

### O3. "I will put Nmap, Nuclei and Subfinder in cron"

Recommended answer:

> You can build a meaningful part of the scanner pipeline yourself. Then you also become responsible for maintaining discovery, jobs, template updates, data normalization, history, deduplication, alerting, permissions, reports and rechecks. OUTSCAN competes with the cost of operating that internal system, not with the price of the individual utilities.

### O4. "We already have monitoring: Zabbix / Prometheus / Grafana"

Recommended answer:

> Infrastructure monitoring and external exposure monitoring solve different problems. Your monitoring usually observes systems you already know about. OUTSCAN must focus on what is visible from the internet, including new or forgotten assets, external configuration changes and security-relevant changes.

### O5. "We already have a WAF / antivirus / EDR"

Recommended answer:

> Those controls protect or observe specific layers. OUTSCAN is not a replacement for them. Its role is to show the external attack surface, relevant changes and risks across public assets and to help control remediation.

### O6. "Scanners generate too many false positives"

Recommended answer:

> OUTSCAN must not copy scanner severity directly into the product. Findings are correlated with evidence, exposure, exploit intelligence and confidence, and must distinguish Potential, Probable and Confirmed states. The goal is to reduce noise, not reproduce it.

### O7. "I do not want an external service aggressively scanning production"

Recommended answer:

> This is a valid concern. OUTSCAN separates safe public diagnostics from verified and controlled scanning. V1 is hostname/EXACT_HOST only; ACTIVE, raw TCP/IP/CIDR, authenticated scanning and HEADLESS_BROWSER remain disabled. Controlled Deep additionally requires current verified scope, execution authorization, approved policy and per-run consent. A paid plan or verification never enables a disabled mode.

## 10. Objections: owner / manager

### O8. "I already have a system administrator"

Recommended answer:

> OUTSCAN does not replace the administrator. The administrator fixes infrastructure. OUTSCAN provides continuous observation, identifies important changes, records the state, helps prioritize work and verifies that significant problems were rechecked after remediation.

### O9. "Why pay every month? We already checked the site"

Recommended answer:

> A successful scan describes a point in time. Tomorrow a new subdomain can appear, a configuration can change, a certificate can expire or a new vulnerability can be published for a technology you already use. The subscription pays for detecting those changes after the initial check.

### O10. "We have never been hacked"

Recommended answer:

> OUTSCAN should not argue through fear. The relevant question is whether the organization knows what is currently exposed, what changed and what requires attention. The product is about visibility and control, not predicting that an incident will definitely happen.

### O11. "Our site is small. We do not need a security platform"

Recommended answer:

> That may be true. If you have one simple resource and rare changes, Free or a one-off check may be sufficient. A paid plan becomes useful when there are several assets, regular changes, contractors, notifications, history or a need for ongoing control.

### O12. "Security is the administrator's responsibility. Why should management see this?"

Recommended answer:

> Management does not need raw CVEs or scanner output. It needs to know which business-relevant risks require attention, whether work is assigned, whether important changes occurred and whether remediation was verified.

## 11. Objections: web studio / Agency / MSP

### O13. "Our developers can check client sites themselves"

Recommended answer:

> They can check one site. The operational problem appears when you need to control dozens of client sites consistently, preserve history, detect new assets and new CVEs, route findings to the right person and produce a clear client report every month.

### O14. "Our clients will not pay separately for cybersecurity"

Recommended answer:

> OUTSCAN does not have to be sold as a separate enterprise security project. For an agency it can become part of a recurring website support or maintenance package: monitoring, important alerts, monthly status and verified remediation.

### O15. "We already have our own scripts"

Recommended answer:

> Keep them where they are useful. OUTSCAN should complement existing tooling through centralized inventory, history, monitoring, reporting and later API/integration workflows. The product should not require an agency to abandon working technical tools just to use the platform.
