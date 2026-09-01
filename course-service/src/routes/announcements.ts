import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { courseAccess } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";

const announcementsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses/:courseId/announcements", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const access = await courseAccess(request.auth!.sub, request.auth!.role, params.data.courseId);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.canView) return reply.code(403).send({ error: "未选课或无权查看" });
    const rows = await prisma.courseAnnouncement.findMany({ where: { courseId: access.course.id }, include: { author: { select: { id: true, name: true } }, reads: { where: { userId: request.auth!.sub }, select: { id: true } }, marks: { where: { userId: request.auth!.sub }, select: { id: true } } }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }] });
    return { announcements: rows.map((row) => ({ id: row.id, title: row.title, content: row.content, pinned: row.pinned, createdAt: row.createdAt, updatedAt: row.updatedAt, author: row.author, read: row.reads.length > 0 || access.isTeacher, marked: row.marks.length > 0 })) };
  });

  app.post("/courses/:courseId/announcements", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ title: z.string().min(1).max(100), content: z.string().min(1), pinned: z.boolean().optional() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "参数无效" });
    const access = await courseAccess(request.auth!.sub, request.auth!.role, params.data.courseId);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.isTeacher) return reply.code(403).send({ error: "仅课程教师可发布公告" });
    const result = await prisma.$transaction(async (tx) => {
      const announcement = await tx.courseAnnouncement.create({ data: { courseId: access.course!.id, authorId: request.auth!.sub, title: body.data.title.trim(), content: body.data.content, pinned: body.data.pinned ?? false }, include: { author: { select: { id: true, name: true } } } });
      const students = await tx.enrollment.findMany({ where: { courseId: access.course!.id }, select: { userId: true } });
      if (students.length) await tx.siteNotification.createMany({ data: students.map((student) => ({ userId: student.userId, type: "ANNOUNCEMENT", title: `课程公告：${announcement.title}`, body: announcement.content.slice(0, 120), announcementId: announcement.id, linkPath: `/courses/${announcement.courseId}/announcements/${announcement.id}` })) });
      return announcement;
    });
    return reply.code(201).send({ announcement: result });
  });

  app.post("/announcements/:id/read", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "公告 ID 无效" });
    const announcement = await prisma.courseAnnouncement.findUnique({ where: { id: params.data.id } });
    if (!announcement) return reply.code(404).send({ error: "公告不存在" });
    const access = await courseAccess(request.auth!.sub, request.auth!.role, announcement.courseId);
    if (!access.canView) return reply.code(403).send({ error: "无权查看公告" });
    const readAt = new Date();
    await prisma.$transaction([
      prisma.announcementRead.upsert({ where: { announcementId_userId: { announcementId: announcement.id, userId: request.auth!.sub } }, create: { announcementId: announcement.id, userId: request.auth!.sub, readAt }, update: { readAt } }),
      prisma.siteNotification.updateMany({ where: { userId: request.auth!.sub, announcementId: announcement.id, readAt: null }, data: { readAt } }),
    ]);
    return { ok: true };
  });
};

export default announcementsRoutes;
