import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { Redis } from "ioredis";
import { labConfig as config } from "./config.js";
import { prisma } from "./prisma.js";
import discussionsRoutes from "../../backend/src/routes/discussions.js";
import labFilesRoutes from "./routes/lab-files.js";
import labOverviewRoutes from "./routes/lab-overview.js";
import labSetsRoutes from "./routes/lab-sets.js";
import labsRoutes from "./routes/labs.js";
import practiceRoutes from "./routes/practice.js";
import internalLabGradesRoutes from "./internal-lab-grades.js";
import internalWrongBookRoutes from "./internal-wrong-book.js";
import { CourseClientError } from "./course-client.js";

function parseOrigins(): boolean | string | string[] {
  const raw = config.corsOrigin;
  if (typeof raw === "boolean") return raw;
  if (!raw || raw === "true") return true;
  return raw.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true,
    bodyLimit: config.bodyLimitBytes,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "requestId",
  });
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });

  await app.register(cors, { origin: parseOrigins(), credentials: true });
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  await app.register(rateLimit, {
    global: true,
    max: config.globalRateLimitMaxPerMinute,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    reply.header("X-Request-ID", req.id);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof CourseClientError || (error instanceof Error && error.name === "TimeoutError")) {
      request.log.warn({ err: error }, "course service unavailable");
      return reply.code(503).send({
        code: "COURSE_UNAVAILABLE",
        message: "课程服务暂时不可用",
        requestId: request.id,
      });
    }
    return reply.send(error);
  });

  app.get("/health/live", async () => ({
    ok: true,
    service: "lab-practice-service",
    type: "live",
  }));

  app.get("/health/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (redis.status === "wait") await redis.connect();
      const pong = await redis.ping();
      if (pong !== "PONG") throw new Error("redis-not-ready");
      return {
        ok: true,
        service: "lab-practice-service",
        type: "ready",
      };
    } catch (error) {
      app.log.error(error, "lab-practice-service readiness check failed");
      return reply.code(503).send({
        ok: false,
        service: "lab-practice-service",
        type: "ready",
      });
    }
  });

  // 讨论路由包含 /labs/:labId/discussions，必须在 /labs/:id 之前注册。
  await app.register(labSetsRoutes);
  await app.register(labOverviewRoutes);
  await app.register(discussionsRoutes);
  await app.register(labsRoutes);
  await app.register(labFilesRoutes);
  await app.register(practiceRoutes);
  await app.register(internalLabGradesRoutes);
  await app.register(internalWrongBookRoutes);

  app.addHook("onClose", async () => {
    if (redis.status !== "end") await redis.quit();
    await prisma.$disconnect();
  });

  return app;
}
