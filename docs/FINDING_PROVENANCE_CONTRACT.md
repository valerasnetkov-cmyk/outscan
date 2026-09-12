# OUTSCAN Finding Provenance Contract

Status: proposed documentation only; no runtime, publication or gate evidence. [Proposed ADR 0019](adr/0019-trust-methodology-evidence.md), accepted ADRs and [integration decisions](TRUST_PACKAGE_INTEGRATION.md) govern this specification.

## 1. Purpose

Finding provenance связывает конкретный finding с наблюдением, evidence, external intelligence, confidence, coverage и решением Risk Engine.

Контракт не создает второй Finding identity и не заменяет ADR-0013 fingerprint/coverage semantics.

## 2. Core invariant

Один user-visible finding должен иметь объяснимую цепочку:

`Finding ID -> Observation -> Evidence -> Intelligence -> Confidence -> Risk decision`.

Ни scanner severity, ни CVSS, ни один внешний feed сами по себе не являются OUTSCAN Risk.

## 3. Logical internal shape

Точные TypeScript/database имена Codex должен сопоставить с текущей моделью. Не создавать новую таблицу только потому, что она указана ниже.

```text
FindingProvenance
- schema_version
- finding_id
- occurrence_ref
- asset_ref
- product_capability_slug
- observed_at
- observation
- detection
- evidence
- intelligence[]
- confidence
- risk_decision
- coverage
- limitations[]
```

## 4. Observation

Минимальная семантика:

```text
Observation
- kind
- observed_at
- detector_family
- source_engine_class
- target_scope_ref
- normalized_fact
```

Примеры `kind`:

- `DNS_POSTURE`;
- `TLS_POSTURE`;
- `HTTP_SECURITY_POSTURE`;
- `TECHNOLOGY_FINGERPRINT`;
- `VULNERABILITY_MATCH`;
- `PASSIVE_INTELLIGENCE_MATCH`.

Не включать raw request/response в generic public observation.

## 5. Detection

Internal detection metadata может хранить необходимую reproducibility информацию:

```text
Detection
- scan_profile
- policy_version
- detector_id_or_family
- detector_version
- engine_binding_ref
- approved_artifact_ref
```

Public/user-safe projection исключает exact template ID, digest, scanner command и worker image.

## 6. Evidence

Evidence должен иметь два уровня:

### Private/internal evidence

Доступен только через действующие tenant/security boundaries и в объеме, который действительно нужен инженерам.

Возможные поля:

```text
Evidence
- evidence_class
- private_evidence_ref
- evidence_digest
- captured_at
- sanitizer_version
- bounded_size
```

### Safe evidence summary

Подходит для Workspace/Report.

Пример:

```text
SafeEvidenceSummary
- title
- summary
- observed_value
- expected_or_reference_state
- captured_at
```

Правила:

- не экспортировать secrets;
- не экспортировать cookies/bearer tokens/authorization headers;
- не экспортировать произвольный hostile HTML/JS как trusted markup;
- не экспортировать полный scanner stdout/stderr;
- применять size limits;
- сохранять исходное evidence как untrusted data.

## 7. Intelligence references

Каждый intelligence signal должен сохранять provenance, совместимый с `THREAT_INTELLIGENCE.md`.

```text
IntelligenceReference
- source
- source_record_id
- semantic_type
- value
- source_updated_at
- data_effective_at
- ingested_at
- parser_schema_version
- freshness_state
```

Примеры semantic type:

- `CVE_METADATA`;
- `CVSS`;
- `KNOWN_EXPLOITED`;
- `EXPLOITATION_PROBABILITY`;
- `AFFECTED_PRODUCT`.

## 8. Three-state rule for external signals

Binary fields из внешних feeds не должны терять `unknown`.

Для KEV использовать семантику:

```text
YES
NO_CONFIRMED_BY_CURRENT_DATASET
UNKNOWN_OR_STALE
```

Точное enum-имя может быть другим, но нельзя сводить отсутствующие данные к `false`.

Для EPSS:

```text
value = number | unknown
score_date = date | unknown
freshness = CURRENT | STALE | UNAVAILABLE | UNKNOWN
```

`unknown` не равен `0`.

## 9. Confidence

Сохранять canonical confidence без новой enum-шкалы. Текущий GUEST_SAFE input
использует integer 0–100, скрытый от Guest; tenant/report representation требует
versioned решения. Potential/probable/confirmed — editorial labels, пока отдельное
evidence-based mapping не принято.

Добавить объяснимый basis:

```text
ConfidenceBasis
- code
- summary
```

Пример basis codes:

- `FINGERPRINT_ONLY`;
- `VERSION_RANGE_MATCH`;
- `MULTI_SIGNAL_MATCH`;
- `TECHNICAL_CHECK_MATCHED`;
- `INSUFFICIENT_COVERAGE`;
- `STALE_INTELLIGENCE`.

Коды должны быть стабильными и versioned, если попадают в API/report schema.

## 10. Risk decision

```text
RiskDecision
- model_version
- priority
- evaluated_at
- major_factors[]
- explanation_summary
```

Major factors должны быть explainability projection, а не полным внутренним formula dump.

Пример:

```text
- CONFIRMED_DETECTION
- INTERNET_EXPOSED
- KEV_YES
- EPSS_HIGH
- CRITICAL_ASSET
```

Risk Engine остается единственным владельцем risk semantics.

## 11. Coverage linkage

Provenance должен ссылаться на фактическое coverage сканирования.

Минимально:

```text
CoverageReference
- scan_profile
- detector_group
- execution_status (SUCCESS | FAILED | TIMED_OUT | CANCELLED | SUPERSEDED)
- completeness (COMPLETE | PARTIAL | UNKNOWN | NOT_APPLICABLE)
- coverage_policy_version
```

Нельзя показывать finding как `not present`, если соответствующий detector group не был успешно выполнен в совместимом scan.

## 12. Public/user-safe projection

Пример логической projection:

```json
{
  "finding_id": "OUT-FND-...",
  "observed_at": "...",
  "capability": "vulnerability-detection",
  "detection_method": "Approved observation class",
  "confidence": 90,
  "evidence_summary": {
    "title": "...",
    "summary": "..."
  },
  "intelligence": [
    {
      "source": "CISA_KEV",
      "record_id": "CVE-...",
      "status": "YES",
      "data_effective_at": "...",
      "freshness": "CURRENT"
    }
  ],
  "risk": {
    "priority": "CRITICAL",
    "model_version": "...",
    "major_factors": ["KEV_YES"]
  },
  "limitations": []
}
```

Пример иллюстративный и относится к authenticated Workspace/Report, не Guest или anonymous API. Число 90 не означает CONFIRMED. Exact JSON schema должен следовать существующему API/report versioning.

## 13. Public forbidden fields

Публичная/user-safe projection не должна содержать:

- job/attempt/fence/lease IDs;
- ResultEnvelope MAC/signing metadata;
- template/workflow IDs/digests;
- internal scanner artifact/image name;
- scanner command/args;
- internal policy thresholds;
- queue IDs;
- private evidence storage keys;
- internal service URLs;
- credentials;
- raw headers that may contain secrets;
- raw hostile response body;
- tenant-external identifiers.

## 14. Report Snapshot integration

Snapshot фиксирует provenance, необходимый для воспроизводимости исторического отчета.

После snapshot finalization нельзя silently обновлять:

- intelligence values;
- source timestamps;
- confidence;
- risk priority;
- risk model version;
- evidence summary;
- coverage state;
- limitations.

Current Workspace может отдельно показывать live state, но обязан визуально отличать его от snapshot state.

## 15. API behavior

Не создавать отдельный public endpoint для raw provenance только ради этой функции.

Предпочтение:

- Workspace finding detail расширяется safe provenance;
- report JSON/MD/PDF получает snapshot provenance;
- public demo использует report projection;
- `/trust/status` показывает только source/method health, не customer findings.

## 16. Security tests

Обязательны проверки:

- cross-tenant evidence read denied;
- guessed private evidence ref denied;
- raw secret-like evidence redacted;
- hostile HTML/JS rendered as data, not executable markup;
- oversized evidence rejected/bounded;
- unknown intelligence remains unknown;
- stale KEV not rendered as `No`;
- missing EPSS not rendered as `0`;
- public projection has no internal template/worker identifiers;
- report snapshot keeps frozen provenance after live TI update;
- same Finding ID retains identity when priority/confidence changes;
- provenance cannot trigger scan or expand scope.

## 17. Acceptance

Finding provenance готов, когда технический пользователь может открыть finding и проверить происхождение ключевых утверждений, а security review подтверждает, что эта прозрачность не раскрывает internal execution controls, secrets или чужие tenant data.
