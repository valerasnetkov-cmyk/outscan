# B1 fixture image workflow

Status: **PLANNED / NOT YET RUN**. Image identity: **NOT YET BUILT**.

The manual `.github/workflows/b1-fixture-image.yml` workflow implements image
preparation only. No workflow dispatch, image operation, package creation or
staging access was performed while implementing it. Existing CI is unchanged.

## Inputs and identities

- Accepted fixture source: `929c40ecfe189be5f9aaf41f415bf7a376b7e475`.
- Source date epoch: `1789265917`; mismatch fails before build.
- Source tree: that commit's `deploy/b1-harness/fixture`, obtained with `git archive`.
- Exactly four regular files: Dockerfile, .dockerignore, probe.mjs, resources.mjs.
- Base: `node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553`.
- Package: `ghcr.io/valerasnetkov-cmyk/outscan-b1-fixture`.
- Tag: `git-929c40ecfe189be5f9aaf41f415bf7a376b7e475`.
- Runtime reference: the actual registry response digest, never the tag or image ID.

Workflow/helper revision and fixture source revision are recorded separately.
Checkout HEAD is never substituted for the accepted fixture source.
The approved manifest and the example with image=null are not modified.

## Manual runner and BuildKit

Only workflow_dispatch is enabled, on GitHub-hosted ubuntu-24.04. The helper
requires Ubuntu 24.04 and x86_64. This is an environment label, not an immutable
runner VM snapshot. OS/kernel/runner-image, Docker and Buildx versions are recorded.
The workflow uses no staging host and installs no host packages.

Required dispatch input `buildkit_image` accepts only
`moby/buildkit@sha256:<64 lowercase hex>`. There is no default and no fabricated
digest. Before dispatch, a reviewer must supply a verified, trusted official
BuildKit digest with an amd64 image and compatible Docker exporter support.
The workflow verifies the pulled RepoDigest and running builder image ID.
It records BuildKit image inspect, running identity, version and builder inspect.

Two distinct docker-container builders use that same digest, fresh state, no
shared cache and the same source context. Both are removed by their recorded,
UUID-derived names. BuildKit builders are privileged Docker build infrastructure;
this privilege is confined to the disposable GitHub runner, not granted to probes.
No Buildx/BuildKit installation on staging is required or authorized.

## Stages and failure gates

1. Source: accepted commit, timestamp, exact regular-file context and file hashes.
2. Base: authenticated Docker Hub manifest read, digest header checked against raw
   response bytes, index/single classification, unique amd64 child, raw child
   manifest, platform inspect and config digest binding. No fallback reference.
3. Build A/B: linux/amd64, network none for build execution, no-cache,
   SOURCE_DATE_EPOCH, rewrite-timestamp=true, provenance=false, sbom=false.
   Base retrieval still requires registry networking. No RUN package installation.
4. Compare exact archive SHA256, all archive member/layer/config hashes and loaded
   image ID/config/rootfs identities. Any difference stops publication. Preserve
   separate evidence for both builds, including inherited environment values.
5. Image contract: Linux/amd64, 1000:1000, /fixture, fixed Node entrypoint and hold
   CMD, no volumes/ports/healthcheck, unique PATH/NODE_VERSION/YARN_VERSION only.
6. Smoke: only boundary. No attempt, pressure, scanner or B1 controller execution.
   No network, mounts or published ports; read-only, cap-drop ALL, NNP, private
   IPC/cgroupns, default seccomp/AppArmor, 256m memory and swap total, 0.5 CPU,
   64 PIDs, restart no and pull never. Inspect hardening before start.
7. Cleanup must PASS before publication. Publication rechecks every prior gate.
8. Push the inspected image ID, obtain digest from authenticated GHCR response,
   verify raw bytes, fetch immutable manifest, pull canonical digest, recheck
   contract/RepoDigest/image ID/config/rootfs and tag stability.

Repeat-build equality is evidence for this recorded toolchain and run only.
Docker/Buildx/host evolution can change exports even with pinned BuildKit. No
long-term or cross-toolchain reproducibility claim is made. SBOM/provenance
attestations are not generated; dependency inventory/vulnerability/provenance
review remains a manual acceptance requirement before approving the runtime manifest.

## Deadline and targeted recovery

Smoke runs in a systemd service with RuntimeMaxSec=25s, TimeoutStopSec=1s and
KillMode=control-group, bounding both the controller and its Docker CLI children.
It also has a 25-second controller deadline and an independent systemd timer at
30 seconds (one-second timer accuracy). The timer survives controller/SSH process
failure, records its own FIRED and cleanup evidence, and invokes the reviewed
cleanup helper after stopping the controller service. Timer firing prevents
publication even if cleanup succeeds.
GitHub runner shutdown/reboot is not covered by the timer; the runner is disposable.

Cleanup enumerates only the exact owner/run labels, verifies UUID-derived name
and full container ID, saves inspect/logs and removes only owned containers.
Absence is checked through a successful Docker query. Daemon errors and ownership
mismatch fail closed. The always() recovery step retries targeted cleanup and
removes recorded builders; no prune, wildcard cleanup, namespaces or firewall
commands exist. A failed/ambiguous builder creation/removal can require runner
disposal and does not count as successful cleanup evidence.

## Permissions, collision and evidence

Permissions are contents: read and packages: write. Checkout does not persist
credentials. GITHUB_TOKEN is provided only to the publication step, then used
through stdin/HTTPS auth; child build/smoke environments do not inherit it.
No PAT, id-token, attestations, actions-write or contents-write permission exists.
Checkout and upload-artifact are pinned to verified release commit SHAs.

An existing tag always stops publication, including same-content reruns. Auth,
permission, rate-limit and transport errors never count as tag absence. A second
existence check runs immediately before push. Workflow concurrency serializes all
cooperating runs. GHCR does not provide a compare-and-swap guarantee through
docker push: package write access must be limited to this publication path during
the run. An external writer racing between check and push is a residual risk;
do not dispatch without exclusive publication access. No existing package/tag is
automatically deleted or deliberately overwritten. Failed post-push validation
may leave a published but unapproved image; it never updates a manifest.

Evidence artifact includes source revision/hashes/epoch, base raw manifests and
index/child identities, runner/toolchain identities, builder A/B inspect/version,
build metadata, archive/member hashes, image inspect/history/config/rootfs,
smoke inspect/log/exit, cleanup/watchdog status, published manifest/inspect and
`APPROVED_IMAGE_REFERENCE`. Failure stages produce explicit failure records.
Only the evidence directory is uploaded, on success or failure, for 30 days.
Archives, working context, state and the separate temporary auth directory are
excluded; auth config is removed in finally. No environment or credential dump.

GitHub requires a workflow_dispatch workflow to exist on the default branch.
Repository implementation does not authorize a merge, dispatch or package write.
After execution, evidence needs manual review and a separate reviewed manifest
commit. Export evidence outside the 30-day artifact retention window if needed.

## Offline validation and gates

```text
python -m unittest discover -s scripts/b1_image/tests -v
pnpm verify
python -m unittest discover -s scripts/b1_harness/tests -v
node --test scripts/ubuntu-host-policy.test.mjs
git diff --check
```

B1 Runtime Preparation = PASS.
B1 Harness Repository Implementation = PASS.
B1 Repository/Offline Verification = PASS (accepted prior phase).
B1 Fixture Image Identity = NOT YET BUILT.
B1 Isolation & Egress Runtime Evidence = NOT YET RUN.
Full Gate B1 = IN PROGRESS.
