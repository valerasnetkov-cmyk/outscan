"""Offline negatives; no Docker, container, registry or staging calls."""
import copy
import io
import json
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from scripts.b1_image.core import (BASE, EPOCH, ENTRYPOINT, IMAGE, REVISION, buildkit_pin,
                                   digest, image_contract, publication_gate)
from scripts.b1_image.build import archive_identity, build_args
from scripts.b1_image.registry import amd64_child, manifest, verify_manifest
from scripts.b1_image.publish import collision, publish
from scripts.b1_image.smoke import cleanup, owned, smoke_args

DIGEST = "sha256:" + "a" * 64  # Synthetic test identity only.
RUN = "eaa3acb1-e6a1-4924-97ce-39a173bab512"


def image():
    return {"Id": DIGEST, "Os": "linux", "Architecture": "amd64",
            "RootFS": {"Type": "layers", "Layers": [DIGEST]},
            "RepoDigests": [IMAGE + "@" + DIGEST],
            "Config": {"User": "1000:1000", "WorkingDir": "/fixture", "Entrypoint": ENTRYPOINT,
                       "Cmd": ["hold"], "Env": ["PATH=/usr/bin", "NODE_VERSION=24", "YARN_VERSION=1"]}}


class Contracts(unittest.TestCase):
    def test_valid_image_records_env_values_and_rootfs(self):
        result = image_contract(image(), IMAGE + "@" + DIGEST)
        self.assertEqual(result["config"]["Env"], image()["Config"]["Env"])
        self.assertEqual(result["rootfs"], image()["RootFS"])

    def test_inherited_side_effects_rejected_before_creation(self):
        for field, value in (("Volumes", {"/data": {}}), ("ExposedPorts", {"80/tcp": {}}),
                             ("Healthcheck", {"Test": ["NONE"]})):
            with self.subTest(field=field):
                info = image()
                info["Config"][field] = value
                with self.assertRaises(RuntimeError):
                    image_contract(info)

    def test_environment_unknown_duplicate_and_malformed_rejected(self):
        for env in (["TOKEN=test"], ["PATH=a", "PATH=b"], ["PATH"], [42]):
            with self.subTest(env=env):
                info = image()
                info["Config"]["Env"] = env
                with self.assertRaises(RuntimeError):
                    image_contract(info)

    def test_platform_and_process_drift_rejected(self):
        for field, value in (("Os", "windows"), ("Architecture", "arm64"), ("Id", "tag")):
            info = image()
            info[field] = value
            with self.assertRaises(RuntimeError):
                image_contract(info)
        for field, value in (("User", "root"), ("WorkingDir", "/"), ("Cmd", ["memory"]),
                             ("Entrypoint", ["sh"])):
            info = image()
            info["Config"][field] = value
            with self.assertRaises(RuntimeError):
                image_contract(info)

    def test_local_id_never_substitutes_for_repodigest(self):
        info = image()
        info["RepoDigests"] = []
        with self.assertRaises(RuntimeError):
            image_contract(info, IMAGE + "@" + DIGEST)

    def test_buildkit_requires_digest_no_fragments(self):
        self.assertEqual(buildkit_pin("moby/buildkit@" + DIGEST), "moby/buildkit@" + DIGEST)
        for value in ("moby/buildkit:latest", "moby/buildkit:v1", "other@" + DIGEST,
                      "moby/buildkit@" + DIGEST + " --privileged", ""):
            with self.assertRaises(RuntimeError):
                buildkit_pin(value)

    def test_every_gate_is_required(self):
        passed = {k: "PASS" for k in ("source", "base", "reproducibility", "contract", "smoke", "cleanup")}
        publication_gate(passed)
        for stage in passed:
            for value in ("FAIL", "NOT YET RUN", None):
                state = {**passed, stage: value}
                with self.assertRaises(RuntimeError):
                    publication_gate(state)

    def test_publish_cannot_touch_registry_before_gate(self):
        with patch("scripts.b1_image.publish.token") as request:
            with self.assertRaises(RuntimeError):
                publish(SimpleNamespace(state={}))
            request.assert_not_called()

    def test_collision_never_overwrites_even_equal_content(self):
        collision(None)
        for existing in ((DIGEST, b"{}", {}), ("different", b"{}", {})):
            with self.assertRaises(RuntimeError):
                collision(existing)

    def test_registry_digest_is_hash_of_response_bytes(self):
        raw = b'{"schemaVersion":2,"config":{}}'
        self.assertEqual(verify_manifest(raw, digest(raw))["schemaVersion"], 2)
        for header in (DIGEST, "latest", "sha256:" + "A" * 64):
            with self.assertRaises(RuntimeError):
                verify_manifest(raw, header)
        with self.assertRaises(RuntimeError):
            verify_manifest(raw, digest(raw), DIGEST)

    def test_registry_errors_never_count_as_missing_tag(self):
        for code in (401, 403, 429, 500):
            with patch("scripts.b1_image.registry.request", return_value=(code, {}, b"")):
                with self.assertRaises(RuntimeError):
                    manifest("ghcr", "test", "tag", "test-token", missing_ok=True)
        with patch("scripts.b1_image.registry.request", return_value=(404, {}, b"")):
            self.assertIsNone(manifest("ghcr", "test", "tag", "test-token", missing_ok=True))

    def test_ambiguous_or_missing_amd64_fails(self):
        child = {"digest": DIGEST, "platform": {"os": "linux", "architecture": "amd64"}}
        self.assertEqual(amd64_child({"manifests": [child]}, "index"), DIGEST)
        self.assertEqual(amd64_child({"config": {}}, DIGEST), DIGEST)
        for members in ([], [child, copy.deepcopy(child)], [{**child, "platform": {"os": "linux", "architecture": "arm64"}}]):
            with self.assertRaises(RuntimeError):
                amd64_child({"manifests": members}, "index")

    def test_fixed_build_arguments(self):
        ctx = SimpleNamespace(root=Path("/tmp/test"), evidence=Path("/tmp/test/evidence"))
        args = build_args(ctx, "builder-a", "a")
        self.assertIn("SOURCE_DATE_EPOCH=" + str(EPOCH), args)
        self.assertIn("--provenance=false", args)
        self.assertIn("--sbom=false", args)
        self.assertIn("rewrite-timestamp=true", args[args.index("--output") + 1])
        for flag, value in (("--platform", "linux/amd64"), ("--network", "none")):
            self.assertEqual(args[args.index(flag) + 1], value)
        self.assertNotIn("--push", args)

    def test_smoke_has_only_boundary_and_fixed_limits(self):
        args = smoke_args(SimpleNamespace(state={"run": RUN, "image_id": DIGEST}))
        self.assertEqual(args[-2:], [DIGEST, "boundary"])
        for flag, value in (("--network", "none"), ("--memory", "256m"), ("--memory-swap", "256m"),
                            ("--cpus", "0.5"), ("--pids-limit", "64"), ("--pull", "never")):
            self.assertEqual(args[args.index(flag) + 1], value)
        self.assertFalse(set(args) & {"--mount", "-v", "-p", "--publish", "--privileged"})

    def test_cleanup_rejects_foreign_owner_without_removal(self):
        ctx = SimpleNamespace(state={"run": RUN}, status=lambda *args: None)
        foreign = {"Id": "container", "Name": "/foreign", "Config": {"Labels": {}}}
        self.assertFalse(owned(foreign, RUN))
        with patch("scripts.b1_image.smoke.docker", side_effect=[b"container\n", json.dumps([foreign]).encode()]) as run:
            with self.assertRaises(RuntimeError):
                cleanup(ctx)
            self.assertEqual(run.call_count, 2)

    def test_archive_layers_are_hashed_without_extracting_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "image.tar"
            with tarfile.open(path, "w") as archive:
                member = tarfile.TarInfo("blobs/sha256/test")
                member.size = 3
                archive.addfile(member, io.BytesIO(b"abc"))
            self.assertEqual(archive_identity(path), {"blobs/sha256/test": digest(b"abc")[7:]})


class Workflow(unittest.TestCase):
    def test_manual_trigger_permissions_runner_and_token_scope(self):
        root = Path(__file__).resolve().parents[3]
        text = (root / ".github/workflows/b1-fixture-image.yml").read_text()
        trigger = text.split("on:\n", 1)[1].split("permissions:", 1)[0]
        self.assertIn("  workflow_dispatch:", trigger)
        self.assertNotIn("push:", trigger)
        self.assertNotIn("pull_request", trigger)
        permissions = text.split("permissions:\n", 1)[1].split("concurrency:", 1)[0]
        self.assertEqual(permissions.strip().splitlines(), ["contents: read", "  packages: write"])
        self.assertIn("runs-on: ubuntu-24.04", text)
        self.assertIn("persist-credentials: false", text)
        self.assertEqual(text.count("secrets.GITHUB_TOKEN"), 1)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("outscan-b1-image/evidence/", text)
        for forbidden in ("id-token:", "attestations:", "self-hosted", "stage.outscan.ru", "docker prune"):
            self.assertNotIn(forbidden, text)

    def test_accepted_revision_is_fixed_not_current_head(self):
        self.assertEqual(REVISION, "929c40ecfe189be5f9aaf41f415bf7a376b7e475")
        self.assertEqual(EPOCH, 1789265917)
        self.assertIn("@sha256:", BASE)


if __name__ == "__main__":
    unittest.main()
