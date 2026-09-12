import copy
import io
import json
import unittest
from unittest.mock import patch, MagicMock
from scripts.b1_harness.commands import Executor
from scripts.b1_harness.config import names
from scripts.b1_harness.controller import baseline
from scripts.b1_harness.runtime import create_args, inspect_hardening, launch, arm_watchdog, verify_image
from scripts.b1_harness.state import owned_container, reconcile
from scripts.b1_harness.scenarios import resource_verdict

RUN = "bb48dd4c-dcf9-494a-a009-3b4fdfb09892"
IMAGE = "registry.invalid/b1@sha256:" + "a" * 64  # Test-only identity, never runnable evidence.


def container(role):
    return {"Id": ("a" if role == "anchor" else "b") * 64, "Name": "/" + names(RUN)[role],
            "AppArmorProfile": "docker-default",
            "Config": {"User": "1000:1000", "Labels": {"outscan.verification.owner": "b1-harness",
                        "outscan.verification.run": RUN}}, "Mounts": [],
            "HostConfig": {"NetworkMode": "none", "ReadonlyRootfs": True, "Privileged": False,
                "Memory": 268435456, "MemorySwap": 268435456, "NanoCpus": 500000000,
                "PidsLimit": 64, "IpcMode": "private", "CgroupnsMode": "private",
                "RestartPolicy": {"Name": "no"}, "CapDrop": ["ALL"],
                "SecurityOpt": ["no-new-privileges:true"]}}


class FakeJournal:
    run = RUN
    def __init__(self):
        self.data = {"phase": "ALLOCATED", "containers": {}, "namespaces": {}, "units": [],
                     "pending": [], "pendingContainers": []}
    def save(self):
        pass


class LifecycleTests(unittest.TestCase):
    def test_runtime_baseline_uses_docker_29_cpu_field_names(self):
        info = {"ServerVersion": "29.8.0", "CgroupVersion": "2", "CgroupDriver": "systemd",
                "Warnings": None, "KernelVersion": __import__("os").uname().release, "Containers": 0,
                "MemoryLimit": True, "SwapLimit": True, "CPUCfsPeriod": True,
                "CPUCfsQuota": True, "PidsLimit": True,
                "SecurityOptions": ["name=seccomp,profile=builtin"]}
        def execute(op, argv):
            args = argv[2:]
            if args[:2] == ["info", "--format"]:
                return json.dumps(info)
            if args[:3] == ["compose", "version", "--short"]:
                return "5.4.0"
            raise AssertionError(args)
        self.assertEqual(baseline(execute)["ServerVersion"], "29.8.0")
        changed = dict(info)
        changed.pop("CPUCfsPeriod")
        def missing(op, argv):
            args = argv[2:]
            return json.dumps(changed) if args[:2] == ["info", "--format"] else "5.4.0"
        with self.assertRaisesRegex(RuntimeError, "RESOURCE_SUPPORT"):
            baseline(missing)

    def test_image_rejects_implicit_volumes_before_creation(self):
        record = {"RepoDigests": [IMAGE], "Id": "sha256:" + "a"*64, "Os": "linux", "Architecture": "amd64",
                  "Config": {"User": "1000:1000", "WorkingDir": "/fixture",
                             "Entrypoint": ["/usr/local/bin/node", "/fixture/probe.mjs"], "Cmd": ["hold"]}}
        for bad in ({"Volumes": {"/data": {}}}, {"Healthcheck": {"Test": ["CMD", "bad"]}},
                    {"ExposedPorts": {"80/tcp": {}}}, {"Env": ["NODE_OPTIONS=bad"]}):
            altered = copy.deepcopy(record)
            altered["Config"].update(bad)
            calls = []
            def execute(op, args):
                calls.append(args)
                return json.dumps([altered])
            with self.assertRaises(RuntimeError):
                verify_image(execute, IMAGE)
            self.assertFalse(any("create" in args for args in calls))

    def test_oom_requires_kernel_flag_exit_and_cgroup_evidence(self):
        good = {"state": {"ExitCode": 137, "OOMKilled": True, "Running": False},
                "logs": '{"marker":"CGROUP_PASS"}', "elapsed": None}
        self.assertTrue(resource_verdict("memory", good))
        for field, value in (("ExitCode", 0), ("OOMKilled", False), ("Running", True)):
            changed = copy.deepcopy(good)
            changed["state"][field] = value
            self.assertFalse(resource_verdict("memory", changed))
        self.assertFalse(resource_verdict("memory", {**good, "logs": ""}))

    def test_kill_not_confused_with_oom_or_unbounded_stop(self):
        good = {"state": {"ExitCode": 137, "OOMKilled": False, "Running": False},
                "logs": '{"marker":"TERM_IGNORED"}', "elapsed": 1.2}
        self.assertTrue(resource_verdict("ignore-term", good))
        self.assertFalse(resource_verdict("ignore-term", {**good, "elapsed": 16}))
        self.assertFalse(resource_verdict("ignore-term", {**good, "logs": ""}))
        changed = copy.deepcopy(good)
        changed["state"]["OOMKilled"] = True
        self.assertFalse(resource_verdict("ignore-term", changed))

    def test_anchor_and_probe_topology(self):
        anchor = create_args(IMAGE, RUN, "anchor")
        probe = create_args(IMAGE, RUN, "probe", "a" * 64)
        self.assertEqual(anchor[anchor.index("--network")+1], "none")
        self.assertEqual(probe[probe.index("--network")+1], "container:" + "a"*64)
        self.assertEqual(probe[-3:], [IMAGE, "/fixture/probe.mjs", "hold"])
        self.assertIn("never", probe)
        for forbidden in ("--privileged", "--publish", "--volume", "--cap-add"):
            self.assertNotIn(forbidden, probe)

    def test_probe_cannot_create_before_verified_policy(self):
        called = []
        with self.assertRaisesRegex(RuntimeError, "POLICY_NOT_READY"):
            launch(FakeJournal(), lambda *args: called.append(args), IMAGE, "probe", "a"*64)
        self.assertEqual(called, [])

    def test_hardening_drift(self):
        inspect_hardening(container("anchor"), "none")
        for field, value in {"Memory": 536870912, "MemorySwap": -1, "NanoCpus": 0,
                             "PidsLimit": -1, "Privileged": True, "ReadonlyRootfs": False,
                             "NetworkMode": "host", "IpcMode": "host", "CgroupnsMode": "host",
                             "CapAdd": ["NET_ADMIN"], "PortBindings": {"80/tcp": [{}]}}.items():
            changed = container("anchor")
            changed["HostConfig"][field] = value
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                inspect_hardening(changed, "none")
        changed = container("anchor")
        changed["AppArmorProfile"] = ""
        with self.assertRaisesRegex(RuntimeError, "CONTAINER_BOUNDARY"):
            inspect_hardening(changed, "none")

    def test_ownership_requires_run_owner_and_name(self):
        for field in ("outscan.verification.owner", "outscan.verification.run"):
            changed = container("anchor")
            changed["Config"]["Labels"][field] = "foreign"
            self.assertFalse(owned_container(changed, RUN))
        changed = container("anchor")
        changed["Name"] = "/foreign"
        self.assertFalse(owned_container(changed, RUN))

    def test_reconcile_crash_after_create_discovers_unjournaled_container(self):
        calls = []
        remaining = [container("anchor"), container("probe")]
        def execute(op, argv):
            calls.append((op, argv))
            args = argv[2:]
            if args[0] == "ps":
                return "\n".join(r["Id"] for r in remaining)
            if args[0] == "inspect":
                return json.dumps([next(r for r in remaining if r["Id"] == args[1])])
            if args[0] == "rm":
                remaining[:] = [r for r in remaining if r["Id"] != args[-1]]
                return ""
            raise AssertionError(args)
        journal = FakeJournal()
        reconcile(journal, execute)
        removed = [argv[-1] for op, argv in calls if "rm" in argv]
        self.assertEqual(removed, ["b"*64, "a"*64])
        self.assertEqual(journal.data["cleanup"], "PASS")
        reconcile(journal, execute)  # Idempotent acknowledgement.

    def test_reconcile_pending_create_without_object_is_incomplete(self):
        journal = FakeJournal()
        journal.data["pendingContainers"] = ["anchor"]
        def execute(op, argv):
            args = argv[2:]
            if args[0] == "ps":
                return ""
            raise AssertionError(args)
        with self.assertRaisesRegex(RuntimeError, "UNACKNOWLEDGED_CONTAINER_CREATE"):
            reconcile(journal, execute)
        self.assertNotIn("cleanup", journal.data)

    def test_reconcile_foreign_label_conflict_deletes_nothing(self):
        changed = container("anchor")
        changed["Config"]["Labels"]["outscan.verification.owner"] = "foreign"
        calls = []
        def execute(op, argv):
            calls.append(argv)
            return "a"*64 if "ps" in argv else json.dumps([changed])
        with self.assertRaisesRegex(RuntimeError, "OWNERSHIP_CONFLICT"):
            reconcile(FakeJournal(), execute)
        self.assertFalse(any("rm" in c for c in calls))

    def test_daemon_failure_never_cleanup_pass(self):
        journal = FakeJournal()
        def failed(*args):
            raise RuntimeError("unavailable")
        with self.assertRaises(RuntimeError):
            reconcile(journal, failed)
        self.assertNotIn("cleanup", journal.data)

    def test_watchdog_is_independent_pid1_timer(self):
        calls = []
        def execute(op, args):
            calls.append((op, args))
            return "active" if op == "systemctl" else ""
        journal = FakeJournal()
        arm_watchdog(journal, execute)
        command = calls[0][1]
        self.assertIn("--on-active=600s", command)
        self.assertIn("--property=RuntimeMaxSec=180", command)
        self.assertEqual(command[-2:], ["watchdog", RUN])
        self.assertEqual(journal.data["watchdog"]["status"], "ARMED")

    def test_executor_sanitizes_and_never_shells(self):
        process = MagicMock()
        process.stdout = io.BytesIO(b"ok")
        process.returncode = 0
        with patch("subprocess.Popen", return_value=process) as popen:
            self.assertEqual(Executor()("docker", ["version"]), "ok")
        kwargs = popen.call_args.kwargs
        self.assertIs(kwargs["shell"], False)
        self.assertEqual(popen.call_args.args[0][0], "/usr/bin/docker")
        self.assertNotIn("HOME", kwargs["env"])
        self.assertNotIn("DOCKER_HOST", kwargs["env"])
        with self.assertRaises(ValueError):
            Executor()("sh", ["-c", "id"])


if __name__ == "__main__":
    unittest.main()
