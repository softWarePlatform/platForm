import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

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

  app.get("/courses/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });

    const course = await prisma.course.findUnique({
      where: { id: params.data.id },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!course || !course.published) return reply.code(404).send({ error: "课程不存在" });

    return {
      course: {
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
      },
    };
  });
};

export default coursesRoutes;
