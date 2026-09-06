import Fastify from "fastify";
import {
  createPublicCapabilitiesResponse,
  getV1PublicCapabilities,
  type PublicCapability,
} from "@outscan/capabilities";

export interface BuildAppOptions {
  getPublicCapabilities?: () => readonly PublicCapability[];
  now?: () => Date;
}

const PUBLIC_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    bodyLimit: 64 * 1024,
    logger: false,
    requestTimeout: 10_000,
  });
  const getPublicCapabilities =
    options.getPublicCapabilities ?? getV1PublicCapabilities;
  const generatedAt = (options.now ?? (() => new Date()))();

  app.get("/health", async (_request, reply) => {
    const payload = {
      service: "outscan-api",
      status: "ok",
      version: "0.1.0",
    } as const;

    return reply.header("cache-control", "no-store").send(payload);
  });

  app.get("/v1/public/capabilities", async (request, reply) => {
    if (Object.keys(request.query as object).length > 0) {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send({
          error: { code: "INVALID_QUERY" },
        });
    }

    try {
      const payload = createPublicCapabilitiesResponse(
        getPublicCapabilities(),
        generatedAt,
      );
      return reply.header("cache-control", PUBLIC_CACHE_CONTROL).send(payload);
    } catch {
      return reply
        .code(503)
        .header("cache-control", "no-store")
        .send({
          error: { code: "CAPABILITY_REGISTRY_UNAVAILABLE" },
        });
    }
  });

  return app;
}
