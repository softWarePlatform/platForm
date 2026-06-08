import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired, optionalAuth } from "../lib/authGuard.js";
import { buildKnowledgeGraphFromCourse } from "../lib/knowledge-graph.js";
import { teachingHomeworkOverviewForTeacher } from "../lib/teaching-homework-overview.js";
import {
  parseScheduleSlotsJson,
  scheduleSlotsBodySchema,
  serializeScheduleSlots,
} from "../lib/scheduleSlots.js";
import { courseEnrollmentFieldsSchema } from "../lib/course-enrollment-schema.js";
import { getEnrollmentFilterOptions } from "../lib/enrollment-labels.js";
import { currentSemester } from "../lib/semester.js";
import { enrollStudent } from "../lib/enrollment-service.js";

function withScheduleSlots<T extends { id: string; scheduleSlotsJson: string | null }>(course: T) {
  return {
    ...course,
    scheduleSlots: parseScheduleSlotsJson(course.scheduleSlotsJson, course.id),
  };
}

const coursesRoutes: FastifyPluginAsync = async (app) => {
  /** 已发布课程用到的分类列表（用于筛选） */
  app.get("/courses/categories", async () => {
    const rows = await prisma.course.findMany({
      where: {
        published: true,
        AND: [{ category: { not: null } }, { category: { not: "" } }],
      },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    });
    return { categories: rows.map((r) => r.category).filter(Boolean) as string[] };
  });

  /** 学生 / 教师：浏览已发布课程 */
  app.get("/courses", async (req, reply) => {
    const q = z
      .object({ category: z.string().optional(), search: z.string().optional() })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "参数无效" });

    const where = {
      published: true,
      ...(q.data.category ? { category: q.data.category } : {}),
      ...(q.data.search
        ? {
            OR: [
              { title: { contains: q.data.search, mode: "insensitive" as const } },
              { description: { contains: q.data.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const list = await prisma.course.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    });

    return {
      courses: list.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        published: c.published,
        createdAt: c.createdAt,
        teacher: c.teacher,
        enrollmentCount: c._count.enrollments,
      })),
    };
  });

  /** 教师创建课程：选课系统字段选项（性质、类别、开课学院） */
  app.get(
    "/courses/enrollment-field-options",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async () => {
      const sem = currentSemester();
      return {
        semester: sem,
        ...getEnrollmentFilterOptions(),
      };
    },
  );

  /** 教师：我的课程（含未发布）；管理员返回全部课程。同时附带作业测评列表 */
  app.get(
    "/courses/mine",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req) => {
      const list = await prisma.course.findMany({
        where: req.auth!.role === "ADMIN" ? {} : { teacherId: req.auth!.sub },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { enrollments: true, labs: true, homeworks: true } },
        },
      });
      const teachingHomework = await teachingHomeworkOverviewForTeacher(req.auth!.sub, req.auth!.role);
      return { courses: list.map(withScheduleSlots), teachingHomework };
    },
  );

  app.post(
    "/courses",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const schema = z
        .object({
          title: z.string().min(1),
          description: z.string().optional(),
          category: z.string().optional(),
          published: z.boolean().optional(),
          startAt: z.coerce.date().optional(),
          endAt: z.coerce.date().optional(),
          scheduleSlots: scheduleSlotsBodySchema.optional(),
        })
        .merge(courseEnrollmentFieldsSchema);
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const sem = currentSemester();
      try {
        const course = await prisma.course.create({
          data: {
            title: body.data.title,
            description: body.data.description,
            category: body.data.category,
            published: body.data.published ?? false,
            teacherId: req.auth!.sub,
            startAt: body.data.startAt,
            endAt: body.data.endAt,
            scheduleSlotsJson: body.data.scheduleSlots
              ? serializeScheduleSlots(body.data.scheduleSlots)
              : undefined,
            courseCode: body.data.courseCode,
            credits: body.data.credits,
            capacity: body.data.capacity,
            courseNature: body.data.courseNature,
            subjectCategory: body.data.subjectCategory,
            offeringCollegeCode: body.data.offeringCollegeCode ?? undefined,
            semesterKey: body.data.semesterKey ?? sem.key,
          },
        });
        return { course: withScheduleSlots(course) };
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "P2002") {
          return reply.code(409).send({ error: "课程代码已存在，请更换" });
        }
        throw e;
      }
    },
  );

  app.get("/courses/:id", { preHandler: optionalAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        labs: { select: { id: true, title: true, language: true } },
        homeworks: { select: { id: true, title: true, dueAt: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) return reply.code(404).send({ error: "课程不存在" });
    if (!course.published) {
      const uid = req.auth?.sub;
      const canSee = req.auth?.role === "ADMIN" || uid === course.teacherId;
      if (!canSee) return reply.code(404).send({ error: "课程不存在" });
    }

    let isEnrolled = false;
    const uid = req.auth?.sub;
    if (uid) {
      const enrollment = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId: uid, courseId: id } },
        select: { id: true },
      });
      isEnrolled = Boolean(enrollment);
    }

    return { course: { ...withScheduleSlots(course), isEnrolled } };
  });

  app.patch(
    "/courses/:id",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权修改该课程" });
      }

      const schema = z
        .object({
          title: z.string().min(1).optional(),
          description: z.string().nullable().optional(),
          category: z.string().nullable().optional(),
          published: z.boolean().optional(),
          startAt: z.coerce.date().nullable().optional(),
          endAt: z.coerce.date().nullable().optional(),
          knowledgeGraphJson: z.string().nullable().optional(),
          scheduleSlots: scheduleSlotsBodySchema.nullable().optional(),
        })
        .merge(courseEnrollmentFieldsSchema);
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const { scheduleSlots, ...rest } = body.data;
      const data: Record<string, unknown> = { ...rest };
      if (scheduleSlots !== undefined) {
        data.scheduleSlotsJson = scheduleSlots ? serializeScheduleSlots(scheduleSlots) : null;
      }
      if (rest.offeringCollegeCode === null) {
        data.offeringCollegeCode = null;
      }

      try {
        const updated = await prisma.course.update({ where: { id }, data });
        return { course: withScheduleSlots(updated) };
      } catch (e: unknown) {
        const code = (e as { code?: string })?.code;
        if (code === "P2002") {
          return reply.code(409).send({ error: "课程代码已存在，请更换" });
        }
        throw e;
      }
    },
  );

  /** 根据课程与实验标题生成知识图谱 JSON（教师可保存到课程） */
  app.post(
    "/courses/:id/knowledge-graph/generate",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({
        where: { id },
        include: { labs: { select: { title: true } } },
      });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权操作" });
      }

      const schema = z.object({ save: z.boolean().optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "参数无效" });

      const graph = buildKnowledgeGraphFromCourse({
        title: course.title,
        description: course.description,
        labTitles: course.labs.map((l) => l.title),
      });

      if (parsed.data.save) {
        await prisma.course.update({
          where: { id },
          data: { knowledgeGraphJson: JSON.stringify(graph) },
        });
      }

      return { graph };
    },
  );

  /** 教师：将学生分班（调整选课的 classId） */
  app.patch(
    "/courses/:courseId/enrollments/:enrollmentId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, enrollmentId } = req.params as { courseId: string; enrollmentId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权操作" });
      }

      const schema = z.object({
        classId: z.string().uuid().nullable().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const en = await prisma.enrollment.findFirst({
        where: { id: enrollmentId, courseId },
      });
      if (!en) return reply.code(404).send({ error: "选课记录不存在" });

      if (body.data.classId) {
        const cls = await prisma.class.findFirst({
          where: { id: body.data.classId, courseId },
        });
        if (!cls) return reply.code(400).send({ error: "班级不属于本课程" });
      }

      const updated = await prisma.enrollment.update({
        where: { id: enrollmentId },
        data: { classId: body.data.classId ?? null },
      });
      return { enrollment: updated };
    },
  );

  app.patch(
    "/courses/:courseId/classes/:classId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, classId } = req.params as { courseId: string; classId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权操作" });
      }

      const schema = z.object({ name: z.string().min(1) });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const cls = await prisma.class.findFirst({ where: { id: classId, courseId } });
      if (!cls) return reply.code(404).send({ error: "班级不存在" });

      const updated = await prisma.class.update({
        where: { id: classId },
        data: { name: body.data.name },
      });
      return { class: updated };
    },
  );

  app.delete(
    "/courses/:courseId/classes/:classId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, classId } = req.params as { courseId: string; classId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权操作" });
      }

      const cls = await prisma.class.findFirst({ where: { id: classId, courseId } });
      if (!cls) return reply.code(404).send({ error: "班级不存在" });

      await prisma.enrollment.updateMany({
        where: { classId },
        data: { classId: null },
      });
      await prisma.class.delete({ where: { id: classId } });
      return { ok: true };
    },
  );

  /** 学生选课（与 /enrollment/courses/:id/enroll 共用逻辑） */
  app.post(
    "/courses/:id/enroll",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const schema = z.object({ classId: z.string().uuid().optional() });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      try {
        const enrollment = await enrollStudent(req.auth!.sub, id, {
          classId: body.data.classId,
        });
        return { enrollment };
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        return reply.code(err.statusCode ?? 500).send({ error: err.message || "选课失败" });
      }
    },
  );

  /** 班级管理 */
  app.post(
    "/courses/:id/classes",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权操作" });
      }
      const schema = z.object({ name: z.string().min(1) });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const cls = await prisma.class.create({
        data: { name: body.data.name, courseId: id },
      });
      return { class: cls };
    },
  );

  app.get(
    "/courses/:id/classes",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权查看" });
      }
      const classes = await prisma.class.findMany({
        where: { courseId: id },
        include: {
          enrollments: { include: { user: { select: { id: true, name: true, email: true } } } },
        },
      });
      return { classes };
    },
  );

  /** 课程内学生名单（教师） */
  app.get(
    "/courses/:id/students",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权查看" });
      }
      const enrollments = await prisma.enrollment.findMany({
        where: { courseId: id },
        include: { user: { select: { id: true, name: true, email: true } }, class: true },
      });
      return { students: enrollments };
    },
  );

  /** 选课学生名单 CSV 导出（教师/管理员） */
  app.get(
    "/courses/:id/students/export.csv",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权导出" });
      }
      const enrollments = await prisma.enrollment.findMany({
        where: { courseId: id },
        include: { user: { select: { name: true, email: true } }, class: true },
        orderBy: { user: { name: "asc" } },
      });
      const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      const lines = ["姓名,邮箱,班级"];
      for (const e of enrollments) {
        lines.push(
          [esc(e.user.name), esc(e.user.email), esc(e.class?.name ?? "未分班")].join(","),
        );
      }
      const safeTitle = course.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(`选课名单_${safeTitle}.csv`)}`,
        )
        .send(`\ufeff${lines.join("\n")}\n`);
    },
  );
};

export default coursesRoutes;
