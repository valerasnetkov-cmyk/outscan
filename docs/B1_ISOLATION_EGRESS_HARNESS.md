# B1 Isolation & Egress Harness

Status: repository implementation only. B1 Runtime Preparation = PASS;
B1 Isolation & Egress Evidence = NOT YET RUN; full Gate B1 = IN PROGRESS.
No Docker build/pull/load/create/start/run, SSH, namespaces or firewall changes
were performed to implement this harness. Commands below require separate approval.

## Authority and implementation

`scripts/b1_harness` is a Python-standard-library administrative controller.
It is not an application endpoint, scanner launcher binding or scan authorization.
No Node installation on the host is required. The reviewed fixture image contains
Node and fixed synthetic programs only, without OUTSCAN application/scanner code.

Lifecycle:

1. Strictly validate manifest and the reviewed root-owned installation; verify
   local image RepoDigest, runtime and isolated controller systemd service.
2. Allocate controller-generated UUID, exclusive journal/lock and arm a PID-1-owned
   watchdog timer BEFORE Docker/network objects are created.
3. Create/start the minimal non-root, no-capability, no-mount netns-anchor with
   network none. Capture its live PID/start time and network namespace identity.
4. Create run-owned router/fixture namespaces and veth pairs, entirely without a
   host uplink/default route. Never use a stopped container's network namespace.
5. Start controller-owned synthetic listeners, prove IPv4/IPv6 and loopback paths.
6. Install and read back the namespace-local OUTPUT policy. Only then create/start
   the probe using network container:ANCHOR_ID. Probe is the main container process
   for resource/cancellation scenarios; no docker exec resource measurements.
7. Collect bounded evidence, remove probe between cases, reconcile run resources,
   compare host snapshots, and disarm watchdog only after cleanup acknowledgement.

Every Docker container has owner/run/role labels. Netns names are derived from the
UUID and recorded with inode identities. Veth aliases carry run ownership; rule
comments and the containing owned namespace identify generated rules. Systemd
fixture units carry the run in their names and Description. Root-owned state lives
only below `/var/lib/outscan-b1/runs/UUID`, mode 0700, with atomic bounded journals.
Retained journals/receipts are evidence, not temporary live resources.

The privileged transport uses allowlisted absolute executable paths, shell=False,
fixed argv generation, minimal environment, 20-second commands and 64-KiB output
limits. Manifest cannot select paths, run names, shell fragments, interfaces,
commands, resolver addresses or firewall syntax. Duplicate/unknown JSON fields,
noncanonical CIDRs and non-immutable image references fail closed.

## Canonical policy and topology

`deploy/b1-harness/network-policy.json` is the explicit versioned harness registry.
It tracks the existing application special-use snapshot, including all entries
and its source version; an offline parity test fails on divergence. No decision
uses ipaddress.is_global. Unclassified addresses are NOT automatically authorized.
Required deployment internal range: 100.100.1.1/32 (classified as deployment
internal before the broader 100.64.0.0/10 SHARED class).

Lab transit links use 192.0.2.0/30 and 192.0.2.4/30, and 2001:db8:1::/64 and
2001:db8:2::/64, only inside namespaces. Synthetic private/metadata/benchmark
addresses terminate in fixture namespace. IPv6 fe80::123 is on router r0 so
link-local control never depends on a router forwarding link-local traffic.
No traffic is sent to the real staging gateway, metadata or external targets.

Policy tables are applied to anchor OUTPUT, shared by probe. Order:

- Privileged controller positive-control sockets with SO_MARK=179 only.
  Probe has no NET_ADMIN/NET_RAW and cannot set that mark.
- IPv6 ND types 135/136 only on b1p with hop limit 255; no application allow.
- Synthetic resolver 198.18.18.18:53 only, TCP/UDP; no upstream forwarding.
- Explicit internal/special-use DROP rules and final DROP. No broad ESTABLISHED
  exception can reuse a privileged control flow; controller listeners also mark
  their responses, and legitimate probe DNS ACKs remain destination/port scoped.

The resolver serves bounded `.test` DNS queries. Its exception never changes
target classification: 198.18.0.0/15 remains BENCHMARK deny, including HTTP/HTTPS
to the resolver. 127.0.0.0/8, ::1 and Docker loopback DNS are covered by OUTPUT.
Mapped addresses are tested as sockets and remain denied in the policy registry;
the kernel may emit IPv4 packets for a mapped socket, so both families are observed.

Host UFW/DOCKER-USER/sysctls are not modified. Docker bridge/production-worker
integration is a separate future evidence stage; this laboratory is not proof of
production network attachment. No default Docker bridge network is created.

## Evidence and result semantics

Positive controls use marked controller sockets before and after policy; receipts
are flushed before responses. Probe connections are unmarked. Deny requires an
actual ATTEMPT marker, increased deny counters, no new fixture receipt and working
controls. Received data is FAIL regardless of counters. Timeout alone cannot pass.
Broken IPv6 positive path skips IPv6 deny attempts and records INCONCLUSIVE.

Checks include synthetic PostgreSQL/Redis/admin ports, absent platform/socket
paths and environment credentials, loopback/mapped/private/link-local/metadata,
TCP/UDP DNS allow/deny and non-DNS resolver ports. All built-in CIDR boundaries
are covered offline. Live fixtures cover the mandatory representative addresses;
additional deployment CIDRs are enforced in generated rules but need additional
live representative fixtures before their runtime coverage can be claimed.

Resource ceilings: 256 MiB memory, zero swap, 0.5 CPU, 64 PIDs; private cgroups.
Memory commits/touches at most 512 MiB: PASS requires preallocation cgroup evidence,
exit 137 AND OOMKilled=true. CPU uses bounded deterministic work with observed
throttling. PID probe uses at most 80 direct children, EAGAIN, pids.current/events,
and awaited descendant cleanup. Hardening drift negatives are tested offline.
TERM fixture acknowledges; ignoring fixture requires TERM marker, exit 137,
no OOM and bounded completion. Probe removal is acknowledged after every case.

JSON report schema is `deploy/b1-harness/evidence.schema.json`; results are
PASS/FAIL/INCONCLUSIVE/NOT_YET_RUN. Reports retain manifest hash, image identity,
policy version, per-case counters/receipts/markers, cleanup and unchanged gate status.
The regular run explicitly leaves live crash-reconciliation NOT_YET_RUN, rather
than treating offline recovery tests as target evidence. The separate fault-run
provides that experiment; its journal/watchdog outcome must be reviewed alongside
the normal run. No automatic full Gate B1 promotion exists.

## Independent watchdog and failure recovery

Run controller inside `outscan-b1-controller.service`, KillMode=control-group,
RuntimeMaxSec=540 and TimeoutStopSec=5. A separate transient timer fires at 600s;
its cleanup service has RuntimeMaxSec=180. It is owned by systemd, not by SSH or
the controller, and survives controller os._exit or SIGKILL. It records FIRED in
its own status file, verifies controller systemd InvocationID, stops that entire
service/cgroup if still present, takes the run lock and invokes reconciliation.
This avoids leaving a Docker/ip subprocess alive after merely killing Python.
Completion is recorded in the run journal and systemd service status/journal.
Deadlines use monotonic time plus boot identity, so wall-clock corrections do not
postpone watchdog cleanup. Reboot recovery is explicit administrative reconciliation.

Reconciliation discovers containers by run label, validates owner/name/full ID
before any removal, removes probe first, stops identity-checked fixture services,
then removes anchor. Named namespaces require matching inode and no remaining
processes before deletion. Repeated cleanup is idempotent; daemon failure or
ownership mismatch is incomplete cleanup, never proof of absence.

A crash between namespace creation and inode acknowledgement remains deliberately
ambiguous: the pending intent is reported but the namespace is not deleted by
name alone. Administrator inspection is required. No host firewall flush,
Docker prune, wildcard removal or foreign-run deletion is implemented.

## Offline commands and generated examples

Run from repository root, without sudo:

```text
python -m unittest discover -s scripts/b1_harness/tests -v
python -I scripts/b1_harness/entry.py validate deploy/b1-harness/examples/manifest.json
python -I scripts/b1_harness/entry.py plan deploy/b1-harness/examples/manifest.json
node --check deploy/b1-harness/fixture/probe.mjs
node --check deploy/b1-harness/fixture/resources.mjs
```

Generated `examples/plan.json` contains the full ruleset representation. The
example manifest has image=null and is intentionally NOT runnable. No real fixture
image digest has been invented, built, loaded or published.

## Future build/review and staging commands — not executed

The separate [manual image workflow](B1_FIXTURE_IMAGE_WORKFLOW.md) now implements
the planned build/identity pipeline in the repository. It is NOT YET RUN and does
not authorize staging execution or update the approved manifest automatically.

On a separately approved builder, use the fixture directory as the ONLY build
context, the Dockerfile's immutable Node base and fixed source revision. No RUN
package installation or network dependency resolution exists in the Dockerfile.
Record Docker/BuildKit versions and SOURCE_DATE_EPOCH from that revision. Build
twice with the same inputs and compare image filesystem/config identities;
provenance timestamps must be distinguished from runtime content identity.

```text
docker build --platform linux/amd64 --network none --build-arg SOURCE_DATE_EPOCH=REVISION_EPOCH -t outscan-b1-fixture:review deploy/b1-harness/fixture
```

This is a future build template, not a claim of reproducibility or an approved
builder version. Review image inventory, config, SBOM/vulnerability findings and
base provenance before promotion. Record an actual RepoDigest in the manifest;
the run command only accepts an already-local matching RepoDigest and never pulls.
Raw OCI archive identity verification/import is not implemented in this version;
do not substitute an archive checksum for a Docker RepoDigest. Delivery/import
requires its own approval. Buildx installation on staging is not required.

After separate approval, an administrator installs the reviewed source/policy
bundle under `/opt/outscan-b1`, root-owned and not group/world-writable, and creates
`/var/lib/outscan-b1/runs` (0700). Install a root-owned reviewed manifest at
`/var/lib/outscan-b1/approved.json` with the REAL image RepoDigest. No automatic
installation/ownership change is performed by the controller.

Exact run commands after those prerequisites (sudo required):

```bash
sudo systemd-run --unit=outscan-b1-controller --collect --wait \
  --property=KillMode=control-group --property=RuntimeMaxSec=540 \
  --property=TimeoutStopSec=5 --property=UMask=0077 \
  /usr/bin/python3 -I /opt/outscan-b1/scripts/b1_harness/entry.py \
  run /var/lib/outscan-b1/approved.json
```

Only after normal-run cleanup, use the same command with `fault-run` instead of
`run`. It intentionally exits 70 after anchor/network/policy/probe setup, leaving
owned resources for the independent timer. Do not stop Docker/containerd to test it.
Use the UUID printed by that run for administrative recovery/read-only evidence:

```bash
sudo /usr/bin/python3 -I /opt/outscan-b1/scripts/b1_harness/entry.py reconcile RUN_UUID
sudo systemctl status outscan-b1-RUN_UUID-watchdog.service --no-pager
sudo journalctl -u outscan-b1-RUN_UUID-watchdog.service --no-pager
sudo cat /var/lib/outscan-b1/runs/RUN_UUID/state.json
```

RUN_UUID above is the actual controller-generated identifier, never a manifest
field. All Docker socket, systemd, namespace/veth, namespace firewall, host snapshot
and state-directory operations require sudo. No NOPASSWD/docker-group/socket
permission changes are requested.

## Acceptance limits before approving execution

- Real fixture digest, image review and local delivery are still outstanding.
- No namespace/systemd/Docker behavior in this harness has been exercised live.
  Kernel/iptables output normalization, ND and scope behavior must be validated.
- Watchdog survives process/SSH failure, not host reboot; after reboot reconcile
  persisted run journals before another run. Failed cleanup must be investigated.
- Host snapshots can differ due to concurrent unrelated activity; that produces
  INCONCLUSIVE, not permission to overwrite host settings.
- Additional deployment-internal live fixtures, real production launcher binding,
  and complete Gate B1 acceptance remain separate work.
