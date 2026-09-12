import copy
import ipaddress
import json
import re
import tempfile
import unittest
from pathlib import Path
from scripts.b1_harness.config import DATA, ROOT, read_json, validate
from scripts.b1_harness.policy import REGISTRY, classify, deny_result, rules
from scripts.b1_harness.listener import answer
from scripts.b1_harness.evidence import report, result


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.manifest = read_json(DATA / "examples/manifest.json")

    def test_example_plan_only(self):
        validate(self.manifest)
        with self.assertRaisesRegex(ValueError, "VERIFIED_IMAGE"):
            validate(self.manifest, runnable=True)

    def test_manifest_rejects_untrusted_fields(self):
        for field in ("run", "argv", "shell", "path", "firewall", "resolver", "namespace"):
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate({**self.manifest, field: "x"})

    def test_manifest_missing_types_and_versions(self):
        for key in self.manifest:
            changed = dict(self.manifest)
            del changed[key]
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate(changed)
        for value in ([], None, True, "v2"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate({**self.manifest, "policyVersion": value})

    def test_image_no_tags_paths_or_shell(self):
        for image in ("ubuntu:latest", "sha256:abc", "/tmp/image", "x;id@sha256:" + "a"*64,
                      "registry/x@sha256:" + "a"*63, "registry/x@sha256:" + "a"*64 + "\n"):
            with self.subTest(image=image), self.assertRaises(ValueError):
                validate({**self.manifest, "image": image})

    def test_internal_cidrs_strict(self):
        for ranges in ([], ["10.0.0.1/8"], ["fe80::1%eth0/128"], ["100.100.1.1/32"]*2,
                       ["100.100.1.1/32", "10/8"], [True], "100.100.1.1/32"):
            with self.subTest(ranges=ranges), self.assertRaises(ValueError):
                validate({**self.manifest, "internalCidrs": ranges})

    def test_duplicate_and_oversized_json(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "manifest.json"
            for content in ('{"a":1,"a":2}', ' ' * 65537):
                path.write_text(content)
                with self.assertRaises(ValueError):
                    read_json(path)

    def test_registry_exactly_tracks_application_snapshot(self):
        text = (ROOT / "apps/api/src/target/ip-policy.ts").read_text()
        entries = re.findall(r'\["([^"\n]+/[0-9]+)", "([A-Z0-9_]+)"\]', text)
        self.assertEqual(entries, [(r["cidr"], r["class"]) for r in REGISTRY["ranges"]])
        self.assertIn(REGISTRY["sourcePolicyVersion"], text)

    def test_each_registry_boundary_is_denied(self):
        for row in REGISTRY["ranges"]:
            net = ipaddress.ip_network(row["cidr"])
            for address in (net.network_address, net.broadcast_address):
                with self.subTest(cidr=row["cidr"], address=str(address)):
                    self.assertNotEqual(classify(str(address), []), "UNCLASSIFIED")

    def test_required_classes_and_gateway(self):
        cases = {"127.0.0.1": "LOOPBACK", "10.1.2.3": "PRIVATE", "169.254.169.254": "LINK_LOCAL",
                 "100.64.0.1": "SHARED", "198.18.18.18": "BENCHMARK", "::1": "LOOPBACK",
                 "fc00::1": "UNIQUE_LOCAL", "fe80::1": "LINK_LOCAL", "::ffff:10.1.2.3": "IPV4_MAPPED",
                 "100.100.1.1": "CONFIGURED_INTERNAL"}
        for address, expected in cases.items():
            self.assertEqual(classify(address, self.manifest["internalCidrs"]), expected)
        self.assertEqual(classify("8.8.8.8", []), "UNCLASSIFIED")

    def test_dns_exception_does_not_remove_deny_registry(self):
        tables = rules(self.manifest)["tables"]
        v4 = tables[0]["rules"]
        allowed = [r for r in v4 if r["id"].startswith("dns-")]
        self.assertEqual(len(allowed), 2)
        for row in allowed:
            self.assertIn("198.18.18.18/32", row["args"])
            self.assertIn("53", row["args"])
        self.assertTrue(any("198.18.0.0/15" in r["args"] for r in v4))
        self.assertEqual(v4[-1]["args"], ["-j", "DROP"])
        nd = [r for r in tables[1]["rules"] if r["id"].startswith("nd-")]
        self.assertEqual(len(nd), 2)
        self.assertTrue(all("255" in r["args"] and "b1p" in r["args"] for r in nd))

    def test_generated_example_has_no_policy_drift(self):
        example = read_json(DATA / "examples/plan.json")
        self.assertEqual(example["ruleset"], rules(self.manifest))
        self.assertEqual(example["status"], "NOT_YET_RUN")

    def test_new_application_connections_only_allow_synthetic_dns(self):
        def decision(address, port, protocol):
            ip = ipaddress.ip_address(address)
            table = next(t for t in rules(self.manifest)["tables"] if t["family"] == ip.version)
            for row in table["rules"]:
                args = row["args"]
                if row["id"] == "controller-control" or row["id"] == "reply" or row["id"].startswith("nd-"):
                    continue
                if "-d" in args and ip not in ipaddress.ip_network(args[args.index("-d") + 1]):
                    continue
                if "-p" in args and args[args.index("-p") + 1] != protocol:
                    continue
                if "--dport" in args and int(args[args.index("--dport") + 1]) != port:
                    continue
                return args[-1]
            self.fail("Missing final deny")
        for address in ("198.18.18.18", "198.18.18.19", "100.100.1.1", "127.0.0.1",
                        "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "8.8.8.8"):
            for port in (53, 443, 5432, 6379, 8443):
                for protocol in ("udp", "tcp"):
                    expected = "ACCEPT" if address == "198.18.18.18" and port == 53 else "DROP"
                    self.assertEqual(decision(address, port, protocol), expected)

    def test_timeout_and_broken_ipv6_never_pass(self):
        self.assertEqual(deny_result(0, 0, 0, 0, True, [True]), "INCONCLUSIVE")
        self.assertEqual(deny_result(0, 1, 0, 0, True, [False]), "INCONCLUSIVE")
        self.assertEqual(deny_result(0, 1, 0, 1, True, [True]), "FAIL")
        self.assertEqual(deny_result(0, 1, 0, 0, False, [True]), "INCONCLUSIVE")
        self.assertEqual(deny_result(0, 1, 0, 0, True, [True, True]), "PASS")

    def test_dns_fixture_no_upstream_or_arbitrary_zone(self):
        query = bytes.fromhex("12340100000100000000000002623104746573740000010001")
        self.assertIsNotNone(answer(query, True))
        self.assertIsNone(answer(query.replace(b"test", b"evil"), True))
        self.assertIsNone(answer(b"bad", True))

    def test_report_preserves_unrun_and_gate(self):
        r = report("example", self.manifest, [], "NOT_YET_RUN")
        self.assertEqual(r["status"], "NOT_YET_RUN")
        r = report("example", self.manifest, [result("ipv6", "INCONCLUSIVE", {})], "PASS")
        self.assertEqual(r["status"], "INCONCLUSIVE")
        self.assertEqual(r["gateB1"], "IN PROGRESS")
        self.assertEqual(report("example", self.manifest, [result("x", "PASS", {})], "INCOMPLETE")["status"], "FAIL")


if __name__ == "__main__":
    unittest.main()
