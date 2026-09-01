import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { internalRequired } from "../lib/auth.js";
import { courseAccess } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";

const id = z.string().uuid();
const notificationBody = z.object({
  userIds: z.array(id).min(1).max(500),
  type: z.string().min(1).max(64).default("SYSTEM"),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  linkPath: z.string().max(500).optional(),
  homeworkId: id.optional(),
  labSetId: id.optional(),
});

function badRequest(reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }, requestId: string, message: string) {
  return reply.code(400).send({ code: "VALIDATION_ERROR", message, requestId });
}

const internalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", internalRequired);

  app.get("/internal/users/:userId", async (request, reply) => {
    const params = z.object({ userId: id }).safeParse(request.params);
    if (!params.success) return badRequest(reply, request.id, "用户 ID 无效");
    const user = await prisma.user.findUnique({ where: { id: params.data.userId }, select: { id: true, email: true, name: true, role: true } });
    if (!user) return reply.code(404).send({ code: "USER_NOT_FOUND", message: "用户不存在", requestId: request.id });
    return { user: { ...user, status: "ACTIVE" }, requestId: request.id };
  });

  app.get("/internal/courses/:courseId", async (request, reply) => {
    const params = z.object({ courseId: id }).safeParse(request.params);
    if (!params.success) return badRequest(reply, request.id, "课程 ID 无效");
    const course = await prisma.course.findUnique({
      where: { id: params.data.courseId },
      include: { teacher: { select: { id: true, name: true, email: true } }, _count: { select: { enrollments: true } } },
    });
    if (!course) return reply.code(404).send({ code: "COURSE_NOT_FOUND", message: "课程不存在", requestId: request.id });
    return { course: { ...course, enrollmentCount: course._count.enrollments }, requestId: request.id };
  });

  app.get("/internal/courses/:courseId/access/:userId", async (request, reply) => {
    const params = z.object({ courseId: id, userId: id }).safeParse(request.params);
    if (!params.success) return badRequest(reply, request.id, "课程 ID 或用户 ID 无效");
    const user = await prisma.user.findUnique({ where: { id: params.data.userId }, select: { id: true, role: true } });
    if (!user) return reply.code(404).send({ code: "USER_NOT_FOUND", message: "用户不存在", requestId: request.id });
    const access = await courseAccess(user.id, user.role, params.data.courseId);
    if (!access.course) return reply.code(404).send({ code: "COURSE_NOT_FOUND", message: "课程不存在", requestId: request.id });
    return {
      access: {
        userId: user.id,
        courseId: access.course.id,
        role: user.role,
        canView: access.canView,
        isTeacher: access.isTeacher,
        isEnrolled: Boolean(access.enrollment),
        classId: access.enrollment?.classId ?? null,
        classIds: access.enrollment?.classId ? [access.enrollment.classId] : [],
      },
      requestId: request.id,
    };
  });

  app.get("/internal/courses/:courseId/enrollments", async (request, reply) => {
    const params = z.object({ courseId: id }).safeParse(request.params);
    if (!params.success) return badRequest(reply, request.id, "课程 ID 无效");
    const query = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(200),
      classId: id.optional(),
    }).safeParse(request.query);
    if (!query.success) return badRequest(reply, request.id, "名单查询参数无效");
    const course = await prisma.course.findUnique({ where: { id: params.data.courseId }, select: { id: true } });
    if (!course) return reply.code(404).send({ code: "COURSE_NOT_FOUND", message: "课程不存在", requestId: request.id });
    const where = { courseId: course.id, ...(query.data.classId ? { classId: query.data.classId } : {}) };
    const [total, enrollments] = await prisma.$transaction([
      prisma.enrollment.count({ where }),
      prisma.enrollment.findMany({
        where,
        skip: (query.data.page - 1) * query.data.pageSize,
        take: query.data.pageSize,
        orderBy: { user: { name: "asc" } },
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
      }),
    ]);
    return {
      courseId: course.id,
      items: enrollments.map((row) => ({ ...row.user, classId: row.classId })),
      total,
      page: query.data.page,
      pageSize: query.data.pageSize,
      requestId: request.id,
    };
  });

  app.get("/internal/courses/:courseId/classes", async (request, reply) => {
    const params = z.object({ courseId: id }).safeParse(request.params);
    if (!params.success) return badRequest(reply, request.id, "课程 ID 无效");
    const course = await prisma.course.findUnique({ where: { id: params.data.courseId }, select: { id: true } });
    if (!course) return reply.code(404).send({ code: "COURSE_NOT_FOUND", message: "课程不存在", requestId: request.id });
    const classes = await prisma.class.findMany({ where: { courseId: course.id }, include: { _count: { select: { enrollments: true } } }, orderBy: { name: "asc" } });
    return { classes: classes.map((item) => ({ id: item.id, name: item.name, enrollmentCount: item._count.enrollments })), requestId: request.id };
  });

  app.post("/internal/notifications", async (request, reply) => {
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.trim().length < 8 || key.length > 200) return badRequest(reply, request.id, "必须提供 8 至 200 位 Idempotency-Key");
    const body = notificationBody.safeParse(request.body);
    if (!body.success) return badRequest(reply, request.id, "通知参数无效");
    const userIds = [...new Set(body.data.userIds)];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true } });
    if (users.length !== userIds.length) return reply.code(404).send({ code: "USER_NOT_FOUND", message: "存在无效通知用户", requestId: request.id });

    const existing = await prisma.internalNotificationRequest.findUnique({ where: { idempotencyKey: key }, include: { notification: true } });
    if (existing) return reply.send({ created: 0, deduped: existing.notificationCount, notification: existing.notification, idempotentReplay: true, requestId: request.id });
    try {
      const notifications = userIds.map((userId) => ({
        id: randomUUID(),
        userId,
        type: body.data.type,
        title: body.data.title,
        body: body.data.body,
        linkPath: body.data.linkPath,
        homeworkId: body.data.homeworkId,
        labSetId: body.data.labSetId,
      }));
      const created = await prisma.$transaction(async (tx) => {
        await tx.siteNotification.createMany({ data: notifications });
        return tx.internalNotificationRequest.create({
          data: { idempotencyKey: key, notificationId: notifications[0]!.id, notificationCount: notifications.length },
          include: { notification: true },
        });
      });
      return reply.code(201).send({ created: notifications.length, deduped: 0, notification: created.notification, idempotentReplay: false, requestId: request.id });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002") throw error;
      const replay = await prisma.internalNotificationRequest.findUniqueOrThrow({ where: { idempotencyKey: key }, include: { notification: true } });
      return reply.send({ created: 0, deduped: replay.notificationCount, notification: replay.notification, idempotentReplay: true, requestId: request.id });
    }
  });

  app.post("/internal/dashboard/course-summaries:batch", async (request, reply) => {
    const body = z.object({ courseIds: z.array(id).min(1).max(100) }).safeParse(request.body);
    if (!body.success) return badRequest(reply, request.id, "课程 ID 列表无效");
    const courses = await prisma.course.findMany({
      where: { id: { in: body.data.courseIds } },
      include: { teacher: { select: { id: true, name: true } }, _count: { select: { enrollments: true, announcements: true } } },
    });
    const summaries = courses.map((course) => ({
      courseId: course.id,
      title: course.title,
      teacher: course.teacher,
      enrollmentCount: course._count.enrollments,
      announcementCount: course._count.announcements,
      semesterKey: course.semesterKey,
    }));
    return { summaries, missingCourseIds: body.data.courseIds.filter((courseId) => !courses.some((course) => course.id === courseId)), requestId: request.id };
  });
};

export default internalRoutes;
