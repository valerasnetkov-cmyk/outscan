"""Accepted source archive, verified base, and two fresh pinned BuildKit builders."""
import io
import json
import os
import platform
import re
import tarfile
import uuid
from .core import (BASE, EPOCH, FILES, IMAGE, REVISION, buildkit_pin, command,
                   digest, docker, file_hash, image_contract, inspect, require)
from .registry import amd64_child, manifest, token


def source(ctx):
    require(not ctx.state, "STATE_ALREADY_EXISTS")
    require(platform.system() == "Linux" and platform.machine() == "x86_64", "RUNNER_PLATFORM")
    os_release = platform.freedesktop_os_release()
    require(os_release.get("ID") == "ubuntu" and os_release.get("VERSION_ID") == "24.04", "RUNNER_OS")
    revision = command(["/usr/bin/git", "rev-parse", REVISION + "^{commit}"]).decode().strip()
    require(revision == REVISION, "SOURCE_REVISION")
    pipeline_revision = command(["/usr/bin/git", "rev-parse", "HEAD"]).decode().strip()
    require(bool(re.fullmatch(r"[a-f0-9]{40}", pipeline_revision)), "PIPELINE_REVISION")
    epoch = int(command(["/usr/bin/git", "show", "-s", "--format=%ct", REVISION]))
    require(epoch == EPOCH, "SOURCE_EPOCH")
    raw = command(["/usr/bin/git", "archive", REVISION + ":deploy/b1-harness/fixture"])
    context = ctx.root / "context"
    context.mkdir(mode=0o700)
    hashes = {}
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        members = archive.getmembers()
        require(len(members) == 4 and {m.name for m in members} == FILES, "SOURCE_CONTEXT")
        for member in members:
            require(member.isfile() and member.size <= 65536, "SOURCE_MEMBER")
            content = archive.extractfile(member).read()
            (context / member.name).write_bytes(content)
            hashes[member.name] = digest(content)
    require((context / "Dockerfile").read_text().splitlines()[1] == "FROM " + BASE, "BASE_SOURCE")
    ctx.state.update(run=str(uuid.uuid4()), builders=[], source_hashes=hashes,
                     buildkit=buildkit_pin(os.environ.get("BUILDKIT_IMAGE", "")))
    ctx.record("source.json", {"fixtureRevision": REVISION, "sourceDateEpoch": EPOCH,
                               "pipelineRevision": pipeline_revision,
                               "workflowEventSha": os.environ["GITHUB_SHA"], "base": BASE})
    ctx.record("source.sha256", "".join(f"{v[7:]}  {k}\n" for k, v in sorted(hashes.items())).encode())
    ctx.record("runner.json", {"os": os_release, "architecture": platform.machine(),
                               "kernel": platform.release(), "runnerImageVersion": os.environ.get("ImageVersion")})
    ctx.record("docker-version.txt", docker("version"))
    ctx.record("buildx-version.txt", docker("buildx", "version"))
    ctx.mark("source")


def base(ctx):
    require(ctx.state.get("source") == "PASS", "SOURCE_REQUIRED")
    bearer = token("docker", "library/node")
    original, raw, parsed = manifest("docker", "library/node", BASE.split("@")[1], bearer)
    child = amd64_child(parsed, original)
    ctx.record("base-manifest.json", raw)
    _, child_raw, child_data = manifest("docker", "library/node", child, bearer)
    require("manifests" not in child_data, "BASE_CHILD_INDEX")
    ctx.record("base-child-manifest.json", child_raw)
    reference = "node@" + child
    docker("pull", "--platform", "linux/amd64", reference, timeout=300)
    info = inspect(reference)
    require(info.get("Os") == "linux" and info.get("Architecture") == "amd64", "BASE_PLATFORM")
    require(info["Id"] == child_data["config"]["digest"], "BASE_CONFIG_DIGEST")
    ctx.record("base-inspect.json", info)
    ctx.record("base-identity.json", {"reference": BASE, "kind": "index" if "manifests" in parsed else "manifest",
                                      "digest": original, "amd64ChildDigest": child})
    ctx.mark("base")


def build_args(ctx, name, attempt):
    return ["buildx", "build", "--builder", name, "--platform", "linux/amd64",
            "--network", "none", "--no-cache", "--build-arg", f"SOURCE_DATE_EPOCH={EPOCH}",
            "--provenance=false", "--sbom=false",
            "--label", "org.opencontainers.image.source=https://github.com/valerasnetkov-cmyk/outscan",
            "--label", "org.opencontainers.image.revision=" + REVISION,
            "--metadata-file", str(ctx.evidence / f"build-{attempt}.json"),
            "--output", f"type=docker,name={IMAGE}:review,dest={ctx.root}/fixture-{attempt}.tar,rewrite-timestamp=true",
            str(ctx.root / "context")]


def archive_identity(path):
    # Hash contained config/manifests/layer blobs without extracting any paths.
    entries = {}
    with tarfile.open(path) as archive:
        for member in archive:
            require(member.name not in entries, "ARCHIVE_DUPLICATE")
            if member.isfile():
                import hashlib
                result = hashlib.sha256()
                stream = archive.extractfile(member)
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    result.update(chunk)
                entries[member.name] = result.hexdigest()
            else:
                require(member.isdir(), "ARCHIVE_SPECIAL_MEMBER")
                entries[member.name] = "directory"
    return entries


def remove_builders(ctx):
    for name in list(ctx.state.get("builders", [])):
        require(name in ["b1-image-" + ctx.state["run"] + "-" + v for v in ("a", "b")], "BUILDER_OWNER")
        docker("buildx", "rm", name, timeout=90)
        ctx.state["builders"].remove(name)
        ctx.save()


def compare_builds(hashes, archives, identities):
    require(hashes["a"] == hashes["b"] and archives["a"] == archives["b"]
            and identities["a"] == identities["b"], "REPRODUCIBILITY")


def builds(ctx):
    require(ctx.state.get("base") == "PASS", "BASE_REQUIRED")
    pin = buildkit_pin(ctx.state["buildkit"])
    docker("pull", "--platform", "linux/amd64", pin, timeout=300)
    pinned = inspect(pin)
    require(pin in pinned.get("RepoDigests", []) and pinned.get("Architecture") == "amd64"
            and pinned.get("Os") == "linux", "BUILDKIT_IDENTITY")
    ctx.record("buildkit-image.json", pinned)
    hashes, archives, identities = {}, {}, {}
    for attempt in ("a", "b"):
        name = "b1-image-" + ctx.state["run"] + "-" + attempt
        ctx.state["builders"].append(name)
        ctx.save()
        docker("buildx", "create", "--name", name, "--driver", "docker-container",
               "--driver-opt", "image=" + pin, "--platform", "linux/amd64",
               "unix:///var/run/docker.sock")
        docker("buildx", "inspect", "--bootstrap", name, timeout=180)
        ctx.record(f"builder-{attempt}.txt", docker("buildx", "inspect", name))
        running = json.loads(docker("container", "inspect", "buildx_buildkit_" + name + "0"))[0]
        require(running["Image"] == pinned["Id"], "BUILDKIT_RUNNING_IDENTITY")
        ctx.record(f"buildkit-running-{attempt}.json", {"id": running["Id"], "imageId": running["Image"],
                                                       "imageReference": running["Config"]["Image"]})
        ctx.record(f"buildkit-version-{attempt}.txt", docker("exec", running["Id"], "/usr/bin/buildkitd", "--version"))
        ctx.record(f"build-output-{attempt}.txt", docker(*build_args(ctx, name, attempt), timeout=600))
        path = ctx.root / f"fixture-{attempt}.tar"
        hashes[attempt] = file_hash(path)
        archives[attempt] = archive_identity(path)
        docker("load", "--input", str(path), timeout=180)
        info = inspect(IMAGE + ":review")
        ctx.record(f"image-inspect-{attempt}.json", info)
        identities[attempt] = image_contract(info)
        ctx.record(f"archive-identity-{attempt}.json", {"sha256": hashes[attempt], "members": archives[attempt]})
        ctx.record(f"image-identity-{attempt}.json", identities[attempt])
        ctx.record(f"image-history-{attempt}.txt", docker("image", "history", "--no-trunc", info["Id"]))
        remove_builders(ctx)
    ctx.record("archive-hashes.json", hashes)
    ctx.record("archive-members.json", archives)
    ctx.record("image-identities.json", identities)
    compare_builds(hashes, archives, identities)
    ctx.state["image_id"] = identities["a"]["id"]
    ctx.state["identity"] = identities["a"]
    ctx.mark("reproducibility")
    ctx.mark("contract")
