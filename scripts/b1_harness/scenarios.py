"""Bounded evidence collection from main-process probes (never docker exec)."""
import json
import time
from pathlib import Path
from .commands import BIN, docker
from .config import names
from .evidence import result
from .policy import DESTINATIONS, DNS, deny_result
from .runtime import ENTRY, launch
from .topology import anchor_exec, deny_counters

LISTENER = str(Path(ENTRY).with_name("listener.py"))


def fixture_service(journal, execute, pid, role):
    n = names(journal.run)
    unit = n["unit"] + "-" + role + ".service"
    receipt = journal.path / (role + ".jsonl")
    args = ([BIN["nsenter"], "--target", str(pid), "--net"] if role == "loopback"
            else [BIN["ip"], "netns", "exec", n["router" if role == "linklocal" else "fixture"]])
    addresses = {"loopback": "127.0.0.1,::1", "linklocal": "fe80::123",
                 "fixture": ",".join(a for a in DESTINATIONS if a != "fe80::123")}[role]
    # Journal intent BEFORE starting service. Unit names are derived from run UUID.
    journal.data["units"].append(unit)
    journal.save()
    execute("systemd-run", ["--unit", unit, "--description=outscan-run=" + journal.run, "--property=RuntimeMaxSec=540",
            "--property=TimeoutStopSec=3", "--property=KillMode=control-group", "--property=UMask=0077", "--property=MemoryMax=64M",
            "--property=TasksMax=16", *args, BIN["python"], "-I", LISTENER,
            "serve", addresses, str(receipt)])
    end = time.monotonic() + 5
    while not receipt.exists() and time.monotonic() < end:
        time.sleep(0.05)
    if not receipt.exists():
        raise RuntimeError("FIXTURE_NOT_READY")
    return receipt


def receipt_count(path):
    if path.stat().st_size > 262144:
        raise RuntimeError("RECEIPT_BOUND")
    return len(path.read_text().splitlines())


def control(execute, pid, address):
    try:
        value = anchor_exec(execute, pid, "python", ["-I", LISTENER, "control", address, "18080", "tcp"])
        return value == "CONTROL_PASS"
    except RuntimeError:
        return False


def probe(journal, execute, image, anchor, mode, parameters=(), cancellation=False):
    ident, _ = launch(journal, execute, image, "probe", anchor, mode, parameters)
    try:
        if cancellation:
            deadline = time.monotonic() + 5
            while '"READY"' not in docker(execute, "logs", ident):
                if time.monotonic() >= deadline:
                    raise RuntimeError("PROBE_NOT_READY")
                time.sleep(0.05)
            began = time.monotonic()
            docker(execute, "stop", "--time", "1", ident)
            elapsed = time.monotonic() - began
        else:
            docker(execute, "wait", ident)
            elapsed = None
        info = json.loads(docker(execute, "inspect", ident))[0]
        logs = docker(execute, "logs", ident)
        return {"state": info["State"], "logs": logs, "elapsed": elapsed}
    finally:
        docker(execute, "rm", "--force", ident)
        # Successful daemon response required: failure is not absence.
        if docker(execute, "ps", "-aq", "--filter", "id=" + ident):
            raise RuntimeError("PROBE_CLEANUP")


def network_cases(journal, execute, image, anchor, pid, paths, precontrols):
    cases = [(ip, 18080, "tcp") for ip in DESTINATIONS]
    cases += [(ip, 18080, "tcp") for ip in ["127.0.0.1", "::1", "::ffff:127.0.0.1",
              "::ffff:10.1.2.3", "::ffff:169.254.169.254"]]
    cases += [("10.1.2.3", port, "tcp") for port in (5432, 6379, 8443)]
    cases += [(ip, port, protocol) for ip in (DNS, "198.18.18.19")
              for port in (53, 853, 443) for protocol in ("tcp", "udp")]
    ipv6_working = precontrols.get("fc00::123", False)
    for address, port, protocol in cases:
        journal.phase("POLICY_VERIFIED")
        if ":" in address and not address.startswith("::ffff:") and not ipv6_working:
            journal.data["results"].append(result(f"network/{address}/{port}/{protocol}",
                "INCONCLUSIVE", {"reason": "IPV6_POSITIVE_PATH_UNAVAILABLE", "attempted": False}))
            journal.save()
            continue
        loopback = address in ("127.0.0.1", "::1", "::ffff:127.0.0.1")
        path = paths["loopback" if loopback else "linklocal" if address == "fe80::123" else "fixture"]
        base_address = address.removeprefix("::ffff:")
        before_control = control(execute, pid, base_address)
        receipts_before = receipt_count(path)
        before = deny_counters(execute, pid)
        target = address + "%b1p" if address == "fe80::123" else address
        observation = probe(journal, execute, image, anchor, "attempt", (target, str(port), protocol))
        after = deny_counters(execute, pid)
        receipts_after = receipt_count(path)
        after_control = control(execute, pid, base_address)
        attempt = next((json.loads(line) for line in observation["logs"].splitlines()
                        if '"ATTEMPT"' in line), None)
        controls = [precontrols.get(base_address, False), before_control, after_control]
        if ":" in address and not address.startswith("::ffff:"):
            controls.append(ipv6_working)
        if address == DNS and port == 53:
            status = "PASS" if attempt and attempt["outcome"] == "RECEIVED" and all(controls) else "INCONCLUSIVE"
        else:
            status = deny_result(sum(before.values()), sum(after.values()), receipts_before,
                                 receipts_after, bool(attempt), controls)
            if attempt and attempt["outcome"] in ("RECEIVED", "INVALID_RESPONSE"):
                status = "FAIL"
        journal.data["results"].append(result(f"network/{address}/{port}/{protocol}", status,
            {"attempt": attempt, "countersBefore": before, "countersAfter": after,
             "receiptsBefore": receipts_before, "receiptsAfter": receipts_after, "controls": controls}))
        journal.save()


def resource_verdict(mode, value):
    state, logs = value["state"], value["logs"]
    if state.get("Running"):
        return False
    if mode == "memory":
        return state["ExitCode"] == 137 and state["OOMKilled"] is True and '"CGROUP_PASS"' in logs
    if mode == "ignore-term":
        return state["ExitCode"] == 137 and state["OOMKilled"] is False and '"TERM_IGNORED"' in logs and value["elapsed"] < 15
    marker = {"boundary": "BOUNDARY_PASS", "cpu": "CPU_PASS", "pids": "PIDS_PASS", "term": "TERM_ACK"}[mode]
    ok = state["ExitCode"] == 0 and state["OOMKilled"] is False and marker in logs
    return ok and (mode != "term" or value["elapsed"] < 15)


def resource_cases(journal, execute, image, anchor):
    for mode in ("boundary", "memory", "cpu", "pids", "term", "ignore-term"):
        journal.phase("POLICY_VERIFIED")
        value = probe(journal, execute, image, anchor, mode, cancellation=mode in ("term", "ignore-term"))
        state, logs = value["state"], value["logs"]
        ok = resource_verdict(mode, value)
        journal.data["results"].append(result(mode, "PASS" if ok else "FAIL",
                                              {"exitCode": state["ExitCode"], "oomKilled": state["OOMKilled"],
                                               "logs": logs, "elapsed": value["elapsed"], "containerGone": True}))
        journal.save()
