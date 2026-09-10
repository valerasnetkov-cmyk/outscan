import { describe, expect, it, vi } from "vitest";

import {
  guestScannerRuntimeConfiguration,
  inspectGuestSecurityTxt,
  inspectGuestSecurityHeaders,
  runGuestSafeScanner,
} from "../src/guest-scanner/index.js";
import { produceCanonicalGuestScannerResult } from "../src/scanner-output/index.js";
import {
  ALLOWED_CAPABILITIES,
  BUDGET_CEILINGS,
} from "../src/scanner-policy/index.js";
import type {
  DnsAddressResolver,
  PinnedTransportExecutor,
} from "../src/target/index.js";

const NOW = 1_800_000_000_000;
function noData() {
  return Object.assign(new Error("no data"), { code: "ENODATA" });
}

function resolver(
  ipv4 = "1.1.1.1",
  ipv6: string | null = "2606:4700:4700::1111",
): DnsAddressResolver {
  return {
    resolve4: vi.fn(async () => [{ address: ipv4, ttl: 60 }]),
    resolve6: vi.fn(async () => {
      if (ipv6 === null) throw noData();
      return [{ address: ipv6, ttl: 60 }];
    }),
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    canonical_target: "example.com",
    policy: {
      schema_version: 1,
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile: "GUEST_SAFE",
      requested_capabilities: [...ALLOWED_CAPABILITIES.GUEST_SAFE],
      budgets: { ...BUDGET_CEILINGS.GUEST_SAFE },
    },
    ...overrides,
  };
}

function transport(headers: Array<{ name: string; value: string }> = []) {
  return vi.fn<PinnedTransportExecutor>(async (_target, request) =>
    request.path === "/.well-known/security.txt"
      ? {
          ok: true,
          response: {
            status_code: 200,
            headers: [
              {
                name: "content-type",
                value: "text/plain; charset=utf-8",
              },
            ],
            body: Buffer.from(
              "Contact: mailto:security@example.com\n" +
                "Expires: 2030-01-01T00:00:00Z\n",
            ),
            connected_address: "1.1.1.1",
          },
        }
      : {
          ok: true,
          response: {
            status_code: 200,
            headers,
            body: Buffer.from("ok"),
            connected_address: "1.1.1.1",
          },
        },
  );
}

function requireOutput(
  result: Awaited<ReturnType<typeof runGuestSafeScanner>>,
) {
  if (!result.ok) throw new Error(result.code);
  return result.output;
}

describe("minimal GUEST_SAFE scanner", () => {
  it("produces a target-bound canonicalizable partial posture result", async () => {
    const dispatch = transport([
      { name: "strict-transport-security", value: "max-age=31536000" },
      { name: "content-security-policy", value: "default-src 'self'" },
      { name: "x-content-type-options", value: "nosniff" },
      { name: "x-frame-options", value: "DENY" },
      { name: "referrer-policy", value: "no-referrer" },
      { name: "permissions-policy", value: "camera=()" },
    ]);
    const result = await runGuestSafeScanner(input(), resolver(), {
      now_unix_ms: () => NOW,
      transport: dispatch,
    });
    const output = requireOutput(result);

    expect(output).toMatchObject({
      observations: expect.arrayContaining([
        { check_id: "DNS_AAAA_PRESENT", outcome: "PASS" },
        { check_id: "TLS_CERTIFICATE", outcome: "PASS" },
        { check_id: "HTTP_HSTS", outcome: "PASS" },
        { check_id: "SECURITY_TXT", outcome: "PASS" },
      ]),
      candidate_findings: [],
      execution_metadata: {
        canonical_host: "example.com",
        request_count: 8,
      },
    });
    expect((output.coverage as unknown[]).length).toBe(8);
    expect(JSON.stringify(output)).not.toMatch(
      /connected_address|response|body|1\.1\.1\.1|security@example/iu,
    );
    expect(
      produceCanonicalGuestScannerResult(
        Buffer.from(JSON.stringify(output)),
        BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes,
      ).ok,
    ).toBe(true);
  });

  it("accepts only a bounded current RFC 9116 unsigned subset", () => {
    const response = {
      status_code: 200,
      headers: [{ name: "content-type", value: "text/plain; charset=UTF-8" }],
      body: Buffer.from(
        "Contact: https://example.com/report\r\n" +
          "Canonical: https://example.com/.well-known/security.txt\r\n" +
          "Expires: 2030-01-01T00:00:00Z\r\n",
      ),
      connected_address: "1.1.1.1",
    };
    expect(inspectGuestSecurityTxt(response, "example.com", NOW)).toBe("PASS");
    expect(
      inspectGuestSecurityTxt(
        { ...response, body: Buffer.from("Expires: 2030-01-01T00:00:00Z\n") },
        "example.com",
        NOW,
      ),
    ).toBe("ATTENTION");
    expect(
      inspectGuestSecurityTxt(
        {
          ...response,
          headers: [{ name: "content-type", value: "text/html" }],
          body: Buffer.from(
            "\ufeffContact: mailto:security@example.com\n" +
              "Expires: 2030-01-01T00:00:00Z\n",
          ),
        },
        "example.com",
        NOW,
      ),
    ).toBe("ATTENTION");
    expect(
      inspectGuestSecurityTxt(
        {
          ...response,
          body: Buffer.from(
            "Contact: mailto:security@example.com\n" +
              "Expires: 2020-01-01T00:00:00Z\n",
          ),
        },
        "example.com",
        NOW,
      ),
    ).toBe("ATTENTION");
  });

  it("does not accept cross-host security.txt redirects", async () => {
    const dispatch = vi.fn<PinnedTransportExecutor>(async (_target, request) =>
      request.path === "/.well-known/security.txt"
        ? {
            ok: true,
            response: {
              status_code: 302,
              headers: [
                {
                  name: "location",
                  value: "https://other.example/security.txt",
                },
              ],
              body: Buffer.alloc(0),
              connected_address: "1.1.1.1",
            },
          }
        : {
            ok: true,
            response: {
              status_code: 200,
              headers: [],
              body: Buffer.from("ok"),
              connected_address: "1.1.1.1",
            },
          },
    );
    const output = requireOutput(
      await runGuestSafeScanner(input(), resolver(), {
        now_unix_ms: () => NOW,
        transport: dispatch,
      }),
    );
    expect(output.observations).toEqual(
      expect.arrayContaining([
        { check_id: "SECURITY_TXT", outcome: "ATTENTION" },
      ]),
    );
    expect(output.candidate_findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          evidence: "SECURITY_TXT:NOT_ACCEPTED",
          severity: "LOW",
          confidence: 90,
        }),
      ]),
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("accepts only conservatively valid security-header values", () => {
    expect(
      inspectGuestSecurityHeaders([
        { name: "strict-transport-security", value: "max-age=0" },
        {
          name: "content-security-policy",
          value: "default-src 'self'; default-src 'none'",
        },
        { name: "x-content-type-options", value: "sniff" },
        { name: "x-frame-options", value: "ALLOWALL" },
        { name: "referrer-policy", value: "unknown" },
        { name: "permissions-policy", value: "camera=*" },
      ]).every((item) => item.outcome === "ATTENTION"),
    ).toBe(true);
  });

  it("recognizes CSP frame-ancestors and rejects duplicate headers", () => {
    const observations = inspectGuestSecurityHeaders([
      { name: "strict-transport-security", value: 'max-age="31536000"' },
      {
        name: "content-security-policy",
        value: "default-src 'self'; frame-ancestors 'none'",
      },
      { name: "x-content-type-options", value: "nosniff" },
      { name: "x-content-type-options", value: "nosniff" },
    ]);
    expect(observations).toEqual(
      expect.arrayContaining([
        { check_id: "HTTP_CSP", outcome: "PASS" },
        { check_id: "HTTP_HSTS", outcome: "PASS" },
        { check_id: "HTTP_FRAME_PROTECTION", outcome: "PASS" },
        {
          check_id: "HTTP_X_CONTENT_TYPE_OPTIONS",
          outcome: "ATTENTION",
        },
      ]),
    );
    expect(Object.isFrozen(observations)).toBe(true);
  });

  it("does not treat permissive policy values as security posture passes", () => {
    const observations = inspectGuestSecurityHeaders([
      { name: "referrer-policy", value: "unsafe-url" },
      { name: "permissions-policy", value: "camera=(*)" },
      { name: "content-security-policy", value: "report-to endpoint" },
    ]);
    expect(observations).toEqual(
      expect.arrayContaining([
        { check_id: "HTTP_REFERRER_POLICY", outcome: "ATTENTION" },
        { check_id: "HTTP_PERMISSIONS_POLICY", outcome: "ATTENTION" },
        { check_id: "HTTP_CSP", outcome: "ATTENTION" },
      ]),
    );
  });

  it("reports unavailable coverage without dispatching a forbidden destination", async () => {
    const dispatch = transport();
    const output = requireOutput(
      await runGuestSafeScanner(input(), resolver("127.0.0.1", null), {
        now_unix_ms: () => NOW,
        transport: dispatch,
      }),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      execution_metadata: { request_count: 2 },
      warnings: expect.arrayContaining([
        { code: "TARGET_RESOLUTION_UNAVAILABLE" },
      ]),
    });
  });

  it("applies deployment-specific CIDR denial before transport", async () => {
    const dispatch = transport();
    const output = requireOutput(
      await runGuestSafeScanner(input(), resolver(), {
        now_unix_ms: () => NOW,
        transport: dispatch,
        configured_internal_cidrs: ["1.1.1.0/24"],
      }),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      warnings: expect.arrayContaining([
        { code: "TARGET_RESOLUTION_UNAVAILABLE" },
      ]),
    });
  });

  it("enforces the complete outbound request budget across DNS and HTTP", async () => {
    const dispatch = transport();
    const constrained = input({
      policy: {
        ...input().policy,
        budgets: { ...BUDGET_CEILINGS.GUEST_SAFE, max_requests: 3 },
      },
    });
    const output = requireOutput(
      await runGuestSafeScanner(constrained, resolver(), {
        now_unix_ms: () => NOW,
        transport: dispatch,
      }),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(output).toMatchObject({
      execution_metadata: { request_count: 3 },
      warnings: expect.arrayContaining([{ code: "HTTPS_PROBE_UNAVAILABLE" }]),
    });
  });

  it.each([
    { unexpected: true },
    { canonical_target: "EXAMPLE.com" },
    {
      policy: {
        ...input().policy,
        requested_capabilities: ["DNS_READ"],
      },
    },
    {
      policy: {
        ...input().policy,
        budgets: { ...BUDGET_CEILINGS.GUEST_SAFE, max_concurrency: 1 },
      },
    },
  ])("rejects unsafe scanner input", async (override) => {
    await expect(
      runGuestSafeScanner({ ...input(), ...override }, resolver(), {
        now_unix_ms: () => NOW,
        transport: transport(),
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_SCANNER_INPUT" });
  });

  it("contains hostile clocks as a stable runtime failure", async () => {
    await expect(
      runGuestSafeScanner(input(), resolver(), {
        now_unix_ms: () => {
          throw new Error("hostile detail");
        },
      }),
    ).resolves.toEqual({ ok: false, code: "INVALID_SCANNER_RUNTIME" });
  });

  it("validates and snapshots the versioned scanner runtime configuration", () => {
    const cidrs = ["1.1.1.0/24"];
    const configuration = guestScannerRuntimeConfiguration({
      schema_version: 1,
      dns: { servers: ["9.9.9.9"] },
      configured_internal_cidrs: cidrs,
    });
    cidrs[0] = "8.8.8.0/24";
    expect(configuration).toMatchObject({
      dns: { servers: ["9.9.9.9"] },
      configured_internal_cidrs: ["1.1.1.0/24"],
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(
      guestScannerRuntimeConfiguration({
        schema_version: 1,
        dns: {},
        configured_internal_cidrs: ["bad"],
      }),
    ).toBeNull();
  });
});
