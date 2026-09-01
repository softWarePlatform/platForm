import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired, optionalAuth } from "../lib/auth.js";
import { semesterKey } from "../lib/course-access.js";
import { prisma } from "../lib/prisma.js";

const courseBody = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  courseCode: z.string().min(1).optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  semesterKey: z.string().optional(),
  scheduleSlots: z.array(z.object({ dayOfWeek: z.number().int().min(1).max(7), periodStart: z.number().int().min(1), periodEnd: z.number().int().min(1), room: z.string().optional() })).optional(),
});

function serialize(course: { scheduleSlotsJson: string | null } & Record<string, unknown>) {
  let scheduleSlots: unknown[] = [];
  try { scheduleSlots = course.scheduleSlotsJson ? JSON.parse(course.scheduleSlotsJson) : []; } catch { /* invalid legacy data returns empty */ }
  return { ...course, scheduleSlots };
}

const coursesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses", async (request, reply) => {
    const query = z.object({ category: z.string().optional(), search: z.string().optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: "参数无效" });

    const courses = await prisma.course.findMany({
      where: {
        published: true,
        ...(query.data.category ? { category: query.data.category } : {}),
        ...(query.data.search
          ? {
              OR: [
                { title: { contains: query.data.search, mode: "insensitive" } },
                { description: { contains: query.data.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        teacher: { select: { id: true, name: true } },
        _count: { select: { enrollments: true } },
      },
    });

    return {
      courses: courses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        category: course.category,
        published: course.published,
        createdAt: course.createdAt,
        teacher: course.teacher,
        enrollmentCount: course._count.enrollments,
      })),
    };
  });

  app.get("/courses/:id", { preHandler: optionalAuth }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });

    const course = await prisma.course.findUnique({
      where: { id: params.data.id },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course || (!course.published && request.auth?.role !== "ADMIN" && request.auth?.sub !== course.teacherId)) return reply.code(404).send({ error: "课程不存在" });

    return {
      course: serialize({
        id: course.id,
        title: course.title,
        description: course.description,
        category: course.category,
        teacherId: course.teacherId,
        teacher: course.teacher,
        published: course.published,
        capacity: course.capacity,
        enrollmentCount: course._count.enrollments,
        semesterKey: course.semesterKey,
        scheduleSlotsJson: course.scheduleSlotsJson,
        createdAt: course.createdAt,
      }),
    };
  });

  app.get("/courses/mine", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request) => {
    const courses = await prisma.course.findMany({ where: request.auth!.role === "ADMIN" ? {} : { teacherId: request.auth!.sub }, orderBy: { createdAt: "desc" }, include: { _count: { select: { enrollments: true } } } });
    return { courses: courses.map((course) => serialize(course)) };
  });

  app.post("/courses", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const body = courseBody.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });
    try {
      const course = await prisma.$transaction(async (tx) => {
        const created = await tx.course.create({ data: { title: body.data.title, description: body.data.description, category: body.data.category, courseCode: body.data.courseCode, capacity: body.data.capacity ?? 60, semesterKey: body.data.semesterKey ?? semesterKey(), scheduleSlotsJson: body.data.scheduleSlots ? JSON.stringify(body.data.scheduleSlots) : null, teacherId: request.auth!.sub } });
        await tx.enrollmentLog.create({ data: { userId: request.auth!.sub, courseId: created.id, action: "COURSE_CREATE", operatorId: request.auth!.sub, note: `创建课程 ${created.title}` } });
        return created;
      });
      return reply.code(201).send({ course: serialize(course) });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return reply.code(409).send({ error: "课程代码已存在" });
      throw error;
    }
  });

  app.patch("/courses/:id", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = courseBody.partial().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "参数无效" });
    const course = await prisma.course.findUnique({ where: { id: params.data.id } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });
    if (request.auth!.role !== "ADMIN" && course.teacherId !== request.auth!.sub) return reply.code(403).send({ error: "无权修改该课程" });
    try {
      const updated = await prisma.course.update({ where: { id: course.id }, data: { ...body.data, scheduleSlotsJson: body.data.scheduleSlots ? JSON.stringify(body.data.scheduleSlots) : undefined } });
      return { course: serialize(updated) };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return reply.code(409).send({ error: "课程代码已存在" });
      throw error;
    }
  });

  app.post("/courses/:id/publish", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const course = await prisma.course.findUnique({ where: { id: params.data.id } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });
    if (request.auth!.role !== "ADMIN" && course.teacherId !== request.auth!.sub) return reply.code(403).send({ error: "无权发布该课程" });
    return { course: serialize(await prisma.course.update({ where: { id: course.id }, data: { published: true } })) };
  });
};

export default coursesRoutes;
