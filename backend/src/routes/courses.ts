import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired, optionalAuth } from "../lib/authGuard.js";

const coursesRoutes: FastifyPluginAsync = async (app) => {
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

  /** 教师：我的课程（含未发布） */
  app.get(
    "/courses/mine",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req) => {
      const list = await prisma.course.findMany({
        where: { teacherId: req.auth!.sub },
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { enrollments: true, labs: true, homeworks: true } },
        },
      });
      return { courses: list };
    },
  );

  app.post(
    "/courses",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const schema = z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        category: z.string().optional(),
        published: z.boolean().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const course = await prisma.course.create({
        data: {
          title: body.data.title,
          description: body.data.description,
          category: body.data.category,
          published: body.data.published ?? false,
          teacherId: req.auth!.sub,
        },
      });
      return { course };
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
    return { course };
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

      const schema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        category: z.string().nullable().optional(),
        published: z.boolean().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const updated = await prisma.course.update({ where: { id }, data: body.data });
      return { course: updated };
    },
  );

  /** 学生选课 */
  app.post(
    "/courses/:id/enroll",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const course = await prisma.course.findUnique({ where: { id } });
      if (!course?.published) return reply.code(404).send({ error: "课程不可选" });

      const schema = z.object({ classId: z.string().uuid().optional() });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      try {
        const enrollment = await prisma.enrollment.create({
          data: {
            userId: req.auth!.sub,
            courseId: id,
            classId: body.data.classId,
          },
        });
        return { enrollment };
      } catch {
        return reply.code(409).send({ error: "已选过该课程" });
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
};

export default coursesRoutes;
