import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { getJudgeQueue } from "../lib/queue.js";

async function canAccessCourse(
  userId: string,
  role: string,
  courseId: string,
  teacherId: string,
) {
  if (role === "ADMIN" || teacherId === userId) return true;
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  return !!en;
}

const labsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/courses/:courseId/labs",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canAccessCourse(req.auth!.sub, req.auth!.role, courseId, course.teacherId);
      if (!ok) return reply.code(403).send({ error: "未选课或无权访问" });

      const labs = await prisma.lab.findMany({
        where: { courseId },
        orderBy: { title: "asc" },
        select: { id: true, title: true, description: true, language: true },
      });
      return { labs };
    },
  );

  app.post(
    "/courses/:courseId/labs",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权创建实验" });
      }

      const schema = z.object({
        title: z.string().min(1),
        description: z.string().optional(),
        language: z.enum(["javascript", "python"]),
        starterCode: z.string().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const lab = await prisma.lab.create({
        data: {
          courseId,
          title: body.data.title,
          description: body.data.description,
          language: body.data.language,
          starterCode: body.data.starterCode ?? "",
        },
      });
      return { lab };
    },
  );

  app.get("/labs/:id", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lab = await prisma.lab.findUnique({
      where: { id },
      include: {
        course: true,
        testCases: req.auth!.role === "STUDENT" ? { where: { hidden: false } } : true,
      },
    });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });

    const ok = await canAccessCourse(
      req.auth!.sub,
      req.auth!.role,
      lab.courseId,
      lab.course.teacherId,
    );
    if (!ok) return reply.code(403).send({ error: "无权访问" });

    if (req.auth!.role === "STUDENT") {
      return {
        lab: {
          id: lab.id,
          title: lab.title,
          description: lab.description,
          language: lab.language,
          starterCode: lab.starterCode,
          testCases: lab.testCases,
        },
      };
    }

    const full = await prisma.lab.findUnique({
      where: { id },
      include: { testCases: true, course: { select: { id: true, title: true } } },
    });
    return { lab: full };
  });

  // 实验附件上传/下载由 routes/lab-files.ts 提供

  app.post(
    "/labs/:id/testcases",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lab = await prisma.lab.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!lab || (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权编辑" });
      }

      const schema = z.object({
        input: z.string(),
        expected: z.string(),
        hidden: z.boolean().optional(),
        weight: z.number().int().positive().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const tc = await prisma.testCase.create({
        data: {
          labId: id,
          input: body.data.input,
          expected: body.data.expected,
          hidden: body.data.hidden ?? false,
          weight: body.data.weight ?? 1,
        },
      });
      return { testCase: tc };
    },
  );

  /** 教师：查看全部测试用例（含隐藏） */
  app.get(
    "/labs/:id/testcases",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lab = await prisma.lab.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!lab || (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权查看" });
      }

      const rows = await prisma.testCase.findMany({
        where: { labId: id },
        orderBy: { id: "asc" },
      });
      return { testCases: rows };
    },
  );

  /** 教师：更新单条测试用例 */
  app.patch(
    "/testcases/:tcId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { tcId } = req.params as { tcId: string };
      const tc = await prisma.testCase.findUnique({ where: { id: tcId } });
      if (!tc) return reply.code(404).send({ error: "用例不存在" });
      const lab = await prisma.lab.findUnique({ where: { id: tc.labId }, include: { course: true } });
      if (!lab || (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权编辑" });
      }

      const schema = z.object({
        input: z.string().optional(),
        expected: z.string().optional(),
        hidden: z.boolean().optional(),
        weight: z.number().int().positive().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const updated = await prisma.testCase.update({
        where: { id: tcId },
        data: body.data,
      });
      return { testCase: updated };
    },
  );

  /** 教师：删除测试用例 */
  app.delete(
    "/testcases/:tcId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { tcId } = req.params as { tcId: string };
      const tc = await prisma.testCase.findUnique({ where: { id: tcId } });
      if (!tc) return { ok: true };
      const lab = await prisma.lab.findUnique({ where: { id: tc.labId }, include: { course: true } });
      if (!lab || (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权删除" });
      }
      await prisma.testCase.delete({ where: { id: tcId } });
      return { ok: true };
    },
  );

  app.post("/labs/:id/submit", { preHandler: authRequired("STUDENT", "ADMIN") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ code: z.string().min(1) });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "请提交代码" });

    const lab = await prisma.lab.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });

    const ok = await canAccessCourse(
      req.auth!.sub,
      req.auth!.role,
      lab.courseId,
      lab.course.teacherId,
    );
    if (!ok) return reply.code(403).send({ error: "未选课" });

    const submission = await prisma.submission.create({
      data: {
        labId: id,
        userId: req.auth!.sub,
        code: body.data.code,
        status: "PENDING",
      },
    });

    await getJudgeQueue().add(
      "judge",
      { submissionId: submission.id },
      { jobId: submission.id },
    );

    return { submissionId: submission.id, status: submission.status };
  });

  app.get("/labs/:id/submissions", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lab = await prisma.lab.findUnique({
      where: { id },
      include: { course: true },
    });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });

    if (req.auth!.role === "STUDENT") {
      const rows = await prisma.submission.findMany({
        where: { labId: id, userId: req.auth!.sub },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return { submissions: rows };
    }

    if (lab.course.teacherId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
      return reply.code(403).send({ error: "无权查看全班提交" });
    }

    const rows = await prisma.submission.findMany({
      where: { labId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return { submissions: rows };
  });

  app.get("/submissions/:submissionId", { preHandler: authRequired() }, async (req, reply) => {
    const { submissionId } = req.params as { submissionId: string };
    const sub = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        lab: { include: { course: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
    if (!sub) return reply.code(404).send({ error: "记录不存在" });

    if (req.auth!.role === "STUDENT") {
      if (sub.userId !== req.auth!.sub) return reply.code(403).send({ error: "无权查看" });
    } else if (req.auth!.role !== "ADMIN" && sub.lab.course.teacherId !== req.auth!.sub) {
      return reply.code(403).send({ error: "无权查看" });
    }

    return { submission: sub };
  });

  /** 学生友好反馈（会自动隐藏 hidden 用例的 I/O） */
  app.get(
    "/submissions/:submissionId/feedback",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { submissionId } = req.params as { submissionId: string };
      const sub = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { lab: { include: { course: true } } },
      });
      if (!sub) return reply.code(404).send({ error: "记录不存在" });

      const isOwner = sub.userId === req.auth!.sub;
      const isTeacher = req.auth!.role !== "STUDENT" && (req.auth!.role === "ADMIN" || sub.lab.course.teacherId === req.auth!.sub);
      if (!isOwner && !isTeacher) return reply.code(403).send({ error: "无权查看" });

      let parsed: any = null;
      if (sub.resultJson) {
        try {
          parsed = JSON.parse(sub.resultJson);
        } catch {
          parsed = { raw: sub.resultJson };
        }
      }

      const details: any[] = Array.isArray(parsed?.details) ? parsed.details : [];
      const masked = details.map((d) => {
        if (!d || typeof d !== "object") return d;
        if ((d as any).hidden === true && !isTeacher) {
          const { input, expected, got, stderr, ...rest } = d as any;
          return { ...rest, hidden: true };
        }
        return d;
      });

      return {
        submission: {
          id: sub.id,
          status: sub.status,
          score: sub.score,
          createdAt: sub.createdAt,
          labId: sub.labId,
        },
        feedback: {
          details: masked,
          last: parsed?.last ?? null,
          note: parsed?.note ?? null,
        },
      };
    },
  );

  /** 可选：防作弊相似度（教师/管理员） */
  app.get(
    "/submissions/:submissionId/similarity",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { submissionId } = req.params as { submissionId: string };
      const base = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { lab: { include: { course: true } }, user: { select: { id: true, name: true, email: true } } },
      });
      if (!base) return reply.code(404).send({ error: "记录不存在" });
      if (req.auth!.role !== "ADMIN" && base.lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权查看" });
      }

      const maxCompare = Math.min(Number((req.query as any)?.limit ?? 200), 500);
      const others = await prisma.submission.findMany({
        where: { labId: base.labId, id: { not: base.id } },
        orderBy: { createdAt: "desc" },
        take: maxCompare,
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      const norm = (s: string) =>
        s
          .replace(/\r\n/g, "\n")
          .replace(/\/\*[\s\S]*?\*\//g, "") // block comments
          .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, "") // line comments
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();

      const shingles = (s: string, k = 18) => {
        const t = norm(s);
        const out = new Set<string>();
        if (t.length <= k) {
          if (t) out.add(t);
          return out;
        }
        for (let i = 0; i <= t.length - k; i++) out.add(t.slice(i, i + k));
        return out;
      };

      const jaccard = (a: Set<string>, b: Set<string>) => {
        if (a.size === 0 || b.size === 0) return 0;
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        const union = a.size + b.size - inter;
        return union === 0 ? 0 : inter / union;
      };

      const baseSet = shingles(base.code);
      const scored = others.map((o) => {
        const score = jaccard(baseSet, shingles(o.code));
        return {
          submissionId: o.id,
          score: Number((score * 100).toFixed(1)),
          createdAt: o.createdAt,
          user: o.user,
        };
      });

      scored.sort((x, y) => y.score - x.score);

      return {
        base: { submissionId: base.id, user: base.user },
        top: scored.slice(0, 10),
        note: "相似度为启发式 Jaccard（字符 shingles），仅供演示与初筛，不作为最终判定依据。",
      };
    },
  );
};

export default labsRoutes;
