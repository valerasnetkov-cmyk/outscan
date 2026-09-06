import { describe, expect, it } from "vitest";

import {
  RESULT_ENVELOPE_AUDIENCE,
  verifyAuthenticatedResultEnvelope,
} from "../src/result-envelope/index.js";
import { BUDGET_CEILINGS } from "../src/scanner-policy/index.js";
import { encodeScannerIpcFrame } from "../src/scanner-ipc/index.js";
import {
  GUEST_SUPERVISOR_WORKLOAD_IDENTITY,
  runGuestScannerAttempt,
  type ScannerArtifactIdentity,
  type ScannerLaunchPlan,
  type ScannerProcessHandle,
  type TrustedExecutionState,
} from "../src/supervisor/index.js";

const NOW = 1_800_000_000;
const KEY = Buffer.alloc(32, 0x61);
const DIGEST_A = `sha256:${"a".repeat(64)}`;
const DIGEST_B = `sha256:${"b".repeat(64)}`;

function artifact(profile = "GUEST_SAFE"): ScannerArtifactIdentity {
  return {
    template_workflow_digest: DIGEST_A,
    transitive_dependency_digests: [DIGEST_B],
    engine_version: "scanner-1.0.0",
    scanner_image_digest: DIGEST_B,
    config_version: "config-1",
    policy_id: "outscan-v1",
    policy_version: "1.0.0",
    profile,
  };
}

function envelope(profile: "GUEST_SAFE" | "VERIFIED_BASELINE" = "GUEST_SAFE") {
  return {
    schema_version: 1,
    job_id: "job_01",
    attempt_id: "attempt_01",
    fence: 7,
    canonical_target: "example.com",
    authorization_ref: "guest-scan:scan_01",
    lease_expires_at_unix_seconds: NOW + 60,
    hard_deadline_unix_seconds: NOW + 120,
    policy: {
      schema_version: 1,
      policy_id: "outscan-v1",
      policy_version: "1.0.0",
      profile,
      requested_capabilities: ["DNS_READ", "TLS_HANDSHAKE"],
      budgets: { ...BUDGET_CEILINGS[profile] },
    },
    artifact_identity: artifact(profile),
  };
}

function trusted(profile = "GUEST_SAFE"): TrustedExecutionState {
  return {
    now_unix_seconds: NOW,
    job_id: "job_01",
    attempt_id: "attempt_01",
    fence: 7,
    canonical_target: "example.com",
    authorization_ref: "guest-scan:scan_01",
    lease_expires_at_unix_seconds: NOW + 60,
    hard_deadline_unix_seconds: NOW + 120,
    approval: {
      approval_id: "approval_01",
      status: "APPROVED",
      artifact_identity: artifact(profile),
    },
  };
}

function scannerBytes(host = "example.com"): Buffer {
  return Buffer.from(
    JSON.stringify({
      observations: [{ check_id: "DNS_CAA", outcome: "PASS" }],
      candidate_findings: [
        {
          fingerprint: DIGEST_A,
          severity: "LOW",
          confidence: 60,
          evidence: "untrusted raw evidence",
        },
      ],
      coverage: [
        {
          detector_group: "DNS_DOMAIN_POSTURE",
          execution_status: "SUCCESS",
          completeness: "COMPLETE",
        },
      ],
      execution_metadata: {
        schema_version: 1,
        profile: "GUEST_SAFE",
        canonical_host: host,
        policy_id: "outscan-v1",
        policy_version: "1.0.0",
        duration_ms: 500,
        request_count: 2,
      },
      warnings: [],
    }),
  );
}

function framed(payload = scannerBytes()): Uint8Array {
  const result = encodeScannerIpcFrame(payload, 2 * 1_024 * 1_024);
  if (!result.ok) throw new Error(result.code);
  return result.frame;
}

async function* output(frame: Uint8Array) {
  yield frame.subarray(0, 11);
  yield frame.subarray(11);
}

function harness(overrides: Record<string, unknown> = {}) {
  const stops: string[] = [];
  const plans: ScannerLaunchPlan[] = [];
  let keyReads = 0;
  const handle: ScannerProcessHandle = {
    stdout: output(framed()),
    wait: async () => ({ exit_code: 0, signal: null }),
    stop: (signal: string) => {
      stops.push(signal);
    },
  };
  const dependencies = {
    launcher: {
      launch: async (plan: ScannerLaunchPlan) => {
        plans.push(plan);
        return handle;
      },
    },
    signing_key_provider: {
      get_active_key: () => {
        keyReads += 1;
        return { key_version: 5, key: KEY };
      },
    },
    now_unix_seconds: () => NOW + 1,
    signal: new AbortController().signal,
    termination_grace_ms: 0,
    ...overrides,
  };
  return { dependencies, handle, stops, plans, keyReads: () => keyReads };
}

describe("trusted Guest supervisor runtime", () => {
  it("runs bounded IPC, canonicalizes output and signs for result ingress", async () => {
    const test = harness();
    const result = await runGuestScannerAttempt(
      envelope(),
      trusted(),
      test.dependencies,
    );
    expect(result).toMatchObject({
      ok: true,
      projection: { canonical_host: "example.com", potential_risk_count: 1 },
    });
    if (!result.ok) throw new Error(result.code);
    expect(test.keyReads()).toBe(1);
    expect(test.plans).toHaveLength(1);
    expect(test.plans[0]).toMatchObject({
      schema_version: 1,
      scanner_input: {
        canonical_target: "example.com",
        policy: { profile: "GUEST_SAFE" },
      },
    });
    expect(JSON.stringify(test.plans[0])).not.toContain("authorization_ref");
    expect(JSON.stringify(test.plans[0])).not.toContain("signing");
    expect(JSON.stringify(test.plans[0])).not.toContain("job_01");
    expect(Object.isFrozen(test.plans[0])).toBe(true);
    expect(Object.isFrozen(test.plans[0]?.scanner_input)).toBe(true);
    expect(Object.isFrozen(test.plans[0]?.scanner_input.policy)).toBe(true);

    const submission = result.read_submission();
    expect(
      verifyAuthenticatedResultEnvelope(submission, {
        now_unix_seconds: NOW + 1,
        expected_workload_identity: GUEST_SUPERVISOR_WORKLOAD_IDENTITY,
        expected_audience: RESULT_ENVELOPE_AUDIENCE,
        max_payload_bytes: BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes,
        keyring: new Map([[5, KEY]]),
      }),
    ).toMatchObject({ ok: true });
    expect(Buffer.from(submission.envelope.payload).toString()).not.toContain(
      "untrusted raw evidence",
    );
  });

  it("denies stale execution before launch or key access", async () => {
    const test = harness();
    const result = await runGuestScannerAttempt(
      { ...envelope(), fence: 8 },
      trusted(),
      test.dependencies,
    );
    expect(result).toEqual({
      ok: false,
      code: "EXECUTION_DENIED",
      execution_denial_code: "STALE_ATTEMPT",
    });
    expect(test.plans).toHaveLength(0);
    expect(test.keyReads()).toBe(0);
  });

  it("keeps non-Guest profiles outside this runtime", async () => {
    const test = harness();
    await expect(
      runGuestScannerAttempt(
        envelope("VERIFIED_BASELINE"),
        trusted("VERIFIED_BASELINE"),
        test.dependencies,
      ),
    ).resolves.toEqual({ ok: false, code: "PROFILE_NOT_SUPPORTED" });
    expect(test.plans).toHaveLength(0);
  });

  it("contains launch and handle failures without requesting a key", async () => {
    const throwing = harness({
      launcher: { launch: async () => Promise.reject(new Error("secret")) },
    });
    const invalid = harness({ launcher: { launch: async () => ({}) } });
    for (const test of [throwing, invalid]) {
      await expect(
        runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
      ).resolves.toEqual({ ok: false, code: "SCANNER_LAUNCH_FAILED" });
      expect(test.keyReads()).toBe(0);
    }
  });

  it("force-stops a malformed launched handle when possible", async () => {
    const stops: string[] = [];
    const test = harness({
      launcher: {
        launch: async () => ({
          stdout: {},
          wait: async () => ({ exit_code: 0, signal: null }),
          stop: (signal: string) => stops.push(signal),
        }),
      },
    });
    await expect(
      runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
    ).resolves.toEqual({ ok: false, code: "SCANNER_LAUNCH_FAILED" });
    expect(stops).toEqual(["KILL"]);
    expect(test.keyReads()).toBe(0);
  });

  it("escalates TERM to KILL for a rejected stream with no exit", async () => {
    const test = harness();
    test.handle.stdout = output(Buffer.from("invalid-frame"));
    test.handle.wait = () => new Promise(() => undefined);
    await expect(
      runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
    ).resolves.toEqual({ ok: false, code: "SCANNER_OUTPUT_REJECTED" });
    expect(test.stops).toEqual(["TERM", "KILL"]);
    expect(test.keyReads()).toBe(0);
  });

  it("does not launch when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const test = harness({ signal: controller.signal });
    await expect(
      runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
    ).resolves.toEqual({ ok: false, code: "RUN_ABORTED" });
    expect(test.plans).toHaveLength(0);
  });

  it("rejects non-zero, signalled and malformed process exits", async () => {
    for (const exit of [
      { exit_code: 1, signal: null },
      { exit_code: null, signal: "SIGKILL" },
      { exit_code: 0, signal: null, detail: "unsafe" },
    ]) {
      const test = harness();
      test.handle.wait = async () => exit;
      await expect(
        runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
      ).resolves.toEqual({ ok: false, code: "SCANNER_PROCESS_FAILED" });
      expect(test.keyReads()).toBe(0);
    }
  });

  it("binds scanner output to the authorized canonical target", async () => {
    const test = harness();
    test.handle.stdout = output(framed(scannerBytes("other.example")));
    await expect(
      runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
    ).resolves.toEqual({ ok: false, code: "SCANNER_OUTPUT_REJECTED" });
    expect(test.keyReads()).toBe(0);
  });

  it("fails closed when completion crosses the hard deadline", async () => {
    const test = harness({ now_unix_seconds: () => NOW + 120 });
    await expect(
      runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
    ).resolves.toEqual({ ok: false, code: "RUN_TIMEOUT" });
    expect(test.keyReads()).toBe(0);
  });

  it("contains unavailable and malformed signing keys", async () => {
    for (const provider of [
      { get_active_key: () => Promise.reject(new Error("vault detail")) },
      { get_active_key: () => ({ key_version: 1, key: Buffer.alloc(31) }) },
      {
        get_active_key: () => ({
          key_version: 1,
          key: KEY,
          unexpected: true,
        }),
      },
    ]) {
      const test = harness({ signing_key_provider: provider });
      await expect(
        runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
      ).resolves.toEqual({
        ok: false,
        code: "RESULT_SIGNING_KEY_UNAVAILABLE",
      });
    }
  });

  it("rejects malformed runtime dependencies before launch", async () => {
    const test = harness({ termination_grace_ms: 10_001 });
    await expect(
      runGuestScannerAttempt(envelope(), trusted(), test.dependencies),
    ).resolves.toEqual({ ok: false, code: "INVALID_RUNTIME_CONTEXT" });
    expect(test.plans).toHaveLength(0);
  });
});
