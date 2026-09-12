// Read-only preflight policy. No PASS here grants deployment/scanner authority.
const releasePattern = /^[0-9]{2}\.[0-9]{2}$/u;
const versionPattern = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/u;
export function parseExpectedVersions(args) {
  if (
    !Array.isArray(args) ||
    args.length !== 3 ||
    args.some((value) => typeof value !== "string" || /[^0-9.]/u.test(value)) ||
    !releasePattern.test(args[0]) ||
    !args.slice(1).every((v) => typeof v === "string" && versionPattern.test(v))
  ) {
    throw new Error("HOST_EXPECTED_VERSIONS_REQUIRED");
  }
  return { ubuntu: args[0], engine: args[1], compose: args[2] };
}

function osValues(text) {
  if (typeof text !== "string" || text.length > 16384) throw new Error();
  const result = {};
  for (const line of text.split(/\r?\n/u)) {
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Z_]+)=(?:"([^"\n]*)"|'([^'\n]*)'|([^\s"']+))$/u.exec(
      line,
    );
    if (!match || Object.hasOwn(result, match[1])) throw new Error();
    result[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return result;
}

export function assessUbuntuHost(observation, expected) {
  try {
    const pins = parseExpectedVersions([
      expected.ubuntu,
      expected.engine,
      expected.compose,
    ]);
    if (observation.platform !== "linux")
      return { ok: false, code: "HOST_NOT_LINUX" };
    const os = osValues(observation.osRelease);
    if (os.ID !== "ubuntu" || os.VERSION_ID !== pins.ubuntu)
      return { ok: false, code: "HOST_UBUNTU_MISMATCH" };
    const info = observation.info;
    if (
      !info ||
      info.OSType !== "linux" ||
      typeof info.OperatingSystem !== "string" ||
      !/^Ubuntu(?: |$)/u.test(info.OperatingSystem) ||
      typeof observation.kernel !== "string" ||
      !observation.kernel ||
      info.KernelVersion !== observation.kernel
    )
      return { ok: false, code: "HOST_DAEMON_MISMATCH" };
    if (
      info.ServerVersion !== pins.engine ||
      observation.compose !== pins.compose
    )
      return { ok: false, code: "HOST_VERSION_MISMATCH" };
    if (info.CgroupVersion !== "2")
      return { ok: false, code: "HOST_CGROUP_V2_REQUIRED" };
    for (const key of [
      "MemoryLimit",
      "SwapLimit",
      "CpuCfsPeriod",
      "CpuCfsQuota",
      "PidsLimit",
    ])
      if (info[key] !== true)
        return { ok: false, code: "HOST_RESOURCE_CONTROL_UNAVAILABLE" };
    if (
      !Array.isArray(info.SecurityOptions) ||
      !info.SecurityOptions.includes("name=seccomp,profile=builtin")
    )
      return { ok: false, code: "HOST_SECCOMP_REQUIRED" };
    if (
      info.Warnings !== null &&
      (!Array.isArray(info.Warnings) || info.Warnings.length !== 0)
    )
      return { ok: false, code: "HOST_DAEMON_WARNINGS" };
    return { ok: true, versions: pins, cgroup: "2", seccomp: "builtin" };
  } catch {
    return { ok: false, code: "HOST_EVIDENCE_INVALID" };
  }
}
