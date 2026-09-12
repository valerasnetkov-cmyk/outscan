"""Docker lifecycle and independent systemd timer; no app/scanner execution."""
import json
from .commands import BIN, docker
from .config import OWNER, names

ENTRY = "/opt/outscan-b1/scripts/b1_harness/entry.py"


def create_args(image, run, role, anchor=None, mode="hold", parameters=()):
    name = names(run)[role]
    network = "none" if role == "anchor" else "container:" + anchor
    return ["create", "--name", name, "--label", "outscan.verification.owner=" + OWNER,
            "--label", "outscan.verification.run=" + run,
            "--label", "outscan.verification.role=" + role,
            "--network", network, "--user", "1000:1000", "--read-only", "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges:true", "--memory", "256m",
            "--memory-swap", "256m", "--cpus", "0.5", "--pids-limit", "64",
            "--ipc", "private", "--cgroupns", "private", "--restart", "no",
            "--pull", "never", "--log-driver", "local", "--log-opt", "max-size=256k",
            "--log-opt", "max-file=1", "--entrypoint", "/usr/local/bin/node",
            image, "/fixture/probe.mjs", mode, *parameters]


def inspect_hardening(info, network):
    host = info["HostConfig"]
    required = {"NetworkMode": network, "ReadonlyRootfs": True, "Privileged": False,
                "Memory": 268435456, "MemorySwap": 268435456, "NanoCpus": 500000000,
                "PidsLimit": 64, "IpcMode": "private", "CgroupnsMode": "private"}
    if any(host.get(k) != v for k, v in required.items()):
        raise RuntimeError("CONTAINER_HARDENING")
    if (info["Config"]["User"] != "1000:1000" or info["Mounts"] or
            host.get("PortBindings") or host.get("CapAdd") or host.get("Devices") or
            host.get("PidMode") or host.get("RestartPolicy", {}).get("Name") != "no" or
            host.get("CapDrop") != ["ALL"] or
            "no-new-privileges:true" not in host.get("SecurityOpt", [])):
        raise RuntimeError("CONTAINER_BOUNDARY")
    env = info["Config"].get("Env", [])
    keys = [entry.split("=", 1)[0] for entry in env]
    if len(keys) != len(set(keys)) or any(k not in ("PATH", "NODE_VERSION", "YARN_VERSION") for k in keys):
        raise RuntimeError("IMAGE_ENVIRONMENT")


def arm_watchdog(journal, execute):
    unit = names(journal.run)["unit"] + "-watchdog"
    # PID 1 owns the timer and later cleanup service; SSH/controller failure cannot cancel it.
    execute("systemd-run", ["--unit", unit, "--on-active=600s", "--timer-property=AccuracySec=1s",
            "--property=RuntimeMaxSec=180", "--property=TimeoutStopSec=5",
            "--property=UMask=0077", BIN["python"], "-I", ENTRY, "watchdog", journal.run])
    if execute("systemctl", ["is-active", unit + ".timer"]) != "active":
        raise RuntimeError("WATCHDOG_NOT_ARMED")
    journal.data["watchdog"] = {"unit": unit, "status": "ARMED", "deadlineSeconds": 600}
    journal.save()


def verify_image(execute, reference):
    info = json.loads(docker(execute, "image", "inspect", reference))[0]
    if reference not in info.get("RepoDigests", []) or not info["Id"].startswith("sha256:"):
        raise RuntimeError("IMAGE_IDENTITY_UNVERIFIED")
    if info["Os"] != "linux" or info["Architecture"] != "amd64":
        raise RuntimeError("IMAGE_PLATFORM")
    config = info.get("Config", {})
    # Reject auto-created anonymous volumes or inherited healthcheck processes
    # BEFORE docker create, not after they have already escaped the ownership map.
    if (config.get("Volumes") or config.get("ExposedPorts") or config.get("Healthcheck") or
            config.get("User") != "1000:1000" or config.get("WorkingDir") != "/fixture" or
            config.get("Entrypoint") != ["/usr/local/bin/node", "/fixture/probe.mjs"] or
            config.get("Cmd") != ["hold"]):
        raise RuntimeError("IMAGE_CONFIG")
    env = config.get("Env", [])
    keys = [entry.split("=", 1)[0] for entry in env]
    if len(keys) != len(set(keys)) or any(k not in ("PATH", "NODE_VERSION", "YARN_VERSION") for k in keys):
        raise RuntimeError("IMAGE_ENVIRONMENT")
    return info["Id"]


def launch(journal, execute, image, role, anchor=None, mode="hold", parameters=()):
    if role == "probe" and journal.data["phase"] != "POLICY_VERIFIED":
        raise RuntimeError("POLICY_NOT_READY")
    ident = docker(execute, *create_args(image, journal.run, role, anchor, mode, parameters))
    info = json.loads(docker(execute, "inspect", ident))[0]
    from .state import owned_container
    if not owned_container(info, journal.run):
        raise RuntimeError("OWNERSHIP")
    inspect_hardening(info, "none" if role == "anchor" else "container:" + anchor)
    journal.data["containers"][role] = ident
    journal.save()
    docker(execute, "start", ident)
    info = json.loads(docker(execute, "inspect", ident))[0]
    if role == "anchor" and (not info["State"]["Running"] or info["State"]["Pid"] <= 1):
        raise RuntimeError("ANCHOR_NOT_RUNNING")
    return ident, info["State"]["Pid"]
