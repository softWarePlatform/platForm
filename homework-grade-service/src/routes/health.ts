import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health/live", async () => ({ ok: true, service: "homework-grade-service", type: "live" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true, service: "homework-grade-service", type: "ready" };
    } catch {
      return reply.code(503).send({ ok: false, service: "homework-grade-service", reason: "database-not-ready" });
    }
  });
};

export default healthRoutes;
