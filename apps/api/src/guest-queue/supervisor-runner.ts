import {
  runGuestScannerAttempt,
  type GuestSupervisorDependencies,
} from "../supervisor/index.js";
import type {
  GuestAttemptExecutionContext,
  GuestAttemptRunner,
} from "./model.js";

type BoundSupervisorDependencies = Omit<GuestSupervisorDependencies, "signal">;

export function createGuestSupervisorAttemptRunner(
  dependencies: BoundSupervisorDependencies,
): GuestAttemptRunner {
  if (!dependencies || typeof dependencies !== "object") {
    throw new Error("INVALID_GUEST_SUPERVISOR_RUNNER_CONFIGURATION");
  }
  return Object.freeze({
    run(context: Readonly<GuestAttemptExecutionContext>, signal: AbortSignal) {
      return runGuestScannerAttempt(context.envelope, context.trusted, {
        ...dependencies,
        signal,
      });
    },
  });
}
