import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/users", { preHandler: authRequired("ADMIN") }, async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });

    return { users };
  });

  app.get("/admin/audit", { preHandler: authRequired("ADMIN") }, async () => {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, email: true, role: true },
    });

    const notifications = await prisma.siteNotification.findMany({
      where: { type: "ADMIN_ACTION" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    const logs = notifications.map((item) => ({
      id: item.id,
      time: item.createdAt.toISOString(),
      type: item.title === "删除用户" ? "ADMIN_DELETE_USER" : item.type,
      title: item.title,
      detail: [item.body, item.user ? `接收人：${item.user.name}` : null, item.readAt ? `已读于 ${item.readAt.toISOString()}` : "未读"]
        .filter(Boolean)
        .join(" · "),
    }));

    return { user: admins[0] ?? null, logs };
  });

  app.get("/admin/users/:userId/logs", { preHandler: authRequired("ADMIN") }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return reply.code(404).send({ error: "用户不存在" });

    const [enrollmentLogs, announcements, notifications] = await Promise.all([
      prisma.enrollmentLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          course: { select: { id: true, title: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      prisma.courseAnnouncement.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { course: { select: { id: true, title: true } } },
      }),
      prisma.siteNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      user,
      logs: {
        enrollment: enrollmentLogs.map((log) => ({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          action: log.action,
          courseId: log.courseId,
          courseTitle: log.course.title,
          operatorName: log.operator?.name ?? null,
          note: log.note,
        })),
        announcements: announcements.map((item) => ({
          id: item.id,
          createdAt: item.createdAt.toISOString(),
          title: item.title,
          courseId: item.courseId,
          courseTitle: item.course.title,
        })),
        notifications: notifications.map((item) => ({
          id: item.id,
          createdAt: item.createdAt.toISOString(),
          title: item.title,
          body: item.body,
          type: item.type,
          readAt: item.readAt?.toISOString() ?? null,
        })),
      },
    };
  });

  app.delete("/admin/users/:userId", { preHandler: authRequired("ADMIN") }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const currentUserId = req.auth!.sub;
    if (userId === currentUserId) return reply.code(400).send({ error: "不能删除当前登录的管理员账号" });

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true } });
    if (!target) return reply.code(404).send({ error: "用户不存在" });
    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) return reply.code(400).send({ error: "至少保留一名管理员" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: userId } });
      await tx.siteNotification.create({
        data: {
          userId: currentUserId,
          type: "ADMIN_ACTION",
          title: "删除用户",
          body: `删除了用户「${target.name}」(${target.email})`,
          linkPath: "/admin/logs",
        },
      });
    });
    return { ok: true };
  });
};

export default adminRoutes;
