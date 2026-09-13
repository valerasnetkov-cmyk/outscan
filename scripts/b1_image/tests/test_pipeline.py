"""Mocked failure paths and secret containment; never run real subprocesses."""
import copy
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from scripts.b1_image.build import compare_builds
from scripts.b1_image.core import Context, command, image_contract
from scripts.b1_image.entry import recovery, watchdog
from scripts.b1_image.publish import publish
from test_contracts import DIGEST, RUN, image


class Pipeline(unittest.TestCase):
    def test_any_export_config_or_layer_difference_blocks(self):
        values = [{"a": "archive", "b": "archive"},
                  {"a": {"layer": "hash"}, "b": {"layer": "hash"}},
                  {"a": image_contract(image()), "b": image_contract(image())}]
        compare_builds(*values)
        for index in range(3):
            changed = copy.deepcopy(values)
            changed[index]["b"] = "different"
            with self.assertRaisesRegex(RuntimeError, "REPRODUCIBILITY"):
                compare_builds(*changed)

    def test_subprocess_never_inherits_token_or_shell(self):
        result = SimpleNamespace(returncode=0, stdout=b"ok", stderr=b"")
        with patch.dict(os.environ, {"HOME": "/tmp/home", "GHCR_TOKEN": "never-export-this"}), \
                patch("scripts.b1_image.core.subprocess.run", return_value=result) as run:
            command(["/usr/bin/docker", "version"])
        kwargs = run.call_args.kwargs
        self.assertFalse(kwargs["shell"])
        self.assertNotIn("GHCR_TOKEN", kwargs["env"])
        self.assertNotIn("never-export-this", str(kwargs))

    def test_cleanup_retries_other_resources_after_failure(self):
        ctx = SimpleNamespace(state={"controller_unit": "owned", "timer": "owned"})
        with patch("scripts.b1_image.entry.stop_controller", side_effect=RuntimeError("STOP")), \
                patch("scripts.b1_image.entry.cleanup") as cleanup, \
                patch("scripts.b1_image.entry.timer") as timer, \
                patch("scripts.b1_image.entry.remove_builders") as builders:
            with self.assertRaisesRegex(RuntimeError, "RECOVERY_INCOMPLETE"):
                recovery(ctx)
            cleanup.assert_called_once_with(ctx)
            timer.assert_called_once_with(ctx, "stop")
            builders.assert_called_once_with(ctx)

    def test_watchdog_stops_controller_before_cleanup(self):
        ctx = SimpleNamespace(state={"run": RUN}, record=Mock())
        calls = []
        with patch("scripts.b1_image.entry.stop_controller", side_effect=lambda _: calls.append("stop")), \
                patch("scripts.b1_image.entry.cleanup", side_effect=lambda *a, **k: calls.append("cleanup")):
            watchdog(ctx)
        self.assertEqual(calls, ["stop", "cleanup"])
        self.assertEqual(ctx.record.call_args.args[0], "watchdog-fired.json")

    def test_post_push_mismatch_never_emits_approved_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"RUNNER_TEMP": directory}):
                ctx = Context()
            ctx.state = {key: "PASS" for key in ("source", "base", "reproducibility", "contract", "smoke", "cleanup")}
            ctx.state.update(image_id=DIGEST, identity=image_contract(image()))
            bad_manifest = (DIGEST, b'{"schemaVersion":2}', {"config": {"digest": "different"}})
            with patch.dict(os.environ, {"GHCR_TOKEN": "test-secret", "GITHUB_ACTOR": "test-actor"}), \
                    patch("scripts.b1_image.publish.inspect", return_value=image()), \
                    patch("scripts.b1_image.publish.token", return_value="test-bearer"), \
                    patch("scripts.b1_image.publish.manifest", side_effect=[None, None, bad_manifest]), \
                    patch("scripts.b1_image.publish.docker", return_value=b"") as docker:
                with self.assertRaisesRegex(RuntimeError, "PUBLISHED_CONFIG"):
                    publish(ctx)
            self.assertTrue(any(call.args[0] == "push" for call in docker.call_args_list))
            self.assertFalse((ctx.evidence / "approved-image-reference.txt").exists())
            self.assertFalse((ctx.root / "auth").exists())
            self.assertNotIn("publication", ctx.state)
            for path in ctx.evidence.iterdir():
                self.assertNotIn("test-secret", path.read_text())
                self.assertNotIn("test-bearer", path.read_text())

    def test_no_publication_after_watchdog_fires(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"RUNNER_TEMP": directory}):
                ctx = Context()
            ctx.state = {key: "PASS" for key in ("source", "base", "reproducibility", "contract", "smoke", "cleanup")}
            ctx.record("watchdog-fired.json", {"status": "FIRED"})
            with patch("scripts.b1_image.publish.docker") as docker:
                with self.assertRaisesRegex(RuntimeError, "WATCHDOG_FIRED"):
                    publish(ctx)
                docker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
