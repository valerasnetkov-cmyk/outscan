# OUTSCAN Security Capability Registry Test Plan

**Status:** Required implementation verification
**Scope:** Product capability registry, public projection, homepage integration and future admin read model

## 1. Test objective

Prove that the registry provides one consistent product capability catalog without becoming an execution or authorization control.

Happy-path rendering is insufficient. Negative tests are mandatory because this module sits close to public claims, scanner metadata and future administrative controls.

## 2. Unit tests: registry validation

Required cases:

- valid V1 registry loads;
- duplicate slug is rejected;
- empty/invalid slug is rejected;
- unsupported access class is rejected;
- unsupported release state is rejected;
- unsupported maturity is rejected;
- missing public copy for a publicly visible capability is rejected;
- invalid engine binding to unknown capability is rejected;
- internal-only capability cannot be marked public without explicit allowed state;
- stable slug does not depend on display name.

## 3. Unit tests: public projection

Required cases:

- `ACTIVE + public_visible` capability is included;
- `PLANNED` is excluded;
- `DEVELOPMENT` is excluded;
- `STAGING` is excluded;
- `VALIDATED` is excluded until activation;
- `INTERNAL` is excluded;
- `RETIRED` is excluded;
- `DEPRECATED` behavior matches documented public policy;
- output order is deterministic;
- only explicit allow-listed fields are serialized.

## 4. Security negative tests

### Public projection cannot grant execution

Changing:

```text
public_visible: false -> true
```

must not alter:

- `VerifiedScope`;
- `ScanAuthorization`;
- scanner profile;
- entitlement;
- consent;
- machine scanner capability policy.

### Guest isolation

A Guest user/request must not gain verified/controlled execution because a capability is visible on the public site.

Required negative assertions:

- visible `Vulnerability Detection` does not enable active Nuclei for Guest;
- visible `Attack Surface Discovery` does not authorize discovered subdomains;
- registry data does not authorize IP/CIDR/raw TCP scanning;
- registry data cannot change `GUEST_SAFE` budgets or profile rules.

### Unknown scanner capability

Unknown machine-level scanner capability remains denied even when the associated product capability is active/public.

### Public serialization

Assert response never contains known forbidden internal field names or nested equivalents.

At minimum test for absence of:

- template/workflow IDs;
- digests;
- worker image details;
- scan commands;
- policy rules;
- authorization context;
- secret/credential references;
- internal validation evidence references.

## 5. API integration tests

For `GET /v1/public/capabilities`:

- anonymous request succeeds;
- response schema validates;
- response is read-only;
- request cannot mutate state;
- invalid query/input does not expose stack traces/internal models;
- cache headers match public projection policy;
- `schemaVersion` is present;
- ordering is stable;
- planned/staging/internal items are absent.

## 6. Failure-mode tests

### Registry parse/validation failure

Expected behavior:

- no raw internal registry response;
- controlled API error or approved safe snapshot;
- operational error recorded;
- homepage remains usable.

### Rollout storage unavailable

Expected behavior must be explicitly selected during implementation.

Preferred default:

- fail closed for newly dynamic public state;
- do not promote unknown/staging capability;
- use last approved snapshot only if integrity/version is known.

### Unknown engine binding

Must not crash the public site.

It should fail validation or mark internal operational degradation without expanding public claims.

## 7. Homepage tests

Required behavior:

- block is rendered from public capability projection;
- there is no second manually maintained capability array;
- user-facing labels are accessible without color dependence;
- capability access state is understandable in text;
- links/CTA do not imply Guest authorization for verified-only capabilities;
- loading/error state does not remove primary Guest Scan flow;
- 320px reflow remains usable;
- keyboard navigation and focus remain visible.

## 8. Claim tests

Protect against unsupported public copy.

Recommended checks:

- capability requiring evidence cannot become public without approved evidence state;
- blocked/unapproved claim cannot appear in public projection;
- unsupported numeric coverage claims are not generated from engine/template counts;
- upstream release metadata cannot automatically change public product copy.

## 9. Future Platform Admin tests

Before write controls exist, Admin view is read-only.

When write controls are introduced, add negative tests:

- anonymous access rejected;
- normal tenant user rejected;
- platform support role cannot perform owner-only rollout change unless explicitly permitted;
- invalid state transition rejected server-side;
- privileged change creates audit event;
- attempt to modify scanner policy through capability rollout is rejected;
- retired/deprecated transition follows migration rules.

## 10. Regression tests for findings/coverage

If `product_capability_slug` is added to normalized records:

- historical finding remains readable when display name changes;
- unknown/deprecated capability does not resolve a finding;
- capability disable does not delete finding/coverage history;
- product capability grouping does not replace detector/profile/version provenance;
- incomplete coverage is never presented as successful capability coverage.

## 11. Static/type checks

Implementation must have typed/exhaustive enums or equivalent schema validation for:

- access class;
- release state;
- maturity;
- public response schema.

Unhandled enum variants should fail build/test where the chosen stack supports exhaustive checking.

## 12. Source and documentation checks

Before completion:

- authored files remain <=400 physical lines;
- no trailing whitespace;
- LF line endings;
- no duplicate registry definitions in UI/config;
- Markdown links pass;
- no obvious secrets;
- `README.md`, `CHANGELOG.md`, `plan.md` and affected docs are synchronized.

## 13. Required implementation verification order

Run available project checks in this order:

1. targeted registry unit tests;
2. public projection/API tests;
3. security negative tests;
4. lint/format;
5. typecheck;
6. broader test suite;
7. production build;
8. source-file line-count check;
9. diff review for secrets/debug/stale docs;
10. relevant Gate B review before public deployment.

## 14. Minimum release evidence

Do not mark the feature production-ready without evidence for:

- canonical registry validation;
- safe public projection;
- homepage integration;
- scanner-policy separation;
- Guest negative tests;
- public claim approval;
- build/test result;
- documentation synchronization.
