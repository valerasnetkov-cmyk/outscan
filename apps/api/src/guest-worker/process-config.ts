import { isAbsolute } from "node:path";

import { SCANNER_POLICY_IDENTITY } from "../scanner-policy/index.js";
import {
  parseArtifactIdentity,
  type ScannerArtifactIdentity,
} from "../supervisor/index.js";

const MAX_PATH_LENGTH = 1_024;
const MAX_ARGUMENTS_JSON_LENGTH = 16 * 1_024;
const MAX_ARGUMENTS = 32;
const MAX_ARGUMENT_LENGTH = 2_048;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

export interface GuestWorkerProcessEnvironment {
  OUTSCAN_GUEST_APPROVAL_FILE?: string;
  OUTSCAN_RESULT_SIGNING_KEY_FILE?: string;
  OUTSCAN_RESULT_VERIFICATION_KEYRING_FILE?: string;
  OUTSCAN_SCANNER_EXECUTABLE?: string;
  OUTSCAN_SCANNER_WORKING_DIRECTORY?: string;
  OUTSCAN_SCANNER_ARGUMENTS_JSON?: string;
}

export interface GuestWorkerProcessConfiguration {
  approval_file: string;
  signing_key_file: string;
  verification_keyring_file: string;
  scanner_executable: string;
  scanner_working_directory: string;
  scanner_arguments: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): boolean {
  if (!isRecord(value)) return false;
  try {
    const actual = Reflect.ownKeys(value);
    return (
      actual.length === keys.length &&
      actual.every((key) => typeof key === "string" && keys.includes(key))
    );
  } catch {
    return false;
  }
}

function absolutePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !CONTROL_CHARACTERS.test(value) &&
    isAbsolute(value)
  );
}

function argumentsList(value: unknown): readonly string[] | null {
  if (
    typeof value !== "string" ||
    value.length < 2 ||
    value.length > MAX_ARGUMENTS_JSON_LENGTH
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length > MAX_ARGUMENTS ||
      !parsed.every(
        (argument) =>
          typeof argument === "string" &&
          argument.length <= MAX_ARGUMENT_LENGTH &&
          !CONTROL_CHARACTERS.test(argument),
      )
    ) {
      return null;
    }
    return Object.freeze([...parsed]);
  } catch {
    return null;
  }
}

export function guestWorkerProcessConfiguration(
  environment: GuestWorkerProcessEnvironment,
): Readonly<GuestWorkerProcessConfiguration> {
  try {
    const approvalFile = environment.OUTSCAN_GUEST_APPROVAL_FILE;
    const signingKeyFile = environment.OUTSCAN_RESULT_SIGNING_KEY_FILE;
    const verificationKeyringFile =
      environment.OUTSCAN_RESULT_VERIFICATION_KEYRING_FILE;
    const scannerExecutable = environment.OUTSCAN_SCANNER_EXECUTABLE;
    const scannerWorkingDirectory =
      environment.OUTSCAN_SCANNER_WORKING_DIRECTORY;
    const scannerArguments = argumentsList(
      environment.OUTSCAN_SCANNER_ARGUMENTS_JSON,
    );
    if (
      !absolutePath(approvalFile) ||
      !absolutePath(signingKeyFile) ||
      !absolutePath(verificationKeyringFile) ||
      !absolutePath(scannerExecutable) ||
      !absolutePath(scannerWorkingDirectory) ||
      !scannerArguments
    ) {
      throw new Error();
    }
    return Object.freeze({
      approval_file: approvalFile,
      signing_key_file: signingKeyFile,
      verification_keyring_file: verificationKeyringFile,
      scanner_executable: scannerExecutable,
      scanner_working_directory: scannerWorkingDirectory,
      scanner_arguments: scannerArguments,
    });
  } catch {
    throw new Error("INVALID_GUEST_WORKER_PROCESS_CONFIGURATION");
  }
}

export function approvedGuestArtifact(
  value: unknown,
): Readonly<ScannerArtifactIdentity> | null {
  if (!exact(value, ["approval_id", "status", "artifact_identity"])) {
    return null;
  }
  try {
    const artifact = parseArtifactIdentity(
      Reflect.get(value as object, "artifact_identity"),
    );
    return Reflect.get(value as object, "status") === "APPROVED" &&
      artifact?.policy_id === SCANNER_POLICY_IDENTITY.policy_id &&
      artifact.policy_version === SCANNER_POLICY_IDENTITY.policy_version &&
      artifact.profile === "GUEST_SAFE"
      ? Object.freeze(artifact)
      : null;
  } catch {
    return null;
  }
}
