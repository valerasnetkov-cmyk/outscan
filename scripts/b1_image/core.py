"""Closed inputs and evidence primitives for the manual fixture image workflow."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

REVISION = "929c40ecfe189be5f9aaf41f415bf7a376b7e475"
EPOCH = 1789265917
BASE = "node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553"
IMAGE = "ghcr.io/valerasnetkov-cmyk/outscan-b1-fixture"
TAG = IMAGE + ":git-" + REVISION
FILES = {"Dockerfile", ".dockerignore", "probe.mjs", "resources.mjs"}
OWNER = "outscan-b1-image"
DIGEST = re.compile(r"sha256:[a-f0-9]{64}\Z")
ENTRYPOINT = ["/usr/local/bin/node", "/fixture/probe.mjs"]


def require(condition, code):
    if not condition:
        raise RuntimeError(code)


def digest(data):
    return "sha256:" + hashlib.sha256(data).hexdigest()


def file_hash(path):
    with path.open("rb") as stream:
        result = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
        return "sha256:" + result.hexdigest()


def buildkit_pin(value):
    require(bool(re.fullmatch(r"moby/buildkit@sha256:[a-f0-9]{64}", value)), "BUILDKIT_PIN")
    return value


def image_contract(info, reference=None):
    require(bool(DIGEST.fullmatch(info.get("Id", ""))), "IMAGE_ID")
    require(info.get("Os") == "linux" and info.get("Architecture") == "amd64", "PLATFORM")
    config = info.get("Config", {})
    require(config.get("User") == "1000:1000" and config.get("WorkingDir") == "/fixture", "USER_WORKDIR")
    require(config.get("Entrypoint") == ENTRYPOINT and config.get("Cmd") == ["hold"], "COMMAND")
    require(not any(config.get(k) for k in ("Volumes", "ExposedPorts", "Healthcheck")), "IMAGE_SIDE_EFFECTS")
    env = config.get("Env", [])
    require(isinstance(env, list) and all(isinstance(v, str) and "=" in v for v in env), "ENV")
    keys = [v.split("=", 1)[0] for v in env]
    require(len(set(keys)) == len(keys) and set(keys) <= {"PATH", "NODE_VERSION", "YARN_VERSION"}, "ENV")
    layers = info.get("RootFS", {}).get("Layers", [])
    require(bool(layers) and all(DIGEST.fullmatch(v) for v in layers), "ROOTFS")
    if reference:
        require(reference in info.get("RepoDigests", []), "REPODIGEST")
    return {"id": info["Id"], "config": config, "rootfs": info["RootFS"]}


def publication_gate(state):
    require(not state.get("pendingSmokeCreate"), "UNACKNOWLEDGED_SMOKE_CREATE")
    for stage in ("source", "base", "reproducibility", "contract", "smoke", "cleanup"):
        require(state.get(stage) == "PASS", "PUBLICATION_GATE_" + stage.upper())


class Context:
    def __init__(self):
        runner = Path(os.environ["RUNNER_TEMP"]).resolve()
        self.root = runner / "outscan-b1-image"
        require(not self.root.is_symlink(), "STATE_SYMLINK")
        self.root.mkdir(mode=0o700, exist_ok=True)
        self.evidence = self.root / "evidence"
        self.evidence.mkdir(mode=0o700, exist_ok=True)
        self.state_path = self.root / "state.json"
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else {}

    def save(self):
        temporary = self.root / "state.next"
        temporary.write_text(json.dumps(self.state, indent=2) + "\n")
        temporary.replace(self.state_path)

    def record(self, name, value):
        require(bool(re.fullmatch(r"[a-zA-Z0-9_.-]+", name)), "EVIDENCE_NAME")
        path = self.evidence / name
        if isinstance(value, bytes):
            path.write_bytes(value)
        else:
            path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")

    def mark(self, stage):
        self.status(stage, "PASS")

    def status(self, stage, value):
        self.state[stage] = value
        self.save()
        self.record("status.json", {k: self.state.get(k, "NOT YET RUN") for k in
                    ("source", "base", "reproducibility", "contract", "smoke", "cleanup", "publication")})


def command(argv, timeout=120, stdin=None, auth=None):
    require(argv[0] in ("/usr/bin/docker", "/usr/bin/git", "/usr/bin/sudo"), "EXECUTABLE")
    env = {"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": os.environ["HOME"],
           "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}
    if auth:
        env["DOCKER_CONFIG"] = str(auth)
    result = subprocess.run(argv, input=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            timeout=timeout, shell=False, env=env)
    require(result.returncode == 0, "COMMAND_FAILED")
    return result.stdout


def docker(*args, **kwargs):
    return command(["/usr/bin/docker", "--host", "unix:///var/run/docker.sock", *args], **kwargs)


def inspect(reference):
    return json.loads(docker("image", "inspect", reference))[0]
