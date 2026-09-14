"""Revision provenance and ambiguous-create regressions, entirely offline."""
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from scripts.b1_image.build import source
from scripts.b1_image.core import BASE, Context, EPOCH, FILES, OWNER, REVISION, publication_gate
from scripts.b1_image.smoke import cleanup, create_smoke
from test_contracts import DIGEST, RUN

CONTAINER = "d" * 64  # Synthetic identities, never approved execution inputs.


class Remediation(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        env = patch.dict(os.environ, {"RUNNER_TEMP": self.temporary.name})
        env.start()
        self.addCleanup(env.stop)
        self.ctx = Context()
        self.ctx.state = {"run": RUN, "image_id": DIGEST}

    def container(self, owner=OWNER):
        return {"Id": CONTAINER, "Name": "/b1-image-smoke-" + RUN,
                "Config": {"Labels": {"outscan.verification.owner": owner,
                                       "outscan.verification.run": RUN}}}

    def test_source_records_three_distinct_revision_origins(self):
        self.ctx.state = {}
        pipeline = "b" * 40
        event = "c" * 40
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w") as archive:
            for name in sorted(FILES):
                content = ("# fixture\nFROM " + BASE + "\n").encode() if name == "Dockerfile" else b"test\n"
                member = tarfile.TarInfo(name)
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))
        with patch.dict(os.environ, {"GITHUB_SHA": event, "BUILDKIT_IMAGE": "moby/buildkit@" + DIGEST}), \
                patch("scripts.b1_image.build.platform.system", return_value="Linux"), \
                patch("scripts.b1_image.build.platform.machine", return_value="x86_64"), \
                patch("scripts.b1_image.build.platform.freedesktop_os_release", create=True,
                      return_value={"ID": "ubuntu", "VERSION_ID": "24.04"}), \
                patch("scripts.b1_image.build.command", side_effect=[REVISION.encode(), pipeline.encode(),
                      str(EPOCH).encode(), data.getvalue()]) as git, \
                patch("scripts.b1_image.build.docker", return_value=b"mock version"):
            source(self.ctx)
        record = json.loads((self.ctx.evidence / "source.json").read_text())
        self.assertEqual(record["fixtureRevision"], REVISION)
        self.assertEqual(record["pipelineRevision"], pipeline)
        self.assertEqual(record["workflowEventSha"], event)
        self.assertNotIn("workflowRevision", record)
        self.assertEqual(git.call_args_list[1].args[0], ["/usr/bin/git", "rev-parse", "HEAD"])
        self.assertEqual(git.call_args_list[-1].args[0],
                         ["/usr/bin/git", "archive", REVISION + ":deploy/b1-harness/fixture"])

    def test_successful_create_clears_pending_only_after_inspect(self):
        def docker(*args, **kwargs):
            persisted = json.loads(self.ctx.state_path.read_text())
            self.assertTrue(persisted["pendingSmokeCreate"])
            if args[0] == "create":
                return CONTAINER.encode()
            self.assertEqual(args[:2], ("container", "inspect"))
            return json.dumps([self.container()]).encode()
        with patch("scripts.b1_image.smoke.docker", side_effect=docker):
            ident, _ = create_smoke(self.ctx)
        self.assertEqual(ident, CONTAINER)
        state = json.loads(self.ctx.state_path.read_text())
        self.assertFalse(state["pendingSmokeCreate"])
        self.assertEqual(state["smokeContainerId"], CONTAINER)

    def test_timeout_or_error_and_empty_enumeration_never_cleanup_pass(self):
        for error in (subprocess.TimeoutExpired("docker", 10), RuntimeError("COMMAND_FAILED")):
            with self.subTest(error=type(error).__name__):
                self.ctx.state.pop("pendingSmokeCreate", None)
                with patch("scripts.b1_image.smoke.docker", side_effect=error):
                    with self.assertRaises(type(error)):
                        create_smoke(self.ctx)
                with patch("scripts.b1_image.smoke.docker", return_value=b""):
                    for _ in range(2):
                        with self.assertRaisesRegex(RuntimeError, "UNACKNOWLEDGED_SMOKE_CREATE"):
                            cleanup(self.ctx)
                self.assertEqual(self.ctx.state["cleanup"], "INCOMPLETE")
                record = json.loads((self.ctx.evidence / "cleanup.json").read_text())
                self.assertEqual(record["result"], "INCOMPLETE")
                self.assertTrue(record["pendingSmokeCreate"])

    def test_late_owned_container_verified_before_removal_keeps_ambiguity(self):
        self.ctx.state["pendingSmokeCreate"] = True
        replies = [CONTAINER.encode(), json.dumps([self.container()]).encode(), b"log", b"", b""]
        with patch("scripts.b1_image.smoke.docker", side_effect=replies) as docker:
            with self.assertRaisesRegex(RuntimeError, "UNACKNOWLEDGED_SMOKE_CREATE"):
                cleanup(self.ctx)
        self.assertEqual(docker.call_args_list[1].args, ("container", "inspect", CONTAINER))
        self.assertEqual(docker.call_args_list[3].args, ("rm", "--force", CONTAINER))
        self.assertTrue(self.ctx.state["pendingSmokeCreate"])
        self.assertEqual(json.loads((self.ctx.evidence / "cleanup.json").read_text())["removed"], [CONTAINER])

    def test_foreign_container_never_removed_or_acknowledged(self):
        self.ctx.state["pendingSmokeCreate"] = True
        replies = [CONTAINER.encode(), json.dumps([self.container("foreign")]).encode()]
        with patch("scripts.b1_image.smoke.docker", side_effect=replies) as docker:
            with self.assertRaisesRegex(RuntimeError, "CLEANUP_OWNERSHIP"):
                cleanup(self.ctx)
        self.assertEqual(docker.call_count, 2)
        self.assertTrue(self.ctx.state["pendingSmokeCreate"])
        self.assertNotEqual(self.ctx.state["cleanup"], "PASS")

    def test_create_ownership_or_id_mismatch_preserves_pending(self):
        for info in (self.container("foreign"), {**self.container(), "Id": "e" * 64}):
            self.ctx.state.pop("pendingSmokeCreate", None)
            with patch("scripts.b1_image.smoke.docker", side_effect=[CONTAINER.encode(), json.dumps([info]).encode()]):
                with self.assertRaisesRegex(RuntimeError, "SMOKE_OWNERSHIP"):
                    create_smoke(self.ctx)
            self.assertTrue(self.ctx.state["pendingSmokeCreate"])

    def test_pending_create_blocks_even_stale_all_pass_status(self):
        state = {k: "PASS" for k in ("source", "base", "reproducibility", "contract", "smoke", "cleanup")}
        state["pendingSmokeCreate"] = True
        with self.assertRaisesRegex(RuntimeError, "UNACKNOWLEDGED_SMOKE_CREATE"):
            publication_gate(state)

    def test_pr_ci_adds_only_offline_image_tests(self):
        root = Path(__file__).resolve().parents[3]
        ci = (root / ".github/workflows/ci.yml").read_text()
        self.assertEqual(ci.count("python3 -m unittest discover -s scripts/b1_image/tests -v"), 1)
        self.assertNotIn("scripts/b1_image/entry.py", ci)


if __name__ == "__main__":
    unittest.main()
