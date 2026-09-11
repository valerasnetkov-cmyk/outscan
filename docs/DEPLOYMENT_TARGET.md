# Deployment target — current OUTSCAN version

Status: owner-accepted direction, 2026-09-10.

## Decision

The current version targets an Ubuntu server managed with Docker Compose.
Gate B1 implementation and operational evidence must be designed for this target.
Scanner execution workers are intended to move to Kubernetes later; Kubernetes
is not a current-release dependency or a decision to migrate every service.

This specializes [ADR-0003](adr/0003-scanner-isolation.md) and
[ADR-0012](adr/0012-worker-boundary-scanner-policy.md), without replacing their
accepted security boundaries. Gate A remains PASS; Gate B1 remains IN PROGRESS.
No running server, Compose manifest or enforced isolation is implied by acceptance.

## Boundaries to preserve

- Trusted API, dispatcher/supervisor, PostgreSQL, Redis and retention remain
  distinct from disposable scanner execution. The trusted worker consumes queue
  identity and signs results; the scanner does neither.
- Scanner execution has no DB/Redis/result credentials, private application
  network, metadata access, host network, privileged mode or Docker host socket.
- Compose packaging alone is not isolation evidence. Placing the current child
  process next to supervisor secrets inside one container does not satisfy B1.
- A deployment-owned launch boundary must provide bounded input/output and
  cancellation while enforcing resource and process/filesystem/network isolation.
  Its mechanism and minimal authority require review before connection to jobs;
  mounting the Docker socket into application/scanner services is not approved.
- Actual-connection pinning, Host/SNI/certificate validation and full A/AAAA
  revalidation remain mandatory. Host/container network rules must also deny
  private/internal/metadata destinations, including IPv6 and configured internal
  ranges. DNS access must be constrained to approved resolvers.
- Scanner scope remains hostname-only, EXACT_HOST, GUEST_SAFE. Deployment does
  not enable ACTIVE, raw TCP scanning, HEADLESS_BROWSER or additional capabilities.

## B1 delivery order

1. Prepare Ubuntu/Compose build and service layout: pinned reviewed images,
   non-root execution, minimal mounts, read-only filesystems where applicable,
   explicit resource limits and no unintended public DB/Redis/admin ports.
2. Implement the isolated scanner launch boundary and host/container egress rules.
   Test private/metadata/IPv6 denial, secret/mount isolation, timeout/cancellation,
   resource limits and fail-closed startup on missing enforcement.
3. Provision scoped secrets and approved artifacts; compose worker/retention,
   health/shutdown behavior and approved minimized Ops alert export.
4. Run live socket/TLS/certificate and redirect/retry tests against an owner-approved
   test hostname, together with Ubuntu-specific isolation/egress tests. Record
   configuration/image identities, outcomes and outstanding findings.
5. Complete Guest UI/accessibility and remaining B1 acceptance. Exclude runtime
   reference assets such as `public/maket.png` before public deployment. Public
   route activation requires B1; production still separately requires Gate C.

Ubuntu release, Docker/Compose versions, server/network inventory, permitted DNS
resolvers, test hostname and secret/Ops backends must be pinned in deployment
configuration before live verification. They are not inferred from this decision.

## Local API container baseline

`deploy/compose/compose.yaml` is an explicit opt-in `baseline` profile, not the
production service topology. It currently starts only the trusted API with no
published ports or external network, no volumes/credentials and no scanner/DB/Redis.
The API keeps its existing container-loopback listener; Guest routes remain absent.

The multi-stage image uses a digest-pinned Node 24 Bookworm runtime, pnpm 11.19.0,
frozen installation and a separate offline production-dependency layer. A default-deny
build context excludes `.git`, local dependencies, environment files and `public`;
runtime copies only dist, manifests, production dependencies and the smoke script.
`public/maket.png` stays untouched in the repository and is absent from this image.
Base-image digest pinning is not vulnerability-review or production approval evidence.

Run from the repository root on a Docker host:

```text
docker compose -p outscan-baseline -f deploy/compose/compose.yaml --profile baseline build
docker compose -p outscan-baseline -f deploy/compose/compose.yaml --profile baseline up -d --wait --wait-timeout 90
docker compose -p outscan-baseline -f deploy/compose/compose.yaml --profile baseline exec -T api-baseline node container-smoke.mjs
docker compose -p outscan-baseline -f deploy/compose/compose.yaml --profile baseline down
```

The smoke checks UID 1000, zero effective capabilities, no-new-privileges, read-only
root, loopback-only network, absent source/public/env/socket paths, API health, empty
public capability data and all three Guest routes remaining 404. Compose sets
0.5 CPU, 256 MiB and 64 PIDs; these limits still need target-host enforcement evidence.
CI includes an Ubuntu 24.04 job for this baseline; adding the job is not a completed
remote CI run. Deployment Ubuntu version remains an explicit future configuration.

Sources: [Compose service controls](https://docs.docker.com/reference/compose-file/services/).
The isolated scanner launcher, controlled Internet egress, secrets and full service
topology remain subsequent B1 work; do not attach scanners to this API container.

## Offline scanner CLI checks

The separate `scanner-check` profile runs `scanner-offline-check` as a one-shot
test with no network, ports, mounts or platform credentials. It invokes the real
scanner CLI through stdin with an empty child environment and validates the real
bounded IPC frame/projection. IPv4/IPv6 loopback resolvers are intentionally absent;
failed DNS must produce unavailable coverage, never successful posture/coverage.
Malformed JSON, URL targets and oversized input must fail with no result frame.

```text
docker compose -p outscan-scanner-check -f deploy/compose/compose.yaml --profile scanner-check run --build --rm -T scanner-offline-check
```

This test reuses the API build artifact without running the API or supervisor. It
does not establish a minimal production scanner image, a trusted launch broker,
termination of containers by supervisor, private-network separation under live
egress, or permission to deploy scanner workers. No host Docker authority is passed
inside the test container. These remain separate implementation/review work.

## Host-side container lifecycle verification

After building the scanner-check image for the verification project, run:

```text
docker compose -p outscan-lifecycle-check -f deploy/compose/compose.yaml --profile scanner-check build scanner-offline-check
node scripts/verify-scanner-lifecycle.mjs
```

This host/CI-only script launches two fixed offline fixtures: exit code 23 and a
process that ignores SIGTERM. It verifies stop escalation after a one-second grace
period (exit 137), then removes only its random-name/run-label/Compose-project-bound
container ID and checks absence. Docker commands have bounded time/output and use
no shell. Cleanup runs on assertion failure; Docker unavailability is an error,
not successful cleanup. An interrupted host/CI process still requires reconciliation;
CI adds a scoped always-run Compose cleanup for the verification project.

This is a test harness with host Docker authority, not an application endpoint,
broker, scanner permission or production launcher. Fixtures are fixed Node programs,
not scanned targets. Supervisor-owned cancellation/reconciliation remains unbound.

## Offline host-side launcher adapter

`apps/api/src/supervisor/offline-container-launcher.ts` now implements the existing
`ScannerProcessLauncher` port for offline verification. It is deliberately not
exported through the supervisor entrypoint or selected by the worker CLI.
It calls an absolute Docker executable against the fixed local daemon endpoint
(Ubuntu `/var/run/docker.sock`; Windows Docker Desktop Linux-engine named pipe).
The caller needs host Docker authority; no Docker socket is mounted into containers.

Before creation it reuses the existing approved-artifact/policy/hostname input
encoder. A content-addressed local Docker image ID must equal the configured
artifact digest. Network none, UID 1000, read-only root, no capabilities, fixed
resources, no restart/log driver and fixed scanner entrypoint/DNS settings cannot
be overridden. It rejects unexpected mounted volumes or inspected identity drift.
Only validated scanner input crosses stdin; application credentials are not supplied.

Attach uses the existing bounded process adapter. Stop targets the run-owned
container, not just the Docker client. Completion requires cleanup acknowledgement;
cleanup uncertainty rejects. A 35-second offline watchdog requests forced removal.
Daemon outages, ambiguous late create completion and host-process crashes still
require reconciliation before production use; no exactly-once cleanup is claimed.

After the API build and lifecycle-check image build above, run
`node scripts/verify-offline-launcher.mjs` for actual host → container → scanner IPC
→ cleanup verification. The test uses synthetic approval metadata and the local
image ID; it is not artifact promotion/production approval evidence. A minimal
scanner image, privileged broker review, live egress and worker binding remain pending.

## Kubernetes migration (subsequent)

Replace the scanner launch/runtime adapter and its isolation/egress implementation,
not the authoritative job protocol. Preserve lease/fence/deadline semantics,
bounded IPC or an explicitly reviewed equivalent, approved artifact identity,
credential separation, policy checks and authenticated supervisor-owned results.
Re-run platform-specific isolation, egress and cancellation evidence before
cutover. Kubernetes manifests, cluster provisioning and a whole-platform migration
are outside the current Compose slice.
