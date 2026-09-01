import type { FastifyPluginAsync } from "fastify";
import { authRequired } from "../lib/auth.js";
import { config } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";
import { requestCourseSummaries } from "../lib/upstream-summary.js";

type RemoteSummary = { summaries?: Array<{ courseId: string; pendingCount?: number; progressPercent?: number; deadlines?: unknown[] }> };

function scheduleSlots(value: string | null) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/me", { preHandler: authRequired() }, async (request) => {
    const isStaff = request.auth!.role === "TEACHER" || request.auth!.role === "ADMIN";
    const courses = isStaff
      ? await prisma.course.findMany({ where: request.auth!.role === "ADMIN" ? {} : { teacherId: request.auth!.sub }, include: { teacher: { select: { name: true } } }, orderBy: { createdAt: "desc" } })
      : (await prisma.enrollment.findMany({ where: { userId: request.auth!.sub }, include: { course: { include: { teacher: { select: { name: true } } } } }, orderBy: { course: { createdAt: "desc" } } })).map((row) => row.course);
    const courseIds = courses.map((course) => course.id);
    const payload = { userId: request.auth!.sub, courseIds };
    const [homework, lab] = await Promise.all([
      requestCourseSummaries<RemoteSummary>(config.homeworkServiceUrl, payload, request.id),
      requestCourseSummaries<RemoteSummary>(config.labServiceUrl, payload, request.id),
    ]);
    const homeworkByCourse = new Map((homework.data?.summaries ?? []).map((summary) => [summary.courseId, summary]));
    const labByCourse = new Map((lab.data?.summaries ?? []).map((summary) => [summary.courseId, summary]));

    return {
      role: request.auth!.role,
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        category: course.category,
        teacherName: course.teacher.name,
        scheduleSlots: scheduleSlots(course.scheduleSlotsJson),
        homework: homework.status === "OK" ? homeworkByCourse.get(course.id) ?? null : null,
        lab: lab.status === "OK" ? labByCourse.get(course.id) ?? null : null,
      })),
      dependencies: {
        homework: { status: homework.status, reason: homework.reason ?? null },
        lab: { status: lab.status, reason: lab.reason ?? null },
      },
      requestId: request.id,
    };
  });
};

export default dashboardRoutes;
