# Roadmap

## Strategic direction

```text
External Monitoring
 -> Change Intelligence
 -> EASM / Attack Surface + Asset Graph basics
 -> Agency / MSP / API
 -> AppSec / API Security
 -> Supply Chain
 -> Cloud / Internal Exposure
 -> Attack Paths
 -> Exposure Management / CTEM
 -> Enterprise / Managed Security
```

## V1 - Domain + External Monitoring

Commercially useful core:

- public Guest Scan;
- verified domain monitoring;
- Network & Domain Posture;
- initial asset inventory;
- Nuclei detection;
- NVD / KEV / EPSS enrichment;
- Risk Engine;
- workspace/reporting;
- email alerts.

V1 must already store history needed by Change Intelligence even if UI initially shows only selected diffs.

## V1.5 - Change Intelligence

Priority before broad AppSec expansion:

- posture snapshots/history;
- IP/ASN/NS/MX/CA/CDN/TLS/DMARC/RPKI diffs;
- new/disappeared asset events;
- technology change events;
- finding reopened/fixed events;
- change significance;
- alerting on meaningful security regressions;
- user-facing `что изменилось и почему это важно` timeline.

## V2 - Attack Surface / EASM + Asset Graph basics

- expanded asset discovery;
- public IP/services;
- unknown/shadow assets;
- richer Asset Relations;
- attribution reason/provenance/confidence;
- first/last seen;
- attack surface trends;
- external infrastructure monitoring;
- initial graph-ready API/data model.

Full graph visualization is optional at this stage. Relationship data is mandatory.

## V2.5 - Agency / MSP + Platform API

Prioritized early because market evidence shows clear reseller/managed-monitoring demand.

- partner account model;
- each client remains a separate Organization tenant;
- delegated access grants;
- customer spaces;
- White Label reports;
- bulk monitoring views;
- partner billing;
- API/webhooks;
- branded reports.

## V3 - Application + API Security

- authenticated DAST;
- OWASP ZAP;
- deeper SPA crawling;
- OpenAPI/Swagger;
- GraphQL;
- endpoint inventory;
- auth/rate-limit/misconfiguration checks.

## V4 - Supply Chain

- GitHub/GitLab;
- OSV;
- dependencies;
- SBOM;
- secrets;
- containers;
- CI/CD/IaC posture.

## V5 - Cloud + Private Scanner

- read-only cloud connectors;
- public exposure correlation;
- internal scanner agent/container;
- enterprise data residency options.

## V6 - Attack Paths

Correlate:

```text
Asset -> Technology -> Vulnerability -> Exposure -> Business Asset -> Attack Path
```

Prioritize realistic paths rather than raw vulnerability count.

## V7 - Exposure Management / CTEM

Lifecycle:

- Discover
- Assess
- Prioritize
- Validate
- Remediate
- Verify
- Monitor

## V8 - Enterprise / Managed

- SSO/SCIM;
- advanced RBAC;
- SIEM/SOAR integrations;
- SLA;
- managed analyst service;
- enterprise reporting/compliance;
- private/regional scanner pools.

## Sequencing rule

Do not start the next major scanner class because it is technically interesting. Advance based on at least one of:

- repeated customer demand;
- revenue/retention evidence;
- security coverage gap that blocks current customers;
- operational evidence that the current module has reached stable maturity.
