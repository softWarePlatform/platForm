import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

async function canDiscussLab(userId: string, role: string, labId: string) {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    include: { course: true },
  });
  if (!lab) return { ok: false as const, lab: null };
  if (role === "ADMIN" || lab.course.teacherId === userId) return { ok: true as const, lab };
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lab.courseId } },
  });
  if (!en) return { ok: false as const, lab };
  return { ok: true as const, lab };
}

const discussionsRoutes: FastifyPluginAsync = async (app) => {
  /** 本题讨论（与课程帖区分：course 列表仅 labId 为空的帖） */
  app.get("/labs/:labId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { labId } = req.params as { labId: string };
    const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
    if (!gate.lab) return reply.code(404).send({ error: "实验不存在" });
    if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

    const posts = await prisma.discussionPost.findMany({
      where: { labId },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return { posts };
  });

  app.post("/labs/:labId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { labId } = req.params as { labId: string };
    const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
    if (!gate.lab) return reply.code(404).send({ error: "实验不存在" });
    if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

    const schema = z.object({
      title: z.string().min(1),
      body: z.string().min(1),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const post = await prisma.discussionPost.create({
      data: {
        courseId: gate.lab.courseId,
        labId,
        userId: req.auth!.sub,
        title: body.data.title,
        body: body.data.body,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    return { post };
  });

  /** 课程级讨论（不含各题帖子） */
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
      where: { courseId, labId: null },
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
        labId: null,
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
