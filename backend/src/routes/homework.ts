import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { teachingHomeworkOverviewForTeacher } from "../lib/teaching-homework-overview.js";

async function enrolledOrTeacher(userId: string, role: string, courseId: string, teacherId: string) {
  if (role === "ADMIN" || teacherId === userId) return true;
  return !!(await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  }));
}

function csvEscape(cell: string) {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

const homeworkRoutes: FastifyPluginAsync = async (app) => {
  /** 教师：本人授课课程下的全部作业（测评入口列表） */
  app.get("/homework/teaching", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req) => {
    return teachingHomeworkOverviewForTeacher(req.auth!.sub, req.auth!.role);
  });

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
        targetClassId: z.string().uuid().optional().nullable(),
        published: z.boolean().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      if (body.data.targetClassId) {
        const cls = await prisma.class.findFirst({
          where: { id: body.data.targetClassId, courseId },
        });
        if (!cls) return reply.code(400).send({ error: "指定班级不属于本课程" });
      }

      const hw = await prisma.homework.create({
        data: {
          courseId,
          title: body.data.title,
          description: body.data.description,
          dueAt: body.data.dueAt ?? undefined,
          targetClassId: body.data.targetClassId ?? undefined,
          published: body.data.published ?? false,
          publishedAt: body.data.published ? new Date() : null,
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

      const whereForStudent = await (async () => {
        if (req.auth!.role !== "STUDENT") return { courseId };
        const en = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: req.auth!.sub, courseId } },
        });
        return {
          courseId,
          published: true,
          OR: [{ targetClassId: null }, { targetClassId: en?.classId ?? "__no_class__" }],
        };
      })();

      const list = await prisma.homework.findMany({
        where: whereForStudent as any,
        orderBy: [{ dueAt: "asc" }, { title: "asc" }],
        include: { targetClass: { select: { id: true, name: true } } },
      });
      return { homework: list };
    },
  );

  app.patch(
    "/homework/:id",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (req.auth!.role !== "ADMIN" && hw.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权编辑" });
      }

      const schema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        dueAt: z.coerce.date().nullable().optional(),
        targetClassId: z.string().uuid().nullable().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      if (body.data.targetClassId) {
        const cls = await prisma.class.findFirst({
          where: { id: body.data.targetClassId, courseId: hw.courseId },
        });
        if (!cls) return reply.code(400).send({ error: "指定班级不属于本课程" });
      }

      const updated = await prisma.homework.update({
        where: { id },
        data: {
          ...body.data,
          dueAt: body.data.dueAt ?? undefined,
        } as any,
      });
      return { homework: updated };
    },
  );

  /** 作业发布/撤回（成绩发布是另外的接口） */
  app.patch(
    "/homework/:id/publish",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const schema = z.object({ published: z.boolean() });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (req.auth!.role !== "ADMIN" && hw.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权发布" });
      }

      const updated = await prisma.homework.update({
        where: { id },
        data: { published: body.data.published, publishedAt: body.data.published ? new Date() : null },
      });
      return { homework: updated };
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
          released: false,
        },
        update: {
          content: body.data.content,
          graded: false,
          released: false,
          score: null,
          feedback: null,
          releasedAt: null,
        },
      });
      return { submission: sub };
    },
  );

  app.get(
    "/homework/:id/export-grades.csv",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (hw.course.teacherId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
        return reply.code(403).send({ error: "无权导出" });
      }

      const rows = await prisma.homeworkSubmission.findMany({
        where: { homeworkId: id },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { updatedAt: "desc" },
      });

      const header = ["姓名", "邮箱", "分数", "已批改", "成绩已发布", "反馈", "最后更新(ISO)"];
      const lines = [header.join(",")];
      for (const r of rows) {
        const cells = [
          csvEscape(r.user.name),
          csvEscape(r.user.email),
          r.score == null ? "" : String(r.score),
          r.graded ? "是" : "否",
          r.released ? "是" : "否",
          csvEscape((r.feedback ?? "").replace(/\r\n/g, "\n")),
          csvEscape(new Date(r.updatedAt).toISOString()),
        ];
        lines.push(cells.join(","));
      }

      const safeTitle = hw.title.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60);
      const filename = `作业成绩_${safeTitle}.csv`;
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
        .send(`\ufeff${lines.join("\n")}\n`);
    },
  );

  app.get(
    "/homework/:id/submissions",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: { select: { id: true, title: true, teacherId: true } } },
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
      return {
        homework: {
          id: hw.id,
          title: hw.title,
          description: hw.description,
          courseId: hw.courseId,
          courseTitle: hw.course.title,
          published: hw.published,
        },
        submissions: rows,
      };
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
          released: false,
          releasedAt: null,
        },
      });
      return { submission: updated };
    },
  );

  /** AI 辅助批改建议（教师可选择 apply 直接写入成绩） */
  app.post(
    "/homework/submissions/:sid/ai-suggest",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { sid } = req.params as { sid: string };
      const schema = z.object({ apply: z.boolean().optional() });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const row = await prisma.homeworkSubmission.findUnique({
        where: { id: sid },
        include: { homework: { include: { course: true } }, user: true },
      });
      if (!row) return reply.code(404).send({ error: "提交不存在" });
      if (req.auth!.role !== "ADMIN" && row.homework.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权操作" });
      }

      const text = row.content.trim();
      const len = text.length;
      const paragraphs = text.split(/\n{2,}/).filter((x) => x.trim().length > 0).length;
      const keywords = ["复杂度", "算法", "数据结构", "实现", "思路", "边界", "优化", "案例"];
      const hit = keywords.filter((k) => text.includes(k)).length;

      // 简易启发式：长度 + 结构 + 关键词覆盖（演示用）
      const score =
        Math.max(
          0,
          Math.min(
            100,
            Math.round(
              35 +
                Math.min(35, len / 20) +
                Math.min(10, paragraphs * 3) +
                Math.min(20, hit * 4),
            ),
          ),
        );
      const feedback = [
        `AI建议分数：${score}（仅供教师参考）`,
        len < 60 ? "内容较短，建议补充分析过程与关键步骤。" : "内容长度充足。",
        hit < 2 ? "关键词覆盖较少，建议补充术语与关键概念。" : "关键词覆盖较好。",
        paragraphs <= 1 ? "建议分段组织答案，增强可读性。" : "结构分段较清晰。",
      ].join("\n");

      if (body.data.apply) {
        const updated = await prisma.homeworkSubmission.update({
          where: { id: sid },
          data: { score, feedback, graded: true, released: false, releasedAt: null },
        });
        return { suggestion: { score, feedback }, applied: true, submission: updated };
      }

      return { suggestion: { score, feedback }, applied: false };
    },
  );

  /** 教师：发布该作业的已批改成绩 */
  app.patch(
    "/homework/:id/release-grades",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (req.auth!.role !== "ADMIN" && hw.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权发布成绩" });
      }

      const result = await prisma.homeworkSubmission.updateMany({
        where: { homeworkId: id, graded: true },
        data: { released: true, releasedAt: new Date() },
      });
      return { releasedCount: result.count };
    },
  );

  /** 作业问答：学生提问 / 教师回答 */
  app.get("/homework/:id/questions", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const hw = await prisma.homework.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!hw) return reply.code(404).send({ error: "作业不存在" });
    const ok = await enrolledOrTeacher(req.auth!.sub, req.auth!.role, hw.courseId, hw.course.teacherId);
    if (!ok) return reply.code(403).send({ error: "无权查看问答" });

    const qs = await (prisma as any).homeworkQuestion.findMany({
      where: { homeworkId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true } },
        answeredBy: { select: { id: true, name: true } },
      },
    });
    return { questions: qs };
  });

  app.post("/homework/:id/questions", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ question: z.string().min(1).max(1000) });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const hw = await prisma.homework.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!hw) return reply.code(404).send({ error: "作业不存在" });
    const ok = await enrolledOrTeacher(req.auth!.sub, req.auth!.role, hw.courseId, hw.course.teacherId);
    if (!ok) return reply.code(403).send({ error: "无权提问" });

    const q = await (prisma as any).homeworkQuestion.create({
      data: {
        homeworkId: id,
        userId: req.auth!.sub,
        question: body.data.question,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    return { question: q };
  });

  app.patch(
    "/homework/questions/:qid/answer",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { qid } = req.params as { qid: string };
      const schema = z.object({ answer: z.string().min(1).max(2000) });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const q = await (prisma as any).homeworkQuestion.findUnique({
        where: { id: qid },
        include: { homework: { include: { course: true } } },
      });
      if (!q) return reply.code(404).send({ error: "问题不存在" });
      if (req.auth!.role !== "ADMIN" && q.homework.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权回答" });
      }

      const updated = await (prisma as any).homeworkQuestion.update({
        where: { id: qid },
        data: { answer: body.data.answer, answeredById: req.auth!.sub, answeredAt: new Date() },
      });
      return { question: updated };
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
    const sanitized = rows.map((r) => ({
      ...r,
      score: r.released ? r.score : null,
      feedback: r.released ? r.feedback : null,
    }));
    return { submissions: sanitized };
  });
};

export default homeworkRoutes;
