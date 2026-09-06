export * from "./model.js";
export * from "./validate.js";
export * from "./catalog.js";
export * from "./public-projection.js";

import {
  V1_CAPABILITY_DEFINITIONS,
  V1_CAPABILITY_PUBLICATIONS,
} from "./catalog.js";
import { createPublicCapabilityProjection } from "./public-projection.js";

export function getV1PublicCapabilities() {
  return createPublicCapabilityProjection(
    V1_CAPABILITY_DEFINITIONS,
    V1_CAPABILITY_PUBLICATIONS,
  );
}
