# ADR 0013: Finding condition, occurrences, fingerprint, coverage and sufficient baseline

**Status:** Accepted
**Accepted:** 2026-09-03
**Date:** 2026-09-03
**Owner:** Security / Product

## Condition / events / disposition

Condition:
`OPEN | RESOLVED`.

Events:
`OPENED | RESOLVED | REOPENED`.

Disposition:
`NONE | ACKNOWLEDGED | ACCEPTED_RISK | FALSE_POSITIVE`.

Disposition stores actor, reason, created_at, optional expires_at and audit reference.

## Fingerprint

Store:

- fingerprint/version;
- detector id/version;
- profile id/version;
- scope identity.

Fingerprint algorithm changes cannot silently resolve old findings.

## FindingOccurrence

Every accepted positive detector observation creates an immutable-oriented occurrence linked to the normalized Finding.

Fields:

- organization_id;
- finding_id;
- asset_id;
- scan_job_id;
- scan_attempt_id;
- detector id/version;
- profile id/version;
- scope identity;
- evidence digest/reference;
- confidence;
- observed_at.

Replay of the same accepted ResultEnvelope digest must not create a duplicate occurrence.

Risk recurrence derives from occurrences:

- count in window;
- consecutive compatible scans;
- days since previous;
- reopen count.

## FindingEvent

Only state transitions/audit, not recurrence ledger.

## Coverage

Coverage fields:

- detector_group;
- detector id/version;
- profile id/version;
- scope identity;
- execution status;
- completeness;
- observed_at;
- scan/attempt refs.

Execution:
`SUCCESS | FAILED | TIMED_OUT | CANCELLED | SUPERSEDED`.

Completeness:
`COMPLETE | PARTIAL | NOT_APPLICABLE | UNKNOWN`.

Failed/partial/unknown never proves remediation.

## Automatic resolution

Until compatible resolution policy is implemented and negative-tested:

**automatic RESOLVED is disabled.**

Future auto-resolution must prove compatibility across scope, detector/profile versions, fingerprint version, successful execution and complete coverage.

## SufficientBaselineV1

Asset Security Score is allowed only when all are true:

1. current target is VerifiedScope(EXACT_HOST) and authorization was valid at execution;
2. VERIFIED_BASELINE job = SUCCEEDED;
3. policy/profile versions are approved/not revoked;
4. required detector groups have compatible successful coverage;
5. every applicable required group = COMPLETE;
6. NOT_APPLICABLE is allowed only after explicit applicability evaluation by the same baseline policy;
7. no required group is PARTIAL/UNKNOWN/FAILED/TIMED_OUT/CANCELLED/SUPERSEDED;
8. ResultEnvelope payload passed schema/output validation.

Required groups:

- TARGET_RESOLUTION;
- DNS_DOMAIN_POSTURE;
- TLS_CERTIFICATE_POSTURE;
- HTTP_SECURITY_POSTURE;
- SAFE_VULNERABILITY_DETECTION.

Conditional:

- MAIL_SECURITY_POSTURE required when mail/MX applicability is detected; otherwise explicit NOT_APPLICABLE.

RDAP/CT enrichment is not score-required unless a later policy version says so.

Store `baseline_coverage_policy_version`.

If false:

- no Asset Security Score;
- display missing/failed coverage;
- do not substitute zero findings for score.

## User states

`Не проверено | Не определено | Неприменимо`.

## Required tests

- recurrence via occurrences;
- replay creates no duplicate occurrence;
- partial/failed never resolves;
- incompatible versions never resolve;
- fingerprint migration explicit;
- each missing baseline group makes predicate false;
- score only when predicate true.
