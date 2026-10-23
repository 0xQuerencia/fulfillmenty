import "dotenv/config";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { config } from "./config.js";
import { db } from "./db.js";
import { registerRoutes } from "./routes.js";

const app = Fastify({
  logger: {
    level: config.logLevel,
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-api-key"],
      censor: "[REDACTED]",
    },
  },
  genReqId: () => `req_${randomUUID()}`,
  bodyLimit: 64 * 1024,
  requestTimeout: 15_000,
  trustProxy: false,
});

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || config.webOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["content-type", "authorization", "x-demo-role", "idempotency-key"],
  exposedHeaders: ["x-request-id", "x-ratelimit-limit", "x-ratelimit-remaining", "retry-after"],
  maxAge: 600,
});

await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
  keyGenerator: (request) => request.ip,
  errorResponseBuilder: (request, context) => ({
    error: { code: "RATE_LIMITED", message: "Request limit reached. Retry after the published cooldown." },
    request_id: request.id,
    retry_after_seconds: Math.ceil(context.ttl / 1000),
  }),
});

await app.register(swagger, {
  openapi: {
    openapi: "3.1.0",
    info: {
      title: "Fulfillmenty API",
      version: "1.0.0",
      description: "Independent product sourcing catalog API. Missing shipping or tax values remain unknown. Demo records are synthetic and do not represent live merchant offers.",
    },
    servers: [{ url: "http://localhost:4000", description: "Local development" }],
    tags: [{ name: "System" }, { name: "Catalog" }, { name: "Offers" }, { name: "Community" }, { name: "Moderation" }],
    components: {
      securitySchemes: {
        BearerAuth: { type: "http", scheme: "bearer" },
        LocalDemoRole: { type: "apiKey", in: "header", name: "X-Demo-Role", description: "Development only; disabled in production." },
      },
    },
  },
});
await app.register(swaggerUi, { routePrefix: "/docs", uiConfig: { docExpansion: "list", deepLinking: true } });

app.addHook("onRequest", async (request, reply) => {
  reply.header("x-request-id", request.id);
  reply.header("cache-control", "no-store");
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "no-referrer");
});

app.setErrorHandler((error, request, reply) => {
  if (typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 429) {
    return reply.code(429).send({ error: { code: "RATE_LIMITED", message: "Request limit reached." }, request_id: request.id });
  }
  request.log.error({ err: error }, "Unhandled API error");
  return reply.code(500).send({
    error: { code: "INTERNAL_ERROR", message: "The request could not be completed." },
    request_id: request.id,
  });
});

await registerRoutes(app);

app.addHook("onClose", async () => {
  await db.end();
});

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info({ host: config.host, port: config.port, localDemo: config.localDemo }, "Fulfillmenty API ready");
} catch (error) {
  app.log.error({ err: error }, "API startup failed");
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void app.close());
}
