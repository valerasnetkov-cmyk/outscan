import { snapshotConfiguredInternalCidrs } from "../target/index.js";

export interface GuestScannerRuntimeConfiguration {
  dns: unknown;
  configured_internal_cidrs: readonly string[];
}

export function guestScannerRuntimeConfiguration(
  value: unknown,
): Readonly<GuestScannerRuntimeConfiguration> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  try {
    const keys = Reflect.ownKeys(value);
    const schemaVersion = Reflect.get(value, "schema_version");
    const dns = Reflect.get(value, "dns");
    const cidrs = snapshotConfiguredInternalCidrs(
      Reflect.get(value, "configured_internal_cidrs"),
    );
    if (
      keys.length !== 3 ||
      !keys.includes("schema_version") ||
      !keys.includes("dns") ||
      !keys.includes("configured_internal_cidrs") ||
      schemaVersion !== 1 ||
      !cidrs
    ) {
      return null;
    }
    return Object.freeze({ dns, configured_internal_cidrs: cidrs });
  } catch {
    return null;
  }
}
