"""Run-owned veth laboratory: no uplink, host routes or host firewall edits."""
import json
from pathlib import Path
from .commands import BIN
from .config import names
from .policy import DESTINATIONS, rules

ANCHORS = {}


def anchor_exec(execute, pid, op, args):
    if type(pid) is not int or pid <= 1:
        raise ValueError("ANCHOR_PID")
    current = (Path(f"/proc/{pid}/ns/net").stat().st_ino,
               Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19])
    if ANCHORS.get(pid) != current:
        raise RuntimeError("ANCHOR_IDENTITY_CHANGED")
    return execute("nsenter", ["--target", str(pid), "--net", BIN[op], *args])


def make_network(journal, execute, pid):
    ANCHORS[pid] = (Path(f"/proc/{pid}/ns/net").stat().st_ino,
                    Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19])
    n = names(journal.run)
    for name in (n["router"], n["fixture"]):
        if (Path("/run/netns") / name).exists():
            raise RuntimeError("NAMESPACE_EXISTS")
        journal.data["pending"].append(name)
        journal.save()
        execute("ip", ["netns", "add", name])
        journal.data["namespaces"][name] = (Path("/run/netns") / name).stat().st_ino
        journal.save()
        execute("ip", ["-n", name, "link", "set", "lo", "up"])
    router, fixture = n["router"], n["fixture"]
    for local, peer, destination in (("r0", "b1p", str(pid)), ("r1", "f0", fixture)):
        execute("ip", ["-n", router, "link", "add", local, "type", "veth", "peer", "name", peer])
        execute("ip", ["-n", router, "link", "set", local, "alias", "outscan-run=" + journal.run])
        execute("ip", ["-n", router, "link", "set", peer, "alias", "outscan-run=" + journal.run])
        execute("ip", ["-n", router, "link", "set", peer, "netns", destination])
    for ns, dev, v4, v6 in ((router, "r0", "192.0.2.1/30", "2001:db8:1::1/64"),
                              (router, "r1", "192.0.2.5/30", "2001:db8:2::1/64"),
                              (fixture, "f0", "192.0.2.6/30", "2001:db8:2::2/64")):
        execute("ip", ["-n", ns, "addr", "add", v4, "dev", dev])
        execute("ip", ["-n", ns, "-6", "addr", "add", v6, "dev", dev, "nodad"])
        execute("ip", ["-n", ns, "link", "set", dev, "up"])
    for args in (["addr", "add", "192.0.2.2/30", "dev", "b1p"],
                 ["-6", "addr", "add", "2001:db8:1::2/64", "dev", "b1p", "nodad"],
                 ["link", "set", "b1p", "up"]):
        anchor_exec(execute, pid, "ip", args)
    execute("ip", ["netns", "exec", router, BIN["sysctl"], "-w", "net.ipv4.ip_forward=1",
                   "net.ipv6.conf.all.forwarding=1"])
    execute("ip", ["-n", fixture, "route", "add", "192.0.2.0/30", "via", "192.0.2.5"])
    execute("ip", ["-n", fixture, "-6", "route", "add", "2001:db8:1::/64", "via", "2001:db8:2::1"])
    for address in DESTINATIONS:
        if address == "fe80::123":
            # Link-local must stay on-link, never rely on routers forwarding it.
            execute("ip", ["-n", router, "-6", "addr", "add", "fe80::123/64", "dev", "r0", "nodad"])
            continue
        six = ":" in address
        family = ["-6"] if six else []
        cidr = address + ("/128" if six else "/32")
        execute("ip", ["-n", fixture, *family, "addr", "add", cidr, "dev", "lo"])
        execute("ip", ["-n", router, *family, "route", "add", cidr, "via",
                       "2001:db8:2::2" if six else "192.0.2.6"])
        anchor_exec(execute, pid, "ip", [*family, "route", "add", cidr, "via",
                    "2001:db8:1::1" if six else "192.0.2.1", "dev", "b1p"])
    # No default routes. All fixture addresses terminate locally in fixture ns.
    links = json.loads(anchor_exec(execute, pid, "ip", ["-j", "link", "show"]))
    if {row["ifname"] for row in links} != {"lo", "b1p"}:
        raise RuntimeError("UNEXPECTED_ANCHOR_INTERFACE")
    for family in ([], ["-6"]):
        routes = json.loads(anchor_exec(execute, pid, "ip", [*family, "-j", "route", "show"]))
        if any(row.get("dst") == "default" for row in routes):
            raise RuntimeError("UNEXPECTED_UPLINK")
    journal.phase("NETWORK_READY")


def install_policy(journal, execute, pid, manifest):
    representation = rules(manifest)
    for table in representation["tables"]:
        tool = "iptables" if table["family"] == 4 else "ip6tables"
        anchor_exec(execute, pid, tool, ["-w", "2", "-N", "B1_OUT"])
        for row in table["rules"]:
            anchor_exec(execute, pid, tool, ["-w", "2", "-A", "B1_OUT", "-m", "comment",
                        "--comment", "b1:" + row["id"], *row["args"]])
        anchor_exec(execute, pid, tool, ["-w", "2", "-I", "OUTPUT", "1", "-j", "B1_OUT"])
        actual = anchor_exec(execute, pid, tool, ["-S", "B1_OUT"])
        # Verify full normalized argv, not only existence or rule count.
        import shlex
        observed = [shlex.split(line) for line in actual.splitlines() if line.startswith("-A ")]
        expected = [["-A", "B1_OUT", "-m", "comment", "--comment", "b1:" + r["id"],
                     *r["args"]] for r in table["rules"]]
        # iptables may render implicit protocol modules; normalize those only.
        def normalized(row):
            out = []
            i = 0
            while i < len(row):
                if row[i:i+2] in (["-m", "tcp"], ["-m", "udp"], ["-m", "icmp6"]):
                    i += 2
                else:
                    out.append(row[i])
                    i += 1
            return out
        if [normalized(r) for r in observed] != [normalized(r) for r in expected]:
            raise RuntimeError("RULESET_DRIFT")
        output = anchor_exec(execute, pid, tool, ["-S", "OUTPUT"])
        if output.splitlines()[1:] != ["-A OUTPUT -j B1_OUT"]:
            raise RuntimeError("OUTPUT_DRIFT")
    journal.data["ruleset"] = representation
    journal.phase("POLICY_VERIFIED")


def deny_counters(execute, pid):
    import re
    values = {}
    for family, tool in ((4, "iptables-save"), (6, "ip6tables-save")):
        raw = anchor_exec(execute, pid, tool, ["-c", "-t", "filter"])
        for line in raw.splitlines():
            match = re.match(r'\[(\d+):\d+\].*--comment "?(b1:deny-[a-z0-9-]+)"?', line)
            if match:
                values[str(family) + ":" + match[2]] = int(match[1])
    if not values:
        raise RuntimeError("COUNTERS_UNAVAILABLE")
    return values
