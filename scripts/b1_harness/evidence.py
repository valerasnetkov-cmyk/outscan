"""Closed result format; never derive a gate PASS from incomplete evidence."""
import hashlib
import json

STATUSES = {"PASS", "FAIL", "INCONCLUSIVE", "NOT_YET_RUN"}


def result(case, status, observations):
    if status not in STATUSES or not isinstance(observations, dict):
        raise ValueError("EVIDENCE_STATUS")
    return {"case": case, "status": status, "observations": observations}


def report(run, manifest, results, cleanup, required_cases=()):
    case_ids = [item.get("case") for item in results]
    duplicate_cases = sorted({case for case in case_ids if case_ids.count(case) > 1})
    missing_cases = sorted(set(required_cases) - set(case_ids))
    unexpected_cases = sorted(set(case_ids) - set(required_cases)) if required_cases else []
    profile_complete = not duplicate_cases and not missing_cases and not unexpected_cases
    if not results:
        status = "NOT_YET_RUN"
    elif not profile_complete:
        status = "FAIL"
    elif any(r["status"] == "FAIL" for r in results) or cleanup != "PASS":
        status = "FAIL"
    elif any(r["status"] != "PASS" for r in results):
        status = "INCONCLUSIVE"
    else:
        status = "PASS"
    return {"schemaVersion": "b1-evidence-v1", "run": run, "status": status,
            "scope": "synthetic-namespace-harness-only", "gateB1": "IN PROGRESS",
            "image": manifest["image"], "policyVersion": manifest["policyVersion"],
            "manifestSha256": hashlib.sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
            "cleanup": cleanup, "profile": {"name": "b1-isolation-v1", "complete": profile_complete,
            "missingCases": missing_cases, "duplicateCases": duplicate_cases,
            "unexpectedCases": unexpected_cases}, "cases": results}
