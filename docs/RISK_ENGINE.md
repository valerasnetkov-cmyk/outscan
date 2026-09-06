# Risk Engine

## Objective

OUTSCAN Risk answers: **how important is this risk for this asset now?** It does not copy scanner severity.

## Inputs

- base severity/CVSS;
- EPSS;
- KEV;
- confidence;
- Internet exposure;
- asset criticality;
- recency;
- recurrence from FindingOccurrence;
- reopen history;
- security-relevant change context;
- coverage/reference quality.

## Recurrence

Do not infer recurrence only from first_seen/last_seen.

Use FindingOccurrence:

- occurrence count in window;
- consecutive compatible scans;
- days since previous occurrence;
- reopen count.

Replay of the same accepted ResultEnvelope digest must not create another occurrence.

## Guardrails

- KEV + Confirmed + public exposure cannot be Low/Medium.
- Potential + high CVSS alone does not automatically become Critical.
- Missing CVSS does not imply low risk.
- Missing/partial coverage cannot improve score as if fixed.

## Finding resolution

Risk Engine does not resolve from absence of detection.
Automatic RESOLVED remains disabled until ADR 0013 compatible-coverage implementation/tests.

## Asset Security Score

Create only when `SufficientBaselineV1=true`.

Predicate requires:

- active EXACT_HOST authorization at execution;
- successful VERIFIED_BASELINE;
- approved policy/profile;
- COMPLETE required detector groups;
- explicit NOT_APPLICABLE only where evaluated by same policy;
- no PARTIAL/UNKNOWN/failed required group;
- accepted validated ResultEnvelope.

Required detector groups:

- TARGET_RESOLUTION;
- DNS_DOMAIN_POSTURE;
- TLS_CERTIFICATE_POSTURE;
- HTTP_SECURITY_POSTURE;
- SAFE_VULNERABILITY_DETECTION.

Conditional:

- MAIL_SECURITY_POSTURE when MX/mail applicability exists.

Store baseline_coverage_policy_version.

If insufficient:

- no Asset Security Score;
- show missing/failed coverage;
- never substitute zero findings.

## Organization Security Score

Only explicitly active MonitoringEnrollment assets.
Store monitored asset set/ref and model version.
Do not hide Critical findings behind average score.

## Guest

Guest uses Baseline posture only.
`N=0` signals does not prove no risk.

## Change significance

Separate versioned model.
V1 snapshots; V1.5 diff/significance/timeline/alerts.

## Explainability

UI explains major factors, recurrence/change, confirmed vs inferred, missing coverage, intelligence freshness and next action.
