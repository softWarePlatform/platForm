import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { semesterKey } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";

type Slot = { dayOfWeek: number; periodStart: number; periodEnd: number };

function slots(raw: string | null): Slot[] {
  try { return raw ? JSON.parse(raw) as Slot[] : []; } catch { return []; }
}

function hasConflict(left: string | null, right: string | null) {
  return slots(left).some((a) => slots(right).some((b) => a.dayOfWeek === b.dayOfWeek && a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd));
}

async function enrollmentOpen() {
  const period = await prisma.enrollmentPeriod.findUnique({ where: { semesterKey: semesterKey() } });
  const now = new Date();
  return { period, open: Boolean(period && period.phase !== "CLOSED" && period.openAt <= now && now <= period.closeAt) };
}

const enrollmentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/enrollment/status", { preHandler: authRequired() }, async () => {
    const { period, open } = await enrollmentOpen();
    return { open, phase: period?.phase ?? "CLOSED", semesterKey: semesterKey(), openAt: period?.openAt ?? null, closeAt: period?.closeAt ?? null };
  });

  app.get("/enrollment/catalog", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const query = z.object({ search: z.string().optional(), semesterKey: z.string().optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "参数无效" });
    const where = { published: true, semesterKey: query.data.semesterKey ?? semesterKey(), ...(query.data.search ? { OR: [{ title: { contains: query.data.search, mode: "insensitive" as const } }, { courseCode: { contains: query.data.search, mode: "insensitive" as const } }] } : {}) };
    const courses = await prisma.course.findMany({ where, include: { teacher: { select: { id: true, name: true } }, _count: { select: { enrollments: true } } }, orderBy: { createdAt: "desc" } });
    const mine = await prisma.enrollment.findMany({ where: { userId: request.auth!.sub }, select: { courseId: true } });
    const enrolled = new Set(mine.map((row) => row.courseId));
    const state = await enrollmentOpen();
    return { open: state.open, courses: courses.map((course) => ({ id: course.id, title: course.title, courseCode: course.courseCode, capacity: course.capacity, enrollmentCount: course._count.enrollments, teacher: course.teacher, enrolled: enrolled.has(course.id), full: course._count.enrollments >= course.capacity })) };
  });

  app.post("/enrollment/courses/:courseId/enroll", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const state = await enrollmentOpen();
    if (!state.open) return reply.code(403).send({ error: "当前不在选课时间内" });
    try {
      const enrollment = await prisma.$transaction(async (tx) => {
        const course = await tx.course.findUnique({ where: { id: params.data.courseId } });
        if (!course || !course.published) throw Object.assign(new Error("课程不存在或未发布"), { statusCode: 404 });
        if (await tx.enrollment.findUnique({ where: { userId_courseId: { userId: request.auth!.sub, courseId: course.id } } })) throw Object.assign(new Error("已经选过该课程"), { statusCode: 409 });
        const count = await tx.enrollment.count({ where: { courseId: course.id } });
        if (count >= course.capacity) throw Object.assign(new Error("课程已满，请加入候补"), { statusCode: 409 });
        const existing = await tx.enrollment.findMany({ where: { userId: request.auth!.sub }, include: { course: { select: { scheduleSlotsJson: true } } } });
        if (existing.some((row) => hasConflict(course.scheduleSlotsJson, row.course.scheduleSlotsJson))) throw Object.assign(new Error("课程时间冲突"), { statusCode: 409 });
        const created = await tx.enrollment.create({ data: { userId: request.auth!.sub, courseId: course.id } });
        await tx.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: course.id, operatorId: request.auth!.sub, action: "ENROLL" } });
        return created;
      });
      return reply.code(201).send({ ok: true, enrollment });
    } catch (error) {
      const detail = error as Error & { statusCode?: number };
      return reply.code(detail.statusCode ?? 500).send({ error: detail.message || "选课失败" });
    }
  });

  app.delete("/enrollment/courses/:courseId/enroll", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const result = await prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({ where: { userId_courseId: { userId: request.auth!.sub, courseId: params.data.courseId } } });
      if (!enrollment) return null;
      await tx.enrollment.delete({ where: { id: enrollment.id } });
      await tx.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: params.data.courseId, operatorId: request.auth!.sub, action: "DROP" } });
      const candidate = await tx.enrollmentWaitlist.findFirst({ where: { courseId: params.data.courseId }, orderBy: { createdAt: "asc" } });
      if (candidate) {
        await tx.enrollment.create({ data: { userId: candidate.userId, courseId: candidate.courseId } });
        await tx.enrollmentWaitlist.delete({ where: { id: candidate.id } });
        await tx.enrollmentLog.create({ data: { userId: candidate.userId, courseId: candidate.courseId, action: "WAITLIST_PROMOTED" } });
        await tx.siteNotification.create({ data: { userId: candidate.userId, type: "ENROLLMENT", title: "候补已转正", body: "已有名额，请查看我的课程", linkPath: `/courses/${candidate.courseId}` } });
      }
      return { promotedUserId: candidate?.userId ?? null };
    });
    if (!result) return reply.code(404).send({ error: "未找到选课记录" });
    return { ok: true, ...result };
  });

  app.post("/enrollment/courses/:courseId/waitlist", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    try {
      const course = await prisma.course.findUnique({ where: { id: params.data.courseId }, include: { _count: { select: { enrollments: true } } } });
      if (!course || !course.published) return reply.code(404).send({ error: "课程不存在或未发布" });
      if (course._count.enrollments < course.capacity) return reply.code(409).send({ error: "课程尚有名额，请直接选课" });
      const row = await prisma.enrollmentWaitlist.create({ data: { userId: request.auth!.sub, courseId: course.id } });
      await prisma.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: course.id, operatorId: request.auth!.sub, action: "WAITLIST_JOIN" } });
      return reply.code(201).send({ ok: true, waitlist: row });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return reply.code(409).send({ error: "已经在候补队列中" });
      throw error;
    }
  });
};

export default enrollmentRoutes;
