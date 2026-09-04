import type { FastifyPluginAsync } from "fastify";
import { authRequired } from "../lib/auth.js";
import { config } from "../lib/config.js";
import { semesterKey } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";
import { requestHomeworkSummary, requestLabGradebook, type UpstreamResult } from "../lib/upstream-summary.js";

type HomeworkSummary = { courseId: string; homeworkCount: number; publishedCount: number; submittedCount: number; gradedCount: number; averageScore: number | null; calculatedAt: string };
type LabGradebook = {
  courseId: string;
  labStatus: "OK";
  labAverage: number | null;
  students: Array<{ userId: string; labAverage: number | null }>;
};

function scheduleSlots(value: string | null) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/me", { preHandler: authRequired() }, async (request) => {
    const isStaff = request.auth!.role === "TEACHER" || request.auth!.role === "ADMIN";
    const currentSemesterKey = semesterKey();
    const period = await prisma.enrollmentPeriod.findUnique({ where: { semesterKey: currentSemesterKey } });
    const courses = isStaff
      ? await prisma.course.findMany({ where: request.auth!.role === "ADMIN" ? {} : { teacherId: request.auth!.sub }, include: { teacher: { select: { name: true } }, _count: { select: { announcements: true } } }, orderBy: { createdAt: "desc" } })
      : (await prisma.enrollment.findMany({ where: { userId: request.auth!.sub }, include: { course: { include: { teacher: { select: { name: true } }, _count: { select: { announcements: true } } } } }, orderBy: { course: { createdAt: "desc" } } })).map((row) => row.course);
    const [homeworkResults, labResults] = await Promise.all([
      Promise.all(courses.map((course) => requestHomeworkSummary<HomeworkSummary>(config.homeworkServiceUrl, course.id, request.id))),
      Promise.all(courses.map((course) => requestLabGradebook<LabGradebook>(config.labServiceUrl, course.id, request.id))),
    ]);
    const homeworkByCourse = new Map(homeworkResults.flatMap((result) => result.data ? [[result.data.courseId, result.data] as const] : []));
    const homeworkFailure = homeworkResults.find((result) => result.status !== "OK");
    const homework: UpstreamResult<null> = homeworkFailure
      ? { status: "UNAVAILABLE", data: null, reason: homeworkFailure.reason }
      : { status: "OK", data: null };
    const labByCourse = new Map(labResults.flatMap((result) => result.status === "OK" && result.data?.labStatus === "OK" ? [[result.data.courseId, result.data] as const] : []));
    const labFailure = labResults.find((result) => result.status !== "OK" || result.data?.labStatus !== "OK");
    const lab: UpstreamResult<null> = labFailure
      ? { status: "UNAVAILABLE", data: null, reason: labFailure.reason ?? "INVALID_RESPONSE" }
      : { status: "OK", data: null };

    const now = new Date();
    return {
      role: request.auth!.role,
      semester: {
        key: currentSemesterKey,
        label: period?.label ?? currentSemesterKey,
      },
      deadlines: [],
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        category: course.category,
        teacherName: course.teacher.name,
        startAt: course.startAt?.toISOString() ?? null,
        endAt: course.endAt?.toISOString() ?? null,
        progressPercent: 0,
        pendingHomework: homeworkByCourse.get(course.id)?.publishedCount ?? 0,
        pendingLabs: 0,
        announcementCount: course._count.announcements,
        isHistory: Boolean(course.endAt && course.endAt < now),
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
