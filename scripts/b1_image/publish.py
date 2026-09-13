"""Publication gate and registry-origin immutable identity, never manifest edits."""
import os
from .core import (IMAGE, TAG, docker, image_contract, inspect, publication_gate, require)
from .registry import manifest, token

REPOSITORY = "valerasnetkov-cmyk/outscan-b1-fixture"


def collision(existing):
    # Conservative: even same-content reruns require manual reuse/review.
    require(existing is None, "TAG_ALREADY_EXISTS_NO_OVERWRITE")


def publish(ctx):
    publication_gate(ctx.state)
    require(not (ctx.evidence / "watchdog-fired.json").exists(), "WATCHDOG_FIRED")
    require(image_contract(inspect(ctx.state["image_id"])) == ctx.state["identity"], "IMAGE_DRIFT")
    secret = os.environ.pop("GHCR_TOKEN")
    actor = os.environ["GITHUB_ACTOR"]
    bearer = token("ghcr", REPOSITORY, actor + ":" + secret)
    tag = TAG.split(":", 1)[1]
    collision(manifest("ghcr", REPOSITORY, tag, bearer, missing_ok=True))
    auth = ctx.root / "auth"
    auth.mkdir(mode=0o700)
    try:
        docker("login", "ghcr.io", "--username", actor, "--password-stdin",
               stdin=secret.encode(), auth=auth)
        secret = None
        docker("tag", ctx.state["image_id"], TAG)
        require(inspect(TAG)["Id"] == ctx.state["image_id"], "TAG_DRIFT")
        # Recheck directly before the only write. All cooperating runs share one concurrency group.
        collision(manifest("ghcr", REPOSITORY, tag, bearer, missing_ok=True))
        docker("push", TAG, auth=auth, timeout=300)
        actual, raw, parsed = manifest("ghcr", REPOSITORY, tag, bearer)
        ctx.record("published-manifest.json", raw)
        require("manifests" not in parsed and parsed.get("config", {}).get("digest") == ctx.state["image_id"],
                "PUBLISHED_CONFIG")
        reference = IMAGE + "@" + actual
        # Re-read immutable manifest; require the same bytes, not a local tag assertion.
        _, immutable_raw, _ = manifest("ghcr", REPOSITORY, actual, bearer)
        require(raw == immutable_raw, "PUBLISHED_MANIFEST_DRIFT")
        docker("pull", "--platform", "linux/amd64", reference, auth=auth, timeout=300)
        info = inspect(reference)
        ctx.record("published-inspect.json", info)
        require(image_contract(info, reference) == ctx.state["identity"], "PUBLISHED_IDENTITY")
        require(manifest("ghcr", REPOSITORY, tag, bearer)[0] == actual, "TAG_CHANGED_DURING_PUBLICATION")
        ctx.record("published-identity.json", {"reference": reference, "registryDigest": actual,
                                               "imageId": info["Id"], "layers": parsed.get("layers")})
        ctx.record("approved-image-reference.txt", ("APPROVED_IMAGE_REFERENCE=" + reference + "\n").encode())
        ctx.mark("publication")
    finally:
        # Dedicated auth directory is never part of the evidence artifact.
        config = auth / "config.json"
        if config.exists():
            config.unlink()
        auth.rmdir()
