import {
  RESULT_ENVELOPE_AUDIENCE,
  type ResultEnvelopeKeyring,
} from "../result-envelope/index.js";
import { BUDGET_CEILINGS } from "../scanner-policy/index.js";
import {
  createPostgresGuestLeasePersistence,
  createPostgresGuestResultCommitter,
  createPostgresGuestResultRejectionSink,
} from "../guest-persistence/index.js";
import {
  createBullMqGuestQueueWorker,
  createGuestExecutionContextProvider,
  createGuestQueueProcessor,
  createGuestSupervisorAttemptRunner,
  GUEST_QUEUE_HEARTBEAT_INTERVAL_MS,
  type GuestRedisConnection,
} from "../guest-queue/index.js";
import { startGuestQueueTelemetryScheduler } from "../guest-telemetry/index.js";
import {
  GUEST_SUPERVISOR_WORKLOAD_IDENTITY,
  SUPERVISOR_MAX_TERMINATION_GRACE_MS,
} from "../supervisor/index.js";
import type {
  GuestWorkerDependencies,
  GuestWorkerOptions,
  GuestWorkerRuntime,
  GuestWorkerTransportFactory,
  GuestWorkerTransportHandle,
} from "./model.js";

const DEFAULT_TERMINATION_GRACE_MS = 1_000;
const DEFAULT_TELEMETRY_FLUSH_INTERVAL_MS = 10_000;
const MAX_CONCURRENCY = 64;
const MAX_KEY_VERSION = 0xffff_ffff;

const DEFAULT_TRANSPORT_FACTORY: GuestWorkerTransportFactory = Object.freeze({
  start(
    connection: Parameters<GuestWorkerTransportFactory["start"]>[0],
    process: Parameters<GuestWorkerTransportFactory["start"]>[1],
    options: Parameters<GuestWorkerTransportFactory["start"]>[2],
  ) {
    return createBullMqGuestQueueWorker(connection, process, options);
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function options(
  value: GuestWorkerOptions,
): Required<GuestWorkerOptions> | null {
  if (!isRecord(value)) return null;
  try {
    const keys = Reflect.ownKeys(value);
    if (
      keys.some(
        (key) =>
          typeof key !== "string" ||
          ![
            "concurrency",
            "heartbeat_interval_ms",
            "termination_grace_ms",
            "telemetry_flush_interval_ms",
          ].includes(key),
      )
    ) {
      return null;
    }
    const concurrency = value.concurrency ?? 1;
    const heartbeat =
      value.heartbeat_interval_ms ?? GUEST_QUEUE_HEARTBEAT_INTERVAL_MS;
    const grace = value.termination_grace_ms ?? DEFAULT_TERMINATION_GRACE_MS;
    const telemetryFlush =
      value.telemetry_flush_interval_ms ?? DEFAULT_TELEMETRY_FLUSH_INTERVAL_MS;
    if (
      !Number.isSafeInteger(concurrency) ||
      (concurrency as number) < 1 ||
      (concurrency as number) > MAX_CONCURRENCY ||
      !Number.isSafeInteger(heartbeat) ||
      (heartbeat as number) < 100 ||
      (heartbeat as number) > 10_000 ||
      !Number.isSafeInteger(grace) ||
      (grace as number) < 0 ||
      (grace as number) > SUPERVISOR_MAX_TERMINATION_GRACE_MS ||
      !Number.isSafeInteger(telemetryFlush) ||
      (telemetryFlush as number) < 1_000 ||
      (telemetryFlush as number) > 300_000
    ) {
      return null;
    }
    return Object.freeze({
      concurrency: concurrency as number,
      heartbeat_interval_ms: heartbeat as number,
      termination_grace_ms: grace as number,
      telemetry_flush_interval_ms: telemetryFlush as number,
    });
  } catch {
    return null;
  }
}

function keyring(value: unknown): ResultEnvelopeKeyring | null {
  if (!(value instanceof Map) || value.size < 1 || value.size > 3) return null;
  const snapshot = new Map<number, Uint8Array>();
  try {
    for (const [version, key] of value) {
      if (
        !Number.isSafeInteger(version) ||
        version < 0 ||
        version > MAX_KEY_VERSION ||
        !(key instanceof Uint8Array) ||
        key.byteLength !== 32
      ) {
        return null;
      }
      snapshot.set(version, Buffer.from(key));
    }
  } catch {
    return null;
  }
  return snapshot;
}

function boundedCredential(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function redisConnection(value: unknown): GuestRedisConnection | null {
  if (!isRecord(value)) return null;
  try {
    const username = value.username;
    const password = value.password;
    const allowed = new Set([
      "host",
      "port",
      "db",
      "username",
      "password",
      "connectTimeout",
      "enableReadyCheck",
      "maxRetriesPerRequest",
      "tls",
    ]);
    const keys = Reflect.ownKeys(value);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      typeof value.host !== "string" ||
      value.host.length < 1 ||
      value.host.length > 253 ||
      !Number.isSafeInteger(value.port) ||
      (value.port as number) < 1 ||
      (value.port as number) > 65_535 ||
      !Number.isSafeInteger(value.db) ||
      (value.db as number) < 0 ||
      (value.db as number) > 15 ||
      value.connectTimeout !== 5_000 ||
      value.enableReadyCheck !== true ||
      value.maxRetriesPerRequest !== null ||
      (username !== undefined && !boundedCredential(username, 1, 128)) ||
      (password !== undefined && !boundedCredential(password, 1, 512)) ||
      (username !== undefined && password === undefined)
    ) {
      return null;
    }
    let tls: GuestRedisConnection["tls"];
    if (value.tls !== undefined) {
      if (
        !isRecord(value.tls) ||
        Reflect.ownKeys(value.tls).length !== 3 ||
        value.tls.minVersion !== "TLSv1.2" ||
        value.tls.rejectUnauthorized !== true ||
        value.tls.servername !== value.host ||
        password === undefined
      ) {
        return null;
      }
      tls = Object.freeze({
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        servername: value.host,
      });
    }
    return Object.freeze({
      host: value.host,
      port: value.port as number,
      db: value.db as number,
      ...(username === undefined ? {} : { username }),
      ...(password === undefined ? {} : { password }),
      connectTimeout: 5_000,
      enableReadyCheck: true,
      maxRetriesPerRequest: null,
      ...(tls === undefined ? {} : { tls }),
    });
  } catch {
    return null;
  }
}

function dependencies(value: GuestWorkerDependencies) {
  if (!isRecord(value)) return null;
  try {
    const verificationKeyring = keyring(value.result_verification_keyring);
    const connection = redisConnection(value.redis_connection);
    if (
      typeof value.pool?.connect !== "function" ||
      !connection ||
      typeof value.approval_provider?.get_active_approval !== "function" ||
      typeof value.launcher?.launch !== "function" ||
      typeof value.signing_key_provider?.get_active_key !== "function" ||
      !verificationKeyring ||
      typeof value.telemetry?.record !== "function" ||
      typeof value.telemetry?.flush !== "function" ||
      typeof value.on_telemetry_outcome !== "function" ||
      typeof value.create_attempt_id !== "function" ||
      typeof value.now_unix_seconds !== "function"
    ) {
      return null;
    }
    return {
      pool: value.pool,
      redis_connection: connection,
      approval_provider: {
        get_active_approval: value.approval_provider.get_active_approval.bind(
          value.approval_provider,
        ),
      },
      launcher: { launch: value.launcher.launch.bind(value.launcher) },
      signing_key_provider: {
        get_active_key: value.signing_key_provider.get_active_key.bind(
          value.signing_key_provider,
        ),
      },
      result_verification_keyring: verificationKeyring,
      telemetry: {
        record: value.telemetry.record.bind(value.telemetry),
        flush: value.telemetry.flush.bind(value.telemetry),
      },
      on_telemetry_outcome: value.on_telemetry_outcome.bind(value),
      create_attempt_id: value.create_attempt_id.bind(value),
      now_unix_seconds: value.now_unix_seconds.bind(value),
    };
  } catch {
    return null;
  }
}

function transportFactory(value: unknown): GuestWorkerTransportFactory | null {
  if (!isRecord(value)) return null;
  try {
    const start = value.start;
    return typeof start === "function"
      ? Object.freeze({ start: start.bind(value) })
      : null;
  } catch {
    return null;
  }
}

function transportHandle(value: unknown): GuestWorkerTransportHandle | null {
  if (!isRecord(value)) return null;
  try {
    const ready = value.waitUntilReady;
    const close = value.close;
    return typeof ready === "function" && typeof close === "function"
      ? {
          waitUntilReady: ready.bind(value),
          close: close.bind(value),
        }
      : null;
  } catch {
    return null;
  }
}

function closeMalformedTransport(value: unknown): void {
  if (!isRecord(value)) return;
  try {
    const close = value.close;
    if (typeof close === "function") {
      void Promise.resolve(close.call(value, true)).catch(() => undefined);
    }
  } catch {
    // Construction already failed closed; cleanup must not expose details.
  }
}

export function createGuestWorkerRuntime(
  rawDependencies: GuestWorkerDependencies,
  rawOptions: GuestWorkerOptions = {},
  rawTransportFactory: GuestWorkerTransportFactory = DEFAULT_TRANSPORT_FACTORY,
): GuestWorkerRuntime {
  const deps = dependencies(rawDependencies);
  const config = options(rawOptions);
  const factory = transportFactory(rawTransportFactory);
  if (!deps || !config || !factory) {
    throw new Error("INVALID_GUEST_WORKER_CONFIGURATION");
  }
  const leases = createPostgresGuestLeasePersistence({
    pool: deps.pool,
    create_attempt_id: deps.create_attempt_id,
    now_unix_seconds: deps.now_unix_seconds,
  });
  const processor = createGuestQueueProcessor({
    leases,
    contexts: createGuestExecutionContextProvider({
      approval_provider: deps.approval_provider,
      now_unix_seconds: deps.now_unix_seconds,
    }),
    runner: createGuestSupervisorAttemptRunner({
      launcher: deps.launcher,
      signing_key_provider: deps.signing_key_provider,
      now_unix_seconds: deps.now_unix_seconds,
      termination_grace_ms: config.termination_grace_ms,
    }),
    committer: createPostgresGuestResultCommitter({
      pool: deps.pool,
      result_keyring: deps.result_verification_keyring,
      expected_workload_identity: GUEST_SUPERVISOR_WORKLOAD_IDENTITY,
      expected_audience: RESULT_ENVELOPE_AUDIENCE,
      max_payload_bytes: BUDGET_CEILINGS.GUEST_SAFE.max_output_bytes,
      now_unix_seconds: deps.now_unix_seconds,
    }),
    result_rejections: createPostgresGuestResultRejectionSink(deps.pool),
    telemetry: deps.telemetry,
    heartbeat_interval_ms: config.heartbeat_interval_ms,
  });
  let rawHandle: unknown;
  try {
    rawHandle = factory.start(deps.redis_connection, processor, {
      concurrency: config.concurrency,
    });
  } catch {
    throw new Error("GUEST_WORKER_START_FAILED");
  }
  const handle = transportHandle(rawHandle);
  if (!handle) {
    closeMalformedTransport(rawHandle);
    throw new Error("GUEST_WORKER_START_FAILED");
  }
  const telemetryScheduler = startGuestQueueTelemetryScheduler(
    deps.telemetry,
    config.telemetry_flush_interval_ms,
    deps.on_telemetry_outcome,
  );
  let ready: Promise<void> | null = null;
  let closing: Promise<void> | null = null;
  return Object.freeze({
    ready() {
      ready ??= Promise.resolve()
        .then(() => handle.waitUntilReady())
        .then(
          () => undefined,
          () => {
            throw new Error("GUEST_WORKER_START_FAILED");
          },
        );
      return ready;
    },
    close() {
      closing ??= (async () => {
        let transportFailed = false;
        try {
          await handle.close(false);
        } catch {
          transportFailed = true;
        }
        const telemetryOutcome = await telemetryScheduler.stop();
        if (transportFailed) throw new Error("GUEST_WORKER_STOP_FAILED");
        if (!telemetryOutcome.ok) {
          throw new Error("GUEST_WORKER_TELEMETRY_FLUSH_FAILED");
        }
      })();
      return closing;
    },
  });
}
