import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { verifyToken } from "../lib/jwt.js";
import { addNotificationClient } from "../lib/notification-events.js";

const notificationsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/notifications/events", async (req, reply) => {
    const query = z.object({ token: z.string().min(1) }).safeParse(req.query);
    if (!query.success) return reply.code(401).send({ error: "未登录" });

    let payload: ReturnType<typeof verifyToken>;
    try {
      payload = verifyToken(query.data.token);
    } catch {
      return reply.code(401).send({ error: "登录已过期" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": connected\n\n");

    const remove = addNotificationClient(payload.sub, {
      id: req.id,
      write: (chunk) => reply.raw.write(chunk),
    });
    const heartbeat = setInterval(() => {
      reply.raw.write(": heartbeat\n\n");
    }, 25000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      remove();
    });
  });

  app.get("/notifications/unread-count", { preHandler: authRequired() }, async (req) => {
    const count = await prisma.siteNotification.count({
      where: { userId: req.auth!.sub, readAt: null },
    });
    return { count };
  });

  app.get("/notifications", { preHandler: authRequired() }, async (req) => {
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(20),
      })
      .safeParse(req.query);
    const page = query.success ? query.data.page : 1;
    const pageSize = query.success ? query.data.pageSize : 20;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prisma.siteNotification.count({ where: { userId: req.auth!.sub } }),
      prisma.siteNotification.findMany({
        where: { userId: req.auth!.sub },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          announcement: { select: { id: true, courseId: true, title: true } },
          homework: { select: { id: true, courseId: true } },
          material: { select: { id: true, courseId: true } },
          labSet: { select: { id: true, courseId: true } },
        },
      }),
    ]);

    const items = await Promise.all(
      rows.map(async (n) => {
        let deleted = false;
        if (n.announcementId && !n.announcement) {
          deleted = true;
        }
        return {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          linkPath: n.linkPath,
          announcementId: n.announcementId,
          homeworkId: n.homeworkId,
          materialId: n.materialId,
          labSetId: n.labSetId,
          read: n.readAt != null,
          createdAt: n.createdAt.toISOString(),
          announcementDeleted: deleted,
          courseId:
            n.announcement?.courseId ??
            n.homework?.courseId ??
            n.material?.courseId ??
            n.labSet?.courseId ??
            null,
        };
      }),
    );

    return { notifications: items, page, pageSize, total };
  });

  app.patch("/notifications/:id/read", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.siteNotification.findFirst({
      where: { id, userId: req.auth!.sub },
    });
    if (!row) return reply.code(404).send({ error: "通知不存在" });

    await prisma.siteNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });

  app.post("/notifications/read-all", { preHandler: authRequired() }, async (req) => {
    await prisma.siteNotification.updateMany({
      where: { userId: req.auth!.sub, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  });
};

export default notificationsRoutes;
