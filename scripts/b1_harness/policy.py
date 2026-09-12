"""Explicit policy registry; ipaddress is only a parser, never an authority."""
import ipaddress
from .config import DATA, read_json

REGISTRY = read_json(DATA / "network-policy.json")
DNS = "198.18.18.18"
# These addresses exist ONLY in fixture namespaces. No default route to host.
DESTINATIONS = ["10.1.2.3", "172.16.1.2", "192.168.1.2", "169.254.1.2",
                "169.254.169.254", "100.100.1.1", "100.64.0.1", DNS,
                "198.18.18.19", "fc00::123", "fe80::123"]


def classify(address, internal):
    ip = ipaddress.ip_address(address)
    # Deployment class takes precedence over the shared-space built-in label.
    for cidr in internal:
        if ip in ipaddress.ip_network(cidr):
            return "CONFIGURED_INTERNAL"
    for row in REGISTRY["ranges"]:
        if ip in ipaddress.ip_network(row["cidr"]):
            return row["class"]
    return "UNCLASSIFIED"  # Never automatic target authorization.


def rules(manifest):
    result = []
    for family in (4, 6):
        # Applied inside anchor namespace; OUTPUT covers loopback and Docker DNS.
        # Only privileged controller sockets may use SO_MARK=179 for positive
        # controls. Probe has no NET_ADMIN/NET_RAW and cannot acquire them.
        rows = [{"id": "controller-control", "args": ["-m", "mark", "--mark", "0xb3", "-j", "ACCEPT"]}]
        if family == 6:
            for kind in (135, 136):
                rows.append({"id": "nd-" + str(kind), "args": ["-o", "b1p", "-p", "ipv6-icmp",
                    "--icmpv6-type", str(kind), "-m", "hl", "--hl-eq", "255", "-j", "ACCEPT"]})
        if family == 4:
            for proto in ("udp", "tcp"):
                rows.append({"id": "dns-" + proto, "args": ["-d", DNS + "/32", "-p", proto,
                    "--dport", "53", "-j", "ACCEPT"]})
        # No broad ESTABLISHED bypass: privileged positive-control connections
        # must not create reusable conntrack exceptions for unprivileged probes.
        cidrs = [(c, "internal") for c in manifest["internalCidrs"]]
        cidrs += [(r["cidr"], r["class"]) for r in REGISTRY["ranges"]]
        for index, (cidr, reason) in enumerate(cidrs):
            if ipaddress.ip_network(cidr).version == family:
                rows.append({"id": "deny-" + str(index), "class": reason,
                             "args": ["-d", cidr, "-j", "DROP"]})
        rows.append({"id": "deny-rest", "args": ["-j", "DROP"]})
        result.append({"family": family, "namespace": "anchor", "chain": "B1_OUT", "rules": rows})
    return {"version": REGISTRY["version"], "scope": "namespace-local-only", "tables": result}


def deny_result(before, after, receipts_before, receipts_after, attempted, controls):
    if not attempted or not all(controls):
        return "INCONCLUSIVE"
    if receipts_after != receipts_before:
        return "FAIL"
    return "PASS" if after > before else "INCONCLUSIVE"
