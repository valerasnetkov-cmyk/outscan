import {
  guestScannerRuntimeConfiguration,
  runGuestSafeScanner,
} from "./guest-scanner/index.js";
import { encodeScannerIpcFrame } from "./scanner-ipc/index.js";
import { BUDGET_CEILINGS } from "./scanner-policy/index.js";
import { createRuntimeDnsResolver } from "./target/index.js";

const MAX_INPUT_BYTES = 16 * 1_024;
const MAX_INPUT_CHUNKS = 64;
const MAX_DNS_ARGUMENT_BYTES = 4 * 1_024;

async function readInput(): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  let count = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.from(chunk);
    total += bytes.byteLength;
    count += 1;
    if (total > MAX_INPUT_BYTES || count > MAX_INPUT_CHUNKS) throw new Error();
    chunks.push(bytes);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks, total),
  );
  return JSON.parse(text) as unknown;
}

function runtimeConfiguration(argumentsValue: readonly string[]) {
  if (
    argumentsValue.length !== 1 ||
    Buffer.byteLength(argumentsValue[0] ?? "", "utf8") > MAX_DNS_ARGUMENT_BYTES
  ) {
    throw new Error();
  }
  const parsed: unknown = JSON.parse(argumentsValue[0]!);
  const configuration = guestScannerRuntimeConfiguration(parsed);
  if (!configuration) throw new Error();
  return configuration;
}

async function writeOutput(value: Uint8Array): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(value, (error) => (error ? reject(error) : resolve()));
  });
}

try {
  const configuration = runtimeConfiguration(process.argv.slice(2));
  const runtimeDns = createRuntimeDnsResolver(configuration.dns);
  if (!runtimeDns.ok) throw new Error();
  const result = await runGuestSafeScanner(
    await readInput(),
    runtimeDns.resolver,
    { configured_internal_cidrs: configuration.configured_internal_cidrs },
  );
  if (!result.ok) throw new Error();
  const payload = Buffer.from(JSON.stringify(result.output), "utf8");
  const framed = encodeScannerIpcFrame(
    payload,
    BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes,
  );
  if (!framed.ok) throw new Error();
  await writeOutput(framed.frame);
} catch {
  process.stderr.write("Guest scanner failed.\n");
  process.exitCode = 1;
}
