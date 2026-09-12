# OUTSCAN: Competitive Positioning & Objection Handling

Status: internal positioning draft; publication requires Claim Inventory approval and runtime evidence
Scope: OUTSCAN.ru, Workspace, Agency/MSP, sales, presentations, pricing, product copy
Recommended repository path: `docs/COMPETITIVE_POSITIONING_AND_OBJECTIONS.md`

## 1. Purpose

This document defines how OUTSCAN must be positioned against free local utilities, open-source scanners, scripts, monitoring stacks, and manual security work.

Its purpose is not to prove that OUTSCAN is "better than Nmap" or "better than Nuclei".

The product must remain honest about a simple fact:

> For a one-off technical check, a competent administrator can often solve the task with free tools.

OUTSCAN creates value when security becomes a continuous operational process rather than a single scan.

## 2. Intended product positioning

OUTSCAN is not a vulnerability scanner sold as a web service.

OUTSCAN is a platform for continuous control of an organization's external digital perimeter.

Canonical value chain:

`Assets -> Changes -> Risks -> Priority -> Remediation -> Recheck -> Monitoring`

Canonical competitive formula:

> Free tools help perform a check. OUTSCAN turns checks into a continuous control process.

Internal positioning formula:

> A local scanner answers "what can I see now?" OUTSCAN must answer "what exists, what changed, what became risky, what requires action, and was the problem actually fixed?"

## 3. What OUTSCAN does not compete on

OUTSCAN must not try to win on the following claims:

- "we can scan a port better than Nmap";
- "we can run a Nuclei template better than Nuclei";
- "we have more scanner engines";
- "our interface is prettier than a terminal";
- "our scan replaces an administrator";
- "our scan replaces a pentest".

Scanner engines are implementation details and technical dependencies.

The product value must exist above them.

## 4. Where free tools are genuinely stronger

Free and local tools are a strong alternative when:

- there is one server or one site;
- a specialist needs a one-time answer;
- the infrastructure changes rarely;
- the organization already has a mature internal security pipeline;
- the administrator is ready to maintain discovery, scanners, schedules, updates, history, correlation, alerts and reports independently.

OUTSCAN should not artificially push such users into a paid Business plan.

For part of this audience, Free is the correct product tier.

## 5. Where OUTSCAN must win

OUTSCAN becomes materially stronger when the customer has one or more of the following conditions:

- multiple domains, sites, APIs or public services;
- unknown or forgotten external assets;
- frequent infrastructure changes;
- several administrators, developers or contractors;
- a need to preserve history;
- a need to compare "before" and "after";
- a need to receive alerts without manually running tools;
- a need to correlate new vulnerabilities with detected technologies;
- a need to prioritize findings rather than process raw scanner output;
- a need to assign remediation and verify the result;
- a need for management reporting;
- dozens or hundreds of customer assets in an Agency/MSP model.

## 6. Product hierarchy for marketing

Do not make "Vulnerability Scanning" the primary promise.

The preferred hierarchy is:

### 6.1 Asset discovery

See what is actually exposed to the internet.

### 6.2 Change intelligence

Know when the external perimeter changes.

### 6.3 New threat relevance

Understand whether newly published vulnerabilities may relate to your detected technologies and assets.

### 6.4 Risk prioritization

Understand what needs attention first.

### 6.5 Remediation control

Assign, fix, recheck and confirm the result.

### 6.6 Continuous monitoring

Do not rely on someone remembering to run the next scan.

Scanner names may appear in technical documentation, but they should not define the commercial value proposition.

## 7. Free vs Paid logic

The pricing principle is:

### Free

> Check.

Free may cover useful one-off diagnostics and a limited amount of history or monitoring.

### Paid

> Do not monitor manually. OUTSCAN keeps watching.

Paid tiers should primarily monetize:

- continuous monitoring;
- Change Intelligence;
- new asset alerts;
- targeted checks for emerging vulnerabilities;
- longer history;
- notifications;
- remediation workflow;
- rechecks;
- team workflows;
- executive reporting;
- Agency/MSP scale;
- API and integrations.

Do not put the main paywall around the mere ability to click "Scan".

## 8. Objection handling principles

1. Agree when the customer is technically correct.
2. Do not attack open-source tools.
3. Do not claim that OUTSCAN replaces the administrator.
4. Move the conversation from "scan" to "continuous process".
5. Explain the operational cost of maintaining a DIY stack.
6. Use the customer's number of assets, frequency of change and team size as qualification criteria.
7. Do not sell a paid plan where Free is objectively sufficient.
8. Never claim a capability that is not production-ready and publicly approved through the product capability process.

## 9. Objection response candidates

Administrator/developer, owner/manager and Agency/MSP answers are retained in [Competitive objections](COMPETITIVE_OBJECTIONS.md). Use them only within actual capability and publication evidence.

## 10. Buyer-role positioning

### Administrator / developer

Primary message:

> Keep your tools. Stop maintaining the entire monitoring process around them manually.

Value:

- automation;
- correlation;
- history;
- changes;
- rechecks;
- fewer repetitive tasks.

### Owner / manager

Primary message:

> OUTSCAN does not replace your technical team. It makes the external security state and important changes visible and controllable.

Value:

- priorities;
- accountability;
- verified remediation;
- management reporting;
- continuity of control despite personnel changes.

### AI-enabled Builder

Primary message:

> Вы создаёте быстрее. Контроль не должен отставать.

Value:

- независимое наблюдение production-периметра;
- видимость изменений после быстрых deploy;
- обнаружение новых внешних активов по мере появления capability;
- remediation → recheck без обещаний автоматической защиты.

Do not position OUTSCAN as an `AI Security Platform` or as a service that proves AI-generated code secure. AI is market context; OUTSCAN evaluates observable external exposure and evidence.

For early self-service acquisition, this segment is the **Creator/Vibe Coding beachhead**, not the product ceiling. Public copy should prefer respectful role language; see `CREATOR_VIBE_CODING_GTM.md`. The intended upgrade path is Creator -> Studio -> Agency/MSP -> broader Business/EASM use.

### Agency / MSP

Primary message:

> One control layer for many customer assets.

Value:

- multi-customer visibility;
- centralized alerts;
- history;
- standardized service quality;
- reports;
- future white label and API.

## 11. Sales qualification

### Strong fit

- 5+ meaningful public assets;
- multiple domains or projects;
- contractor-created resources;
- regular infrastructure changes;
- no unified external asset inventory;
- manual security checks;
- several responsible people;
- need for reports or audit trail;
- Agency/MSP portfolio;
- frequently deployed AI-built/indie project without dedicated infrastructure/security staff.

### Weak fit

- one simple static site with rare changes and no monitoring need;
- one experienced administrator;
- rare changes;
- mature internal discovery and vulnerability-management pipeline;
- no need for history, notifications or reporting.

For a weak-fit customer, recommend Free or a limited tier rather than manufacturing urgency.

## 12. Marketing candidates requiring publication review

Prefer:

- "Monitor the external digital perimeter";
- "Detect new external assets";
- "See what changed";
- "Understand what requires attention first";
- "Track relevant new risks";
- "Verify remediation";
- "Continuous external risk monitoring";
- "External risks under control".

## 13. Prohibited or discouraged marketing language

Do not use:

- "100% protection";
- "your site is completely secure";
- "we find all vulnerabilities";
- "automatic pentest" or any broader scanner claim blocked by the current Claim Inventory and V1 scope;
- "we replace your administrator";
- "better than Nmap/Nuclei";
- "hackers cannot get through";
- "guaranteed protection against attacks";
- fear-based statements implying an incident is inevitable;
- scanner-count claims as the primary value proposition.

## 14. Product requirements implied by this positioning

The positioning is only credible if OUTSCAN actually develops the continuous-control layer.

High-priority capabilities:

1. Asset inventory and discovery.
2. Change Intelligence: `before -> after -> why it matters`.
3. Monitoring events and history.
4. Targeted checks for newly relevant vulnerabilities.
5. Risk prioritization independent of one scanner's severity.
6. Notifications.
7. Remediation workflow.
8. Recheck and verified-fix state.
9. Executive and technical reporting.
10. Agency/MSP multi-customer workflows.

If these capabilities are not production-ready, marketing must not present them as already available.

## 15. UI implications

The Workspace must not look like a front end for a scanner CLI. Follow `PRODUCT_SIMPLICITY_UX.md`.

Primary hierarchy: **what requires action now -> what changed -> new/unknown assets -> remediation awaiting recheck -> current posture -> technical evidence**.

A large `Run scan` button, raw finding count or scanner taxonomy must not become the conceptual center of the paid product. The 10s/30s/deep-dive target applies.

## 16. Landing-page implications

The site must not imitate complex enterprise-cybersecurity navigation. Lead with the user problem and domain check, then explain **Ресурсы / Риски / Изменения / Исправления**, how OUTSCAN works, audience, pricing and CTA.

Do not require EASM/ASM/CTEM vocabulary in the hero and do not dump the Capability Registry as a feature wall. Technical capabilities may live on a deeper explicit page after claim/evidence approval. Creator campaigns may use dedicated Telegram/YouTube landing/deep links without changing the universal OUTSCAN category or security boundaries.

Competitive shorthand: **enterprise-возможности без enterprise-сложности**. Treat it as positioning direction, not automatically approved public copy.

## 17. Pricing implications

Paid plans should become easier to justify as automation and operational load increase.

The primary paid differentiators should be continuous-value features, not arbitrary restrictions on one-time scanning.

Recommended principle:

> The customer pays for not having to remember, run, compare, correlate and report everything manually.

A low-cost `Creator` packaging experiment is acceptable only when scan cost, support load, CAC/payback and retention are validated. It is not an AI tariff and cannot grant unlimited heavy scanning or wider authorization.

## 18. Product integrity rule

OUTSCAN must remain useful even if an administrator already knows and uses Nmap, Nuclei, Subfinder, Naabu, ZAP or other specialist tools.

If the only reason to buy OUTSCAN is that the customer does not know how to run those utilities, the product positioning has failed.

## 19. Candidate positioning statements

### External statement

> OUTSCAN continuously monitors the external digital perimeter, detects important changes and risks, and helps understand what requires attention first.

### Competitive statement

> Free tools help perform a check. OUTSCAN turns checks into a continuous control process.

### Product rule

> Do not sell scanning. Sell visibility, changes, prioritization, remediation control and continuous monitoring.
