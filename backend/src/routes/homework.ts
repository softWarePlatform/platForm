import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

async function enrolledOrTeacher(userId: string, role: string, courseId: string, teacherId: string) {
  if (role === "ADMIN" || teacherId === userId) return true;
  return !!(await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  }));
}

const homeworkRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/courses/:courseId/homework",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权布置作业" });
      }

      const schema = z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        dueAt: z.coerce.date().optional().nullable(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const hw = await prisma.homework.create({
        data: {
          courseId,
          title: body.data.title,
          description: body.data.description,
          dueAt: body.data.dueAt ?? undefined,
        },
      });
      return { homework: hw };
    },
  );

  app.get(
    "/courses/:courseId/homework",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await enrolledOrTeacher(req.auth!.sub, req.auth!.role, courseId, course.teacherId);
      if (!ok) return reply.code(403).send({ error: "无权查看" });

      const list = await prisma.homework.findMany({
        where: { courseId },
        orderBy: { title: "asc" },
      });
      return { homework: list };
    },
  );

  app.post(
    "/homework/:id/submit",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const schema = z.object({ content: z.string().min(1) });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "请填写作业内容" });

      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });

      const ok = await enrolledOrTeacher(
        req.auth!.sub,
        req.auth!.role,
        hw.courseId,
        hw.course.teacherId,
      );
      if (!ok) return reply.code(403).send({ error: "未选课" });

      const sub = await prisma.homeworkSubmission.upsert({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
        create: {
          homeworkId: id,
          userId: req.auth!.sub,
          content: body.data.content,
        },
        update: {
          content: body.data.content,
          graded: false,
        },
      });
      return { submission: sub };
    },
  );

  app.get(
    "/homework/:id/submissions",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (hw.course.teacherId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
        return reply.code(403).send({ error: "无权查看" });
      }

      const rows = await prisma.homeworkSubmission.findMany({
        where: { homeworkId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { updatedAt: "desc" },
      });
      return { submissions: rows };
    },
  );

  app.patch(
    "/homework/submissions/:sid/grade",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { sid } = req.params as { sid: string };
      const schema = z.object({
        score: z.number().min(0).max(100),
        feedback: z.string().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const row = await prisma.homeworkSubmission.findUnique({
        where: { id: sid },
        include: { homework: { include: { course: true } } },
      });
      if (!row) return reply.code(404).send({ error: "提交不存在" });
      if (
        row.homework.course.teacherId !== req.auth!.sub &&
        req.auth!.role !== "ADMIN"
      ) {
        return reply.code(403).send({ error: "无权批改" });
      }

      const updated = await prisma.homeworkSubmission.update({
        where: { id: sid },
        data: {
          score: body.data.score,
          feedback: body.data.feedback,
          graded: true,
        },
      });
      return { submission: updated };
    },
  );

  app.get("/homework/mine", { preHandler: authRequired("STUDENT", "ADMIN") }, async (req) => {
    const rows = await prisma.homeworkSubmission.findMany({
      where: { userId: req.auth!.sub },
      include: {
        homework: {
          include: {
            course: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return { submissions: rows };
  });
};

export default homeworkRoutes;
