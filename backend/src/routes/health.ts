import type { FastifyPluginAsync } from "fastify";
import { Redis } from "ioredis";
import { prisma } from "../lib/prisma.js";
import { config } from "../lib/config.js";

const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health/live", async () => {
    return { ok: true, service: "api", type: "live" };
  });

  app.get("/health/ready", async (_req, reply) => {
    await prisma.$queryRaw`SELECT 1`;
    const pong = await redis.ping();
    if (pong !== "PONG") return reply.code(503).send({ ok: false, reason: "redis-not-ready" });
    return { ok: true, service: "api", type: "ready" };
  });

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: "api", type: "compat" };
  });
};

export default healthRoutes;
