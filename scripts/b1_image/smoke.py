"""Boundary-only smoke with an independent systemd deadline and owned cleanup."""
import json
import os
import re
from pathlib import Path
import time
from .core import OWNER, command, docker, image_contract, inspect, require
from scripts.b1_harness.runtime import inspect_hardening


def owned(info, run):
    labels = info.get("Config", {}).get("Labels", {})
    return (labels.get("outscan.verification.owner") == OWNER and
            labels.get("outscan.verification.run") == run and
            info.get("Name") == "/b1-image-smoke-" + run)


def cleanup(ctx, watchdog=False):
    if not ctx.state.get("run"):
        return
    run = ctx.state["run"]
    if not watchdog:
        ctx.status("cleanup", "INCOMPLETE")
    filters = ["--filter", "label=outscan.verification.owner=" + OWNER,
               "--filter", "label=outscan.verification.run=" + run]
    found = docker("ps", "--all", "--quiet", "--no-trunc", *filters).decode().split()
    removed = []
    for ident in found:
        info = json.loads(docker("container", "inspect", ident))[0]
        require(owned(info, run) and info["Id"] == ident, "CLEANUP_OWNERSHIP")
        prefix = "watchdog-" if watchdog else ""
        ctx.record(prefix + "smoke-cleanup-inspect.json", info)
        ctx.record(prefix + "smoke-cleanup-log.txt", docker("logs", ident))
        docker("rm", "--force", ident, timeout=15)
        removed.append(ident)
    require(not docker("ps", "--all", "--quiet", *filters).strip(), "CLEANUP_INCOMPLETE")
    record = "watchdog-cleanup.json" if watchdog else "cleanup.json"
    previous = ctx.evidence / record
    if previous.exists():
        removed = sorted(set(removed + json.loads(previous.read_text())["removed"]))
    pending = bool(ctx.state.get("pendingSmokeCreate"))
    ctx.record(record, {"result": "INCOMPLETE" if pending else "PASS", "removed": removed,
                        "remaining": [], "pendingSmokeCreate": pending,
                        "code": "UNACKNOWLEDGED_SMOKE_CREATE" if pending else None})
    require(not pending, "UNACKNOWLEDGED_SMOKE_CREATE")
    if not watchdog:
        ctx.mark("cleanup")


def timer(ctx, action):
    unit = "b1-image-smoke-" + ctx.state["run"]
    if action == "arm":
        entry = str(Path(__file__).with_name("entry.py").resolve())
        command(["/usr/bin/sudo", "-n", "/usr/bin/systemd-run", "--unit=" + unit,
                 "--on-active=30s", "--timer-property=AccuracySec=1s",
                 "--property=RuntimeMaxSec=30s", "--property=TimeoutStopSec=5s",
                 "--setenv=RUNNER_TEMP=" + os.environ["RUNNER_TEMP"],
                 "--setenv=HOME=" + os.environ["HOME"],
                 "/usr/bin/python3", "-I", entry, "watchdog"])
        active = command(["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "is-active", unit + ".timer"])
        require(active.strip() == b"active", "WATCHDOG_NOT_ARMED")
        ctx.state["timer"] = unit
        ctx.save()
        ctx.record("watchdog.json", {"unit": unit, "deadlineSeconds": 30, "status": "ARMED"})
    elif ctx.state.get("timer") == unit:
        command(["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "stop", unit + ".timer", unit + ".service"])


def smoke_args(ctx):
    return ["create", "--name", "b1-image-smoke-" + ctx.state["run"],
            "--label", "outscan.verification.owner=" + OWNER,
            "--label", "outscan.verification.run=" + ctx.state["run"],
            "--network", "none", "--read-only", "--user", "1000:1000",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            "--memory", "256m", "--memory-swap", "256m", "--cpus", "0.5", "--pids-limit", "64",
            "--ipc", "private", "--cgroupns", "private", "--restart", "no", "--pull", "never",
            "--log-driver", "local", "--log-opt", "max-size=256k", "--log-opt", "max-file=1",
            ctx.state["image_id"], "boundary"]


def create_smoke(ctx):
    require(not ctx.state.get("pendingSmokeCreate"), "UNACKNOWLEDGED_SMOKE_CREATE")
    ctx.state["pendingSmokeCreate"] = True
    ctx.status("cleanup", "INCOMPLETE")
    ident = docker(*smoke_args(ctx), timeout=10).decode().strip()
    require(bool(re.fullmatch(r"[a-f0-9]{64}", ident)), "SMOKE_ID")
    info = json.loads(docker("container", "inspect", ident, timeout=5))[0]
    require(info.get("Id") == ident and owned(info, ctx.state["run"]), "SMOKE_OWNERSHIP")
    ctx.state["smokeContainerId"] = ident
    ctx.state["pendingSmokeCreate"] = False
    ctx.save()
    return ident, info


def smoke(ctx):
    require(ctx.state.get("contract") == "PASS", "CONTRACT_REQUIRED")
    require(image_contract(inspect(ctx.state["image_id"])) == ctx.state["identity"], "IMAGE_DRIFT")
    deadline = time.monotonic() + 25
    try:
        ident, info = create_smoke(ctx)
        inspect_hardening(info, "none")
        docker("start", ident, timeout=5)
        code = docker("wait", ident, timeout=max(1, deadline - time.monotonic())).decode().strip()
        info = json.loads(docker("container", "inspect", ident, timeout=5))[0]
        logs = docker("logs", ident, timeout=5)
        ctx.record("smoke-inspect.json", info)
        ctx.record("smoke-log.txt", logs)
        ctx.record("smoke-exit.json", {"exit": code, "state": info["State"]})
        records = [json.loads(line) for line in logs.decode().splitlines()]
        require(code == "0" and info["State"]["ExitCode"] == 0 and not info["State"]["OOMKilled"]
                and not info["State"]["Running"] and len(records) == 1
                and records[0].get("marker") == "BOUNDARY_PASS", "SMOKE_FAILED")
        require(time.monotonic() < deadline, "SMOKE_DEADLINE")
    finally:
        cleanup(ctx)
    require(not (ctx.evidence / "watchdog-fired.json").exists(), "WATCHDOG_FIRED")
    ctx.mark("smoke")


def smoke_service(ctx):
    # PID 1 bounds the controller and all Docker CLI children, including a hung create.
    unit = "b1-image-smoke-" + ctx.state["run"] + "-controller"
    ctx.state["controller_unit"] = unit
    ctx.save()
    timer(ctx, "arm")
    entry = str(Path(__file__).with_name("entry.py").resolve())
    try:
        command(["/usr/bin/sudo", "-n", "/usr/bin/systemd-run", "--unit=" + unit,
                 "--wait", "--pipe", "--uid=" + str(os.getuid()),
                 "--property=RuntimeMaxSec=25s", "--property=TimeoutStopSec=1s",
                 "--property=KillMode=control-group",
                 "--setenv=RUNNER_TEMP=" + os.environ["RUNNER_TEMP"],
                 "--setenv=HOME=" + os.environ["HOME"],
                 "/usr/bin/python3", "-I", entry, "smoke"], timeout=35)
    finally:
        stop_controller(ctx)
        ctx.state = json.loads(ctx.state_path.read_text())
        cleanup(ctx)
        timer(ctx, "stop")
    require(ctx.state.get("smoke") == "PASS", "SMOKE_SERVICE_FAILED")
    require(not (ctx.evidence / "watchdog-fired.json").exists(), "WATCHDOG_FIRED")


def stop_controller(ctx):
    unit = "b1-image-smoke-" + ctx.state["run"] + "-controller"
    require(ctx.state.get("controller_unit") == unit, "CONTROLLER_OWNER")
    command(["/usr/bin/sudo", "-n", "/usr/bin/systemctl", "stop", unit], timeout=10)
