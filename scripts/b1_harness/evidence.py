"""Closed result format; never derive a gate PASS from incomplete evidence."""
import hashlib
import json

STATUSES = {"PASS", "FAIL", "INCONCLUSIVE", "NOT_YET_RUN"}


def result(case, status, observations):
    if status not in STATUSES or not isinstance(observations, dict):
        raise ValueError("EVIDENCE_STATUS")
    return {"case": case, "status": status, "observations": observations}


def report(run, manifest, results, cleanup):
    if not results:
        status = "NOT_YET_RUN"
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
            "cleanup": cleanup, "cases": results}
