"""Root-owned journals, locking and conservative identity-bound reconciliation."""
import json
import os
import secrets
import stat
import time
from pathlib import Path
from .config import OWNER, names, run_id, read_json
from .commands import docker

BASE = Path("/var/lib/outscan-b1/runs")


def trusted(path, directory=False):
    path = Path(path)
    for entry in [path, *path.parents]:
        meta = entry.lstat()
        if stat.S_ISLNK(meta.st_mode) or meta.st_uid != 0 or meta.st_mode & 0o022:
            raise ValueError("UNTRUSTED_PATH")
    if directory and not path.is_dir():
        raise ValueError("NOT_DIRECTORY")


class Journal:
    def __init__(self, run, create=False):
        self.run = run_id(run)
        trusted(BASE, True)
        self.path = BASE / run
        if create:
            self.path.mkdir(mode=0o700)
        trusted(self.path, True)
        lock = self.path / "lock"
        fd = os.open(lock, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
        import fcntl
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BaseException:
            os.close(fd)
            raise RuntimeError("RUN_LOCKED") from None
        self.fd = fd
        if create:
            self.data = {"run": run, "owner": OWNER, "deadline": time.monotonic() + 600,
                         "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip(),
                         "phase": "ALLOCATED", "namespaces": {}, "containers": {},
                         "pendingContainers": [], "units": [], "pending": [], "results": []}
            self.save()
        else:
            trusted(self.path / "state.json")
            self.data = read_json(self.path / "state.json", 4194304)
            if self.data.get("run") != run or self.data.get("owner") != OWNER:
                raise ValueError("JOURNAL_IDENTITY")
            self.data.setdefault("pendingContainers", [])

    def save(self):
        if len(json.dumps(self.data)) > 4194304:
            raise RuntimeError("JOURNAL_BOUND")
        target = self.path / ("state." + str(os.getpid()) + "." + secrets.token_hex(8) + ".new")
        fd = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, "w") as handle:
                json.dump(self.data, handle, sort_keys=True)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(target, self.path / "state.json")
            directory = os.open(self.path, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
        finally:
            if target.exists():
                target.unlink()

    def phase(self, value):
        if time.monotonic() >= self.data["deadline"] - 60:
            raise RuntimeError("RUN_DEADLINE")
        self.data["phase"] = value
        self.save()

    def close(self):
        os.close(self.fd)


def owned_container(info, run):
    labels = info["Config"].get("Labels") or {}
    allowed = names(run)
    return (labels.get("outscan.verification.owner") == OWNER and
            labels.get("outscan.verification.run") == run and
            info["Name"].lstrip("/") in (allowed["anchor"], allowed["probe"]) and
            len(info["Id"]) == 64)


def discover_owned(journal, execute):
    run = journal.run
    found = docker(execute, "ps", "-aq", "--no-trunc", "--filter",
                   "label=outscan.verification.run=" + run).splitlines()
    records = [json.loads(docker(execute, "inspect", ident))[0] for ident in found]
    if any(not owned_container(item, run) for item in records):
        raise RuntimeError("OWNERSHIP_CONFLICT")
    return records


def reconcile(journal, execute):
    """Do not interpret daemon/namespace uncertainty as absence."""
    run = journal.run
    records = discover_owned(journal, execute)
    pending = list(journal.data.get("pendingContainers", []))
    if pending:
        # A timed-out docker create may still commit asynchronously. Re-read before
        # declaring cleanup complete; unresolved create intent is fail-closed.
        for _ in range(3):
            time.sleep(0.2)
            again = discover_owned(journal, execute)
            by_id = {item["Id"]: item for item in [*records, *again]}
            records = list(by_id.values())
        discovered_roles = {item["Config"].get("Labels", {}).get("outscan.verification.role")
                            for item in records}
        unresolved = [role for role in pending if role not in discovered_roles]
        if unresolved:
            raise RuntimeError("UNACKNOWLEDGED_CONTAINER_CREATE")
        journal.data["pendingContainers"] = []
        journal.save()
    history = journal.data.setdefault("reconciliation", [])
    if len(history) >= 16:
        raise RuntimeError("RECONCILIATION_HISTORY_BOUND")
    history.append({"containers": [item["Id"] for item in records],
                    "namespaceIdentities": dict(journal.data["namespaces"])})
    journal.save()
    # Stop/delete probes first, retain anchor namespace until fixture services stop.
    for item in records:
        if item["Name"].lstrip("/") == names(run)["probe"]:
            docker(execute, "rm", "--force", item["Id"])
    for unit in journal.data["units"]:
        if not unit.startswith(names(run)["unit"] + "-"):
            raise RuntimeError("UNIT_OWNERSHIP")
        properties = execute("systemctl", ["show", unit, "--property=LoadState,Description"])
        if "LoadState=not-found" not in properties:
            if "Description=outscan-run=" + run not in properties:
                raise RuntimeError("UNIT_IDENTITY")
            execute("systemctl", ["stop", unit])
    for item in records:
        if item["Name"].lstrip("/") == names(run)["anchor"]:
            docker(execute, "rm", "--force", item["Id"])
    allowed_ns = {names(run)["router"], names(run)["fixture"]}
    for name, inode in journal.data["namespaces"].items():
        if name not in allowed_ns:
            raise RuntimeError("NAMESPACE_NAME")
        path = Path("/run/netns") / name
        if path.exists():
            if path.stat().st_ino != inode:
                raise RuntimeError("NAMESPACE_IDENTITY")
            if execute("ip", ["netns", "pids", name]):
                raise RuntimeError("NAMESPACE_STILL_IN_USE")
            execute("ip", ["netns", "delete", name])
            if path.exists():
                raise RuntimeError("NAMESPACE_CLEANUP_INCOMPLETE")
    for name in journal.data["pending"]:
        if (Path("/run/netns") / name).exists() and name not in journal.data["namespaces"]:
            raise RuntimeError("UNACKNOWLEDGED_NAMESPACE")
    remaining = docker(execute, "ps", "-aq", "--filter", "label=outscan.verification.run=" + run)
    if remaining:
        raise RuntimeError("CLEANUP_INCOMPLETE")
    if journal.data.get("pendingContainers"):
        raise RuntimeError("PENDING_CONTAINER_CREATE")
    journal.data["cleanup"] = "PASS"
    journal.save()
