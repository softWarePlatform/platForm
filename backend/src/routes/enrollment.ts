import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { currentSemester } from "../lib/semester.js";
import { getEnrollmentFilterOptions } from "../lib/enrollment-labels.js";
import { ENROLLMENT_PHASE_LABELS } from "../lib/enrollment-labels.js";
import {
  buildCatalogForUser,
  buildClassScheduleRecommendations,
  dropStudent,
  enrollStudent,
  evaluateEnrollmentWindow,
  getEnrollmentPeriodForCurrentSemester,
  joinWaitlist,
  leaveWaitlist,
} from "../lib/enrollment-service.js";
import { writeAdminOperationLog } from "../lib/admin-operation-log.js";

function handleEnrollmentError(reply: any, e: unknown) {
  const err = e as Error & { statusCode?: number };
  const code = err.statusCode ?? 500;
  return reply.code(code).send({ error: err.message || "操作失败" });
}

/** 解析 query 中的多选参数（兼容重复 key、逗号分隔、axios 数组序列化） */
function toQueryArray(v: unknown): string[] | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  if (Array.isArray(v)) {
    const flat = v.flatMap((item) =>
      typeof item === "string" && item.includes(",")
        ? item.split(",").map((s) => s.trim())
        : [String(item)],
    );
    const cleaned = flat.map((s) => s.trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }
  if (typeof v === "string") {
    const parts = v.includes(",")
      ? v.split(",").map((s) => s.trim())
      : [v.trim()];
    const cleaned = parts.filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }
  return undefined;
}

const enrollmentRoutes: FastifyPluginAsync = async (app) => {
  /** 选课时段与学期状态 */
  app.get("/enrollment/status", { preHandler: authRequired() }, async (req) => {
    const period = await getEnrollmentPeriodForCurrentSemester();
    const window = evaluateEnrollmentWindow(period);
    const sem = currentSemester();

    let timetableConfirmed = false;
    if (req.auth!.role === "STUDENT" || req.auth!.role === "ADMIN") {
      const row = await prisma.timetableConfirmation.findUnique({
        where: { userId_semesterKey: { userId: req.auth!.sub, semesterKey: sem.key } },
      });
      timetableConfirmed = !!row;
    }

    return {
      window,
      timetableConfirmed,
      canConfirmTimetable:
        !window.open &&
        !!period?.confirmDeadline &&
        new Date() <= period.confirmDeadline &&
        !timetableConfirmed,
      labels: {
        ...getEnrollmentFilterOptions(),
        phases: ENROLLMENT_PHASE_LABELS,
      },
    };
  });

  /** 选课目录（搜索 + 筛选） */
  app.get(
    "/enrollment/catalog",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const q = z
        .object({
          semesterKey: z.string().optional(),
          teacher: z.string().optional(),
          className: z.string().optional(),
          courseCode: z.string().optional(),
          scheduleTime: z.string().optional(),
          scheduleRoom: z.string().optional(),
          courseNature: z.union([z.string(), z.array(z.string())]).optional(),
          subjectCategory: z.union([z.string(), z.array(z.string())]).optional(),
          offeringCollege: z.union([z.string(), z.array(z.string())]).optional(),
        })
        .safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "参数无效" });

      const period = await getEnrollmentPeriodForCurrentSemester();
      const window = evaluateEnrollmentWindow(period);

      const { courses, total } = await buildCatalogForUser(req.auth!.sub, {
        semesterKey: q.data.semesterKey,
        teacher: q.data.teacher,
        className: q.data.className,
        courseCode: q.data.courseCode,
        scheduleTime: q.data.scheduleTime,
        scheduleRoom: q.data.scheduleRoom,
        courseNatures: toQueryArray(q.data.courseNature),
        subjectCategories: toQueryArray(q.data.subjectCategory),
        offeringColleges: toQueryArray(q.data.offeringCollege),
      });

      return { window, courses, total, matchedCount: total };
    },
  );

  /** 班级课表推荐课程 */
  app.get(
    "/enrollment/class-recommendations",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req) => {
      const period = await getEnrollmentPeriodForCurrentSemester();
      const window = evaluateEnrollmentWindow(period);
      const recommendation = await buildClassScheduleRecommendations(req.auth!.sub);
      return { window, recommendation };
    },
  );

  /** 搜索自动补全 */
  app.get(
    "/enrollment/suggestions",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const q = z.object({ q: z.string().min(1).max(80) }).safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "参数无效" });

      const term = q.data.q.trim();
      const sem = currentSemester().key;
      const base = { published: true, semesterKey: sem };

      const [titles, teachers, codes] = await Promise.all([
        prisma.course.findMany({
          where: {
            ...base,
            title: { contains: term, mode: "insensitive" },
          },
          select: { id: true, title: true, courseCode: true },
          take: 8,
        }),
        prisma.course.findMany({
          where: {
            ...base,
            teacher: { name: { contains: term, mode: "insensitive" } },
          },
          select: { teacher: { select: { name: true } } },
          distinct: ["teacherId"],
          take: 8,
        }),
        prisma.course.findMany({
          where: {
            ...base,
            courseCode: { contains: term, mode: "insensitive" },
          },
          select: { courseCode: true },
          take: 8,
        }),
      ]);

      return {
        courses: titles.map((t) => ({
          id: t.id,
          title: t.title,
          courseCode: t.courseCode,
          label: t.courseCode ? `${t.courseCode} · ${t.title}` : t.title,
        })),
        teachers: teachers.map((t) => t.teacher.name),
        courseCodes: codes.map((c) => c.courseCode).filter(Boolean) as string[],
      };
    },
  );

  /** 我的选课/退课日志 */
  app.get(
    "/enrollment/logs",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req) => {
      const logs = await prisma.enrollmentLog.findMany({
        where: { userId: req.auth!.sub },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          course: { select: { id: true, title: true, courseCode: true } },
          operator: { select: { id: true, name: true } },
        },
      });
      return { logs };
    },
  );

  app.post(
    "/enrollment/courses/:courseId/enroll",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const body = z.object({ classId: z.string().uuid().optional() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });
      try {
        const enrollment = await enrollStudent(req.auth!.sub, courseId, {
          classId: body.data.classId,
        });
        return { enrollment, ok: true };
      } catch (e) {
        return handleEnrollmentError(reply, e);
      }
    },
  );

  app.delete(
    "/enrollment/courses/:courseId/enroll",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      try {
        await dropStudent(req.auth!.sub, courseId);
        return { ok: true };
      } catch (e) {
        return handleEnrollmentError(reply, e);
      }
    },
  );

  app.post(
    "/enrollment/courses/:courseId/waitlist",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      try {
        await joinWaitlist(req.auth!.sub, courseId);
        return { ok: true };
      } catch (e) {
        return handleEnrollmentError(reply, e);
      }
    },
  );

  app.delete(
    "/enrollment/courses/:courseId/waitlist",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      try {
        await leaveWaitlist(req.auth!.sub, courseId);
        return { ok: true };
      } catch (e) {
        return handleEnrollmentError(reply, e);
      }
    },
  );

  /** 选课结束后确认课表 */
  app.post(
    "/enrollment/confirm-timetable",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const period = await getEnrollmentPeriodForCurrentSemester();
      const window = evaluateEnrollmentWindow(period);
      const sem = currentSemester();

      if (window.open) {
        return reply.code(400).send({ error: "选课尚未结束，暂不可确认课表" });
      }
      if (period?.confirmDeadline && new Date() > period.confirmDeadline) {
        return reply.code(400).send({ error: "已超过课表确认截止时间" });
      }

      await prisma.timetableConfirmation.upsert({
        where: { userId_semesterKey: { userId: req.auth!.sub, semesterKey: sem.key } },
        create: { userId: req.auth!.sub, semesterKey: sem.key },
        update: { confirmedAt: new Date() },
      });

      const anyEnrolled = await prisma.enrollment.findFirst({
        where: { userId: req.auth!.sub, course: { semesterKey: sem.key } },
        select: { courseId: true },
      });
      if (anyEnrolled) {
        await prisma.enrollmentLog.create({
          data: {
            userId: req.auth!.sub,
            courseId: anyEnrolled.courseId,
            action: "TIMETABLE_CONFIRM",
            note: sem.label,
          },
        });
      }

      return { ok: true, confirmedAt: new Date().toISOString() };
    },
  );

  /** 管理员：选课时段配置 */
  app.get(
    "/enrollment/period",
    { preHandler: authRequired("ADMIN") },
    async () => {
      const sem = currentSemester();
      const period = await prisma.enrollmentPeriod.findUnique({
        where: { semesterKey: sem.key },
      });
      return { period, semester: sem };
    },
  );

  app.put(
    "/enrollment/period",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const sem = currentSemester();
      const schema = z.object({
        label: z.string().optional(),
        phase: z.enum(["PRESELECT", "FORMAL", "ADD_DROP", "CLOSED"]),
        openAt: z.coerce.date(),
        closeAt: z.coerce.date(),
        confirmDeadline: z.coerce.date().nullable().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });
      if (body.data.closeAt <= body.data.openAt) {
        return reply.code(400).send({ error: "结束时间必须晚于开始时间" });
      }

      const before = await prisma.enrollmentPeriod.findUnique({
        where: { semesterKey: sem.key },
      });
      const period = await prisma.enrollmentPeriod.upsert({
        where: { semesterKey: sem.key },
        create: {
          semesterKey: sem.key,
          label: body.data.label ?? sem.label,
          phase: body.data.phase,
          openAt: body.data.openAt,
          closeAt: body.data.closeAt,
          confirmDeadline: body.data.confirmDeadline ?? undefined,
        },
        update: {
          label: body.data.label ?? sem.label,
          phase: body.data.phase,
          openAt: body.data.openAt,
          closeAt: body.data.closeAt,
          confirmDeadline: body.data.confirmDeadline ?? null,
        },
      });
      await writeAdminOperationLog(req, {
        action: "ENROLLMENT_PERIOD_UPDATE",
        targetType: "ENROLLMENT_PERIOD",
        targetId: period.id,
        targetLabel: period.label ?? sem.label,
        detail: { before, after: period },
      });
      return { period };
    },
  );

  /** 管理员：手动加课/退课 */
  app.post(
    "/enrollment/admin/enroll",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const body = z
        .object({ userId: z.string().uuid(), courseId: z.string().uuid() })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });
      try {
        const enrollment = await enrollStudent(body.data.userId, body.data.courseId, {
          operatorId: req.auth!.sub,
          skipWindowCheck: true,
        });
        const [student, course] = await Promise.all([
          prisma.user.findUnique({ where: { id: body.data.userId }, select: { name: true, email: true } }),
          prisma.course.findUnique({ where: { id: body.data.courseId }, select: { title: true, courseCode: true } }),
        ]);
        await writeAdminOperationLog(req, {
          action: "MANUAL_ENROLL",
          targetType: "ENROLLMENT",
          targetId: enrollment.id,
          targetLabel: `${student?.name ?? body.data.userId} → ${course?.title ?? body.data.courseId}`,
          detail: { userId: body.data.userId, courseId: body.data.courseId, student, course },
        });
        return { enrollment, ok: true };
      } catch (e) {
        return handleEnrollmentError(reply, e);
      }
    },
  );

  app.post(
    "/enrollment/admin/drop",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const body = z
        .object({ userId: z.string().uuid(), courseId: z.string().uuid() })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });
      try {
        await dropStudent(body.data.userId, body.data.courseId, {
          operatorId: req.auth!.sub,
          skipWindowCheck: true,
        });
        const [student, course] = await Promise.all([
          prisma.user.findUnique({ where: { id: body.data.userId }, select: { name: true, email: true } }),
          prisma.course.findUnique({ where: { id: body.data.courseId }, select: { title: true, courseCode: true } }),
        ]);
        await writeAdminOperationLog(req, {
          action: "MANUAL_DROP",
          targetType: "ENROLLMENT",
          targetId: `${body.data.userId}:${body.data.courseId}`,
          targetLabel: `${student?.name ?? body.data.userId} → ${course?.title ?? body.data.courseId}`,
          detail: { userId: body.data.userId, courseId: body.data.courseId, student, course },
        });
        return { ok: true };
      } catch (e) {
        return handleEnrollmentError(reply, e);
      }
    },
  );

  /** 管理员：调整课程容量与选课相关字段 */
  app.patch(
    "/enrollment/courses/:courseId",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const schema = z.object({
        capacity: z.number().int().positive().optional(),
        courseCode: z.string().min(1).nullable().optional(),
        credits: z.number().int().positive().optional(),
        courseNature: z.enum(["REQUIRED", "RENXIU", "ELECTIVE"]).optional(),
        subjectCategory: z
          .enum([
            "MATH_BASIC",
            "ENGINEERING_BASIC",
            "FOREIGN_LANGUAGE",
            "PE",
            "QUALITY_EDU_THEORY",
            "QUALITY_EDU_PRACTICE",
            "CORE_MAJOR",
            "IDEOLOGY",
            "GENERAL_MAJOR",
            "CORE_GENERAL",
          ])
          .optional(),
        offeringCollegeCode: z.string().nullable().optional(),
        title: z.string().min(1).optional(),
        published: z.boolean().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const before = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          courseCode: true,
          credits: true,
          capacity: true,
          courseNature: true,
          subjectCategory: true,
          offeringCollegeCode: true,
          published: true,
        },
      });
      const course = await prisma.course.update({
        where: { id: courseId },
        data: body.data,
      });
      await writeAdminOperationLog(req, {
        action: "COURSE_ENROLLMENT_UPDATE",
        targetType: "COURSE",
        targetId: course.id,
        targetLabel: course.title,
        detail: { before, after: body.data },
      });
      return { course };
    },
  );

  /** 管理员：删除课程 */
  app.delete(
    "/enrollment/courses/:courseId",
    { preHandler: authRequired("ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          title: true,
          courseCode: true,
          semesterKey: true,
          published: true,
          teacher: { select: { id: true, name: true, email: true } },
          _count: {
            select: {
              enrollments: true,
              labs: true,
              labSets: true,
              homeworks: true,
              materials: true,
              announcements: true,
              waitlists: true,
              practiceQuestions: true,
            },
          },
        },
      });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      await prisma.course.delete({ where: { id: courseId } });
      await writeAdminOperationLog(req, {
        action: "COURSE_DELETE",
        targetType: "COURSE",
        targetId: course.id,
        targetLabel: course.courseCode ? `${course.courseCode} · ${course.title}` : course.title,
        detail: course,
      });
      return { ok: true, deleted: course };
    },
  );
};

export default enrollmentRoutes;
