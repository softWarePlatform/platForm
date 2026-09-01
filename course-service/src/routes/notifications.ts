import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/notifications", { preHandler: authRequired() }, async (request) => {
    const rows = await prisma.siteNotification.findMany({ where: { userId: request.auth!.sub }, orderBy: { createdAt: "desc" }, take: 50 });
    return { notifications: rows.map((row) => ({ ...row, read: row.readAt !== null })) };
  });
  app.get("/notifications/unread-count", { preHandler: authRequired() }, async (request) => ({ count: await prisma.siteNotification.count({ where: { userId: request.auth!.sub, readAt: null } }) }));
  app.patch("/notifications/:id/read", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "通知 ID 无效" });
    const updated = await prisma.siteNotification.updateMany({ where: { id: params.data.id, userId: request.auth!.sub }, data: { readAt: new Date() } });
    if (!updated.count) return reply.code(404).send({ error: "通知不存在" });
    return { ok: true };
  });
};

export default notificationsRoutes;
