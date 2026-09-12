"""CLI orchestration. Privileged execution requires reviewed root-owned install."""
import json
import os
import sys
import time
import uuid
from pathlib import Path
from .commands import Executor, docker
from .config import DATA, names, read_json, run_id, validate
from .evidence import report, result
from .policy import DESTINATIONS, rules
from .runtime import ENTRY, arm_watchdog, launch, verify_image
from .scenarios import control, fixture_service, network_cases, resource_cases
from .state import BASE, Journal, reconcile, trusted
from .topology import install_policy, make_network


def privileged():
    if sys.platform != "linux" or os.geteuid() != 0:
        raise RuntimeError("ROOT_LINUX_REQUIRED")
    if Path(__file__).resolve().parent != Path(ENTRY).parent:
        raise RuntimeError("REVIEWED_INSTALL_REQUIRED")
    # No writable or symlinked controller/modules/policy data; Python has -I.
    root = Path("/opt/outscan-b1")
    for item in [root, *root.rglob("*")]:
        trusted(item)
    trusted(BASE, True)


def baseline(execute):
    info = json.loads(docker(execute, "info", "--format", "{{json .}}"))
    if (info["ServerVersion"] != "29.8.0" or info["CgroupVersion"] != "2" or
            info["CgroupDriver"] != "systemd" or info["Warnings"] not in (None, []) or
            info["KernelVersion"] != os.uname().release or info["Containers"] != 0):
        raise RuntimeError("RUNTIME_BASELINE")
    for field in ("MemoryLimit", "SwapLimit", "CpuCfsPeriod", "CpuCfsQuota", "PidsLimit"):
        if info.get(field) is not True:
            raise RuntimeError("RESOURCE_SUPPORT")
    if "name=seccomp,profile=builtin" not in info["SecurityOptions"]:
        raise RuntimeError("SECCOMP_REQUIRED")
    if docker(execute, "compose", "version", "--short").lstrip("v") != "5.4.0":
        raise RuntimeError("COMPOSE_VERSION")
    return {k: info[k] for k in ("ServerVersion", "KernelVersion", "CgroupVersion", "CgroupDriver")}


def snapshot(execute):
    def stable_rules(tool):
        return "\n".join(line for line in execute(tool, []).splitlines() if line and not line.startswith("#"))
    return {"ipv4": stable_rules("iptables-save"), "ipv6": stable_rules("ip6tables-save"),
            "routes": execute("ip", ["-j", "route", "show", "table", "all"]),
            "routes6": execute("ip", ["-j", "-6", "route", "show", "table", "all"]),
            "links": execute("ip", ["-j", "link", "show"]),
            "listeners": sorted(execute("ss", ["-H", "-lnt"]).splitlines()),
            "forwarding": execute("sysctl", ["net.ipv4.ip_forward", "net.ipv6.conf.all.forwarding"]),
            "services": execute("systemctl", ["is-active", "docker", "containerd", "ssh", "nginx"])}


def execute_run(manifest, execute, fault=False):
    privileged()
    validate(manifest, runnable=True)
    observed = baseline(execute)
    image_id = verify_image(execute, manifest["image"])
    controller_unit = "outscan-b1-controller.service"
    if not Path("/proc/self/cgroup").read_text().strip().endswith("/" + controller_unit):
        raise RuntimeError("CONTROLLER_SYSTEMD_UNIT_REQUIRED")
    service = execute("systemctl", ["show", controller_unit, "--property=KillMode,RuntimeMaxUSec,TimeoutStopUSec"])
    if not all(field in service.splitlines() for field in
               ("KillMode=control-group", "RuntimeMaxUSec=9min", "TimeoutStopUSec=5s")):
        raise RuntimeError("CONTROLLER_SERVICE_BOUNDS")
    invocation = execute("systemctl", ["show", controller_unit, "--property=InvocationID", "--value"])
    if len(invocation) != 32 or any(c not in "0123456789abcdef" for c in invocation):
        raise RuntimeError("CONTROLLER_INVOCATION_ID")
    run = str(uuid.uuid4())
    journal = Journal(run, create=True)
    print(json.dumps({"run": run, "state": str(journal.path)}), flush=True)
    journal.data.update({"manifest": manifest, "runtime": observed, "imageId": image_id,
                         "controllerUnit": controller_unit, "controllerInvocation": invocation})
    journal.save()
    try:
        arm_watchdog(journal, execute)
        journal.data["before"] = snapshot(execute)
        journal.save()
        anchor, pid = launch(journal, execute, manifest["image"], "anchor")
        journal.phase("ANCHOR_STARTED")
        make_network(journal, execute, pid)
        paths = {role: fixture_service(journal, execute, pid, role) for role in ("fixture", "loopback", "linklocal")}
        precontrols = {address: control(execute, pid, address) for address in [*DESTINATIONS, "127.0.0.1", "::1"]}
        journal.data["positiveControlsBeforePolicy"] = precontrols
        journal.save()
        install_policy(journal, execute, pid, manifest)
        if fault:
            launch(journal, execute, manifest["image"], "probe", anchor, "hold")
            journal.data["fault"] = "CONTROLLER_EXIT_WITH_ORPHANS"
            journal.save()
            # Deliberate child/controller failure; watchdog remains owned by PID 1.
            os._exit(70)
        network_cases(journal, execute, manifest["image"], anchor, pid, paths, precontrols)
        resource_cases(journal, execute, manifest["image"], anchor)
        # Crash recovery is tested offline; never silently claim live evidence.
        journal.data["results"].append(result("live-controller-crash-reconciliation", "NOT_YET_RUN", {}))
    except Exception as error:
        journal.data["results"].append(result("controller", "FAIL", {"error": type(error).__name__}))
    finally:
        try:
            reconcile(journal, execute)
            after = snapshot(execute)
            journal.data["after"] = after
            unchanged = after == journal.data.get("before")
            journal.data["results"].append(result("host-unchanged", "PASS" if unchanged else "INCONCLUSIVE", {}))
            unit = names(run)["unit"] + "-watchdog.timer"
            execute("systemctl", ["stop", unit])
            journal.data["watchdog"]["status"] = "DISARMED_AFTER_CLEANUP"
        except Exception:
            journal.data["cleanup"] = "INCOMPLETE"
        evidence = report(run, manifest, journal.data["results"], journal.data.get("cleanup", "INCOMPLETE"))
        journal.data["report"] = evidence
        journal.save()
        journal.close()
    return evidence


def watchdog(run, execute):
    privileged()
    run_id(run)
    path = BASE / run
    trusted(path, True)
    trusted(path / "state.json")
    data = read_json(path / "state.json", 4194304)
    boot = Path("/proc/sys/kernel/random/boot_id").read_text().strip()
    if data.get("run") != run or data.get("bootId") != boot or time.monotonic() < data["deadline"]:
        raise RuntimeError("WATCHDOG_DEADLINE")
    status = path / "watchdog-status.json"
    # Independent status survives controller lock/failure.
    fd = os.open(status, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write('{"status":"FIRED"}\n')
    unit = data["controllerUnit"]
    if unit != "outscan-b1-controller.service":
        raise RuntimeError("CONTROLLER_UNIT_IDENTITY")
    properties = execute("systemctl", ["show", unit, "--property=LoadState,InvocationID"])
    if "LoadState=not-found" not in properties:
        if "InvocationID=" + data["controllerInvocation"] not in properties:
            raise RuntimeError("CONTROLLER_INVOCATION_CHANGED")
        # Stops the whole cgroup, including a blocked Docker/ip child, not just Python.
        execute("systemctl", ["stop", unit])
    journal = Journal(run)
    try:
        reconcile(journal, execute)
        journal.data["watchdog"]["status"] = "CLEANUP_PASS"
        journal.save()
    finally:
        journal.close()


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2 or args[0] not in ("validate", "plan", "run", "fault-run", "reconcile", "watchdog"):
        raise ValueError("USAGE: validate|plan|run MANIFEST; reconcile|watchdog RUN_UUID")
    action, value = args
    if action in ("reconcile", "watchdog"):
        privileged()
        if action == "watchdog":
            watchdog(value, Executor())
        else:
            journal = Journal(value)
            try:
                reconcile(journal, Executor())
            finally:
                journal.close()
        return
    if action in ("run", "fault-run"):
        privileged()
        trusted(Path(value))
    manifest = validate(read_json(value), runnable=action in ("run", "fault-run"))
    if action == "validate":
        output = {"valid": True, "hasImmutableReference": manifest["image"] is not None,
                  "runtimeVerified": False, "runnable": False}
    elif action == "plan":
        output = {"manifest": manifest, "ruleset": rules(manifest), "status": "NOT_YET_RUN"}
    else:
        output = execute_run(manifest, Executor(), fault=action == "fault-run")
    print(json.dumps(output, indent=2))
    if action == "run" and output["status"] != "PASS":
        raise SystemExit(1)
