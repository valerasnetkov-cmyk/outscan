# B1 Harness Security Review

Status: **PASS WITH CONDITIONS (repository code only)**.

This review does not authorize execution on staging. B1 Runtime Preparation remains
PASS; B1 Isolation & Egress Runtime Evidence remains NOT YET RUN; full Gate B1
remains IN PROGRESS.

## Remediated findings

The review of the initial repository-only harness found two staging blockers and
several hardening gaps. The review branch now addresses them as follows:

- Docker 29 resource capability fields use the actual `CPUCfsPeriod` and
  `CPUCfsQuota` names. A regression test rejects a missing field.
- Deny evidence is bound to the expected destination-specific firewall counter.
  Growth in an unrelated DROP rule can no longer satisfy a case. IPv4-mapped
  sockets may satisfy only the mapped IPv6 rule or the corresponding IPv4 rule.
- Container creation intent is journaled before `docker create`. Ambiguous create
  outcomes are re-enumerated by run label and remain incomplete if ownership cannot
  be acknowledged.
- Container boundary verification requires Docker's `docker-default` AppArmor
  profile; the probe also checks `/proc/self/attr/current` while running.
- Evidence uses the `b1-isolation-v1` profile. Missing, duplicate or unexpected
  case IDs make the report FAIL rather than allowing a partial PASS.
- Journal replacement uses unique root-owned temporary files, avoiding a stale
  fixed `state.new` recovery blocker.
- Watchdog status is written only after controller unit/InvocationID validation and
  uses atomic replacement.
- Host snapshots include normalized native nftables rules and interface addresses
  in addition to iptables/ip6tables, routes, links, listeners and forwarding.
- CPU throttling pressure runs for a bounded five-second window to reduce scheduler
  noise while retaining a hard upper bound.

## Remaining conditions before staging

1. GitHub PR CI for the reviewed head must PASS. Do not merge merely to run CI.
2. Build/review the fixture image on an approved builder and record its real local
   RepoDigest; `image: null` remains intentionally non-runnable.
3. Install the exact reviewed source revision under `/opt/outscan-b1` as root-owned,
   non-group/world-writable files. The controller's in-process ownership checks are
   defense in depth, not a substitute for a trusted installation procedure because
   Python imports occur before the controller can validate its own files.
4. Record the installed bundle identity/checksums as administrative evidence before
   the first root execution.
5. Run no staging command until a separate execution approval is given.

## Residual risks accepted for the first controlled run

- A crash between named namespace creation and inode acknowledgement remains
  deliberately ambiguous and requires administrator inspection; deletion by name
  alone is forbidden.
- An unacknowledged Docker create intent with no discoverable run-owned object is
  treated as incomplete cleanup rather than absence. Administrator review is
  required before clearing such an intent.
- Watchdog recovery does not claim to survive host reboot. Reboot recovery remains
  an explicit administrative reconciliation procedure.
- The synthetic namespace harness is not evidence of the future production scanner
  launcher/network attachment.

## Review decision

Repository architecture and fail-closed controls are suitable to proceed to fixture
image review and CI validation. **Staging execution is not yet approved.**
