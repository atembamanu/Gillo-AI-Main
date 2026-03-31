import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { config } from "./config";
import { registerAuthRoutes } from "./routes/auth";
import { registerBucketRoutes } from "./routes/buckets";
import { registerNoteRoutes } from "./routes/notes";

/** Warm up Ollama so the first user request doesn't wait for model load. Runs in background after server starts. */
function warmupOllama() {
  const timeoutMs = 120_000;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  fetch(`${config.ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt: "Reply with exactly: OK",
      stream: false,
    }),
    signal: controller.signal,
  })
    .then((res) => {
      clearTimeout(t);
      if (res.ok) {
        console.log("[warmup] Ollama model loaded, first request will be fast");
      } else {
        console.warn("[warmup] Ollama responded with", res.status);
      }
    })
    .catch((err) => {
      clearTimeout(t);
      console.warn(
        "[warmup] Ollama warmup failed (first request may be slow):",
        err?.message ?? err,
      );
    });
}

async function main() {
  const fastify = Fastify({ logger: true, trustProxy: true });

  // Bearer tokens in Authorization do not need credentials: true; that flag tightens CORS
  // and can confuse browsers unless fetch() uses credentials: 'include' for cookies.
  await fastify.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    preflight: true,
    strictPreflight: false,
  });
  await fastify.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // allow up to ~50MB audio uploads
    },
  });
  await fastify.register(jwt, { secret: config.jwtSecret });

  fastify.decorate("authenticate", async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      const e = err as any;
      fastify.log.warn(
        {
          path: request.raw?.url,
          method: request.method,
          ip: request.ip,
          userAgent: request.headers["user-agent"],
          code: e?.code,
          msg: e?.message,
        },
        "auth verification failed",
      );
      return reply.send(err);
    }
  });

  fastify.get("/health", async () => ({ status: "ok" }));

  await fastify.register(
    async (app) => {
      await registerAuthRoutes(app);
    },
    { prefix: "/auth" },
  );

  await fastify.register(
    async (app) => {
      await registerBucketRoutes(app);
    },
    { prefix: "/buckets" },
  );

  await fastify.register(
    async (app) => {
      await registerNoteRoutes(app);
    },
    { prefix: "/notes" },
  );

  await fastify.listen({ port: config.port, host: "0.0.0.0" });

  setImmediate(warmupOllama);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
