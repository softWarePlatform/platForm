import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

const discussionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses/:courseId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const en = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.auth!.sub, courseId } },
    });
    const isTeacher = course.teacherId === req.auth!.sub || req.auth!.role === "ADMIN";
    if (!en && !isTeacher) return reply.code(403).send({ error: "未选课" });

    const posts = await prisma.discussionPost.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return { posts };
  });

  app.post("/courses/:courseId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const en = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.auth!.sub, courseId } },
    });
    const isTeacher = course.teacherId === req.auth!.sub || req.auth!.role === "ADMIN";
    if (!en && !isTeacher) return reply.code(403).send({ error: "未选课" });

    const schema = z.object({
      title: z.string().min(1),
      body: z.string().min(1),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const post = await prisma.discussionPost.create({
      data: {
        courseId,
        userId: req.auth!.sub,
        title: body.data.title,
        body: body.data.body,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    return { post };
  });
};

export default discussionsRoutes;
