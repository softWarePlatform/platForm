import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { config } from "../lib/config.js";
import type { PracticeDifficulty, PracticeQuestionType } from "@lab/prisma-client-v2";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { getCourseAccess } from "../lib/courseAccess.js";
import { gradePracticeAnswer } from "../lib/practice-grade.js";
import { analyzeWrongAnswer, findSimilarQuestions } from "../lib/practice-ai.js";
import {
  pickQuestionsForSession,
  serializeQuestionForStudent,
  serializeQuestionForTeacher,
} from "../lib/practice-pick.js";
import {
  filterByTagRules,
  parseTagFilterQuery,
  PRACTICE_TAG_MATCH_MODES,
} from "../lib/practice-tag-filter.js";
import { extractDocumentText } from "../lib/practice-document.js";
import { extractQuestionsFromDocumentText } from "../lib/practice-import-ai.js";
import { createPracticeQuestionRecord, isAnswerProvided } from "../lib/practice-question-write.js";
import {
  parseTutorTurns,
  PRACTICE_TUTOR_QUICK_PROMPTS,
  runPracticeTutorChat,
  type PracticeTutorQuickAction,
} from "../lib/practice-tutor.js";
import { createCourseNotifications, fetchCourseUsers } from "../course-client.js";

async function listCourseKnowledgeTags(courseId: string, includeAllQuestions: boolean) {
  const [catalog, fromQuestions] = await Promise.all([
    prisma.practiceKnowledgeTag.findMany({
      where: { courseId },
      select: { tagPath: true },
    }),
    prisma.practiceQuestion.findMany({
      where: {
        courseId,
        ...(includeAllQuestions ? {} : { auditStatus: "APPROVED" as const }),
      },
      select: { tagPath: true },
      distinct: ["tagPath"],
    }),
  ]);
  return [...new Set([...catalog.map((r) => r.tagPath), ...fromQuestions.map((r) => r.tagPath)])].sort();
}

async function ensureKnowledgeTag(courseId: string, tagPath: string) {
  const path = tagPath.trim();
  if (!path) return;
  await prisma.practiceKnowledgeTag.upsert({
    where: { courseId_tagPath: { courseId, tagPath: path } },
    create: { courseId, tagPath: path },
    update: {},
  });
}
const teacherQuestionSchema = z.object({
  type: z.enum(["CHOICE", "FILL", "SHORT_ANSWER", "CODE"]),
  stem: z.string().min(1).max(50_000),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  answer: z.unknown().optional(),
  explanation: z.string().max(50_000).optional(),
  tagPath: z.string().min(1).max(500),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  language: z.string().max(32).optional(),
  answerFromDocument: z.boolean().optional(),
});

const importSaveSchema = z.object({
  questions: z
    .array(
      teacherQuestionSchema.extend({
        answerSource: z.enum(["TEACHER", "AI"]).optional(),
        answerConfirmed: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
});

async function requireCourseView(courseId: string, userId: string, role: string) {
  const access = await getCourseAccess(userId, role, courseId);
  if (!access.course) return { ok: false as const, code: 404, error: "课程不存在" };
  if (!access.canView) return { ok: false as const, code: 403, error: "无权访问该课程" };
  return { ok: true as const, access };
}

const practiceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses/:courseId/practice/tags", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    const tags = await listCourseKnowledgeTags(courseId, gate.access.isTeacher);
    return { tags };
  });

  /** 按当前筛选条件统计可练习题目数（与学生组卷条件一致） */
  app.get("/courses/:courseId/practice/match-count", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    const tagFilter = parseTagFilterQuery(req.query as { tagMode?: string; tags?: string | string[] });
    const questions = await prisma.practiceQuestion.findMany({
      where: {
        courseId,
        auditStatus: "APPROVED",
        answerConfirmed: true,
      },
      select: { tagPath: true },
    });

    const matched = tagFilter
      ? filterByTagRules(questions, tagFilter.tags, tagFilter.mode)
      : questions;

    const pendingConfirm = await prisma.practiceQuestion.count({
      where: { courseId, auditStatus: "APPROVED", answerConfirmed: false },
    });

    return {
      count: matched.length,
      totalApproved: questions.length,
      pendingConfirm,
    };
  });

  app.post("/courses/:courseId/practice/tags", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });
    if (!gate.access.isTeacher) return reply.code(403).send({ error: "仅教师可新建标签" });

    const body = z.object({ tagPath: z.string().min(1).max(500) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "请填写标签路径" });

    await ensureKnowledgeTag(courseId, body.data.tagPath);
    const tags = await listCourseKnowledgeTags(courseId, gate.access.isTeacher);
    return { tagPath: body.data.tagPath.trim(), tags };
  });

  app.get("/courses/:courseId/practice/questions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    const isTeacher = gate.access.isTeacher;
    const where = { courseId, ...(isTeacher ? {} : { auditStatus: "APPROVED" as const }) };
    let questions = await prisma.practiceQuestion.findMany({
      where,
      orderBy: [{ tagPath: "asc" }, { createdAt: "desc" }],
    });

    if (!isTeacher) {
      const tagFilter = parseTagFilterQuery(req.query as { tagMode?: string; tags?: string | string[] });
      if (tagFilter) {
        questions = filterByTagRules(questions, tagFilter.tags, tagFilter.mode);
      }
    }

    if (isTeacher) {
      return { questions: questions.map(serializeQuestionForTeacher) };
    }
    return {
      questions: questions.map((q) => ({
        id: q.id,
        type: q.type,
        stem: q.stem.slice(0, 80),
        tagPath: q.tagPath,
        difficulty: q.difficulty,
        attemptCount: q.attemptCount,
        correctRate: q.attemptCount > 0 ? q.correctCount / q.attemptCount : null,
      })),
    };
  });

  app.post("/courses/:courseId/practice/questions", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });
    if (!gate.access.isTeacher) return reply.code(403).send({ error: "仅教师可管理题库" });

    const body = teacherQuestionSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效", details: body.error.flatten() });

    const q = await createPracticeQuestionRecord({
      courseId,
      type: body.data.type as PracticeQuestionType,
      stem: body.data.stem,
      options: body.data.options,
      answer: body.data.answer,
      explanation: body.data.explanation,
      tagPath: body.data.tagPath,
      difficulty: (body.data.difficulty ?? "MEDIUM") as PracticeDifficulty,
      language: body.data.language,
      createdById: req.auth!.sub,
      answerFromDocument: body.data.answerFromDocument,
    });
    await ensureKnowledgeTag(courseId, body.data.tagPath);
    return { question: serializeQuestionForTeacher(q) };
  });

  app.patch("/practice/questions/:questionId", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { questionId } = req.params as { questionId: string };
    const existing = await prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    if (!existing) return reply.code(404).send({ error: "题目不存在" });
    const gate = await requireCourseView(existing.courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权修改" });

    const body = teacherQuestionSchema.partial().extend({ confirmAsStandard: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const patchData: Record<string, unknown> = {
      ...(body.data.type ? { type: body.data.type as PracticeQuestionType } : {}),
      ...(body.data.stem !== undefined ? { stem: body.data.stem } : {}),
      ...(body.data.options !== undefined
        ? { optionsJson: body.data.options ? JSON.stringify(body.data.options) : null }
        : {}),
      ...(body.data.explanation !== undefined ? { explanation: body.data.explanation } : {}),
      ...(body.data.tagPath !== undefined ? { tagPath: body.data.tagPath } : {}),
      ...(body.data.difficulty ? { difficulty: body.data.difficulty as PracticeDifficulty } : {}),
      ...(body.data.language !== undefined ? { language: body.data.language } : {}),
    };

    if (body.data.answer !== undefined) {
      patchData.answerJson = JSON.stringify(body.data.answer);
      if (isAnswerProvided(body.data.answer) || body.data.confirmAsStandard) {
        patchData.answerSource = "TEACHER";
        patchData.answerConfirmed = true;
        patchData.auditStatus = "APPROVED";
      }
    }

    if (body.data.confirmAsStandard && body.data.answer === undefined) {
      patchData.answerSource = "TEACHER";
      patchData.answerConfirmed = true;
      patchData.auditStatus = "APPROVED";
    }

    const q = await prisma.practiceQuestion.update({
      where: { id: questionId },
      data: patchData,
    });
    if (body.data.tagPath) await ensureKnowledgeTag(existing.courseId, body.data.tagPath);
    return { question: serializeQuestionForTeacher(q) };
  });

  app.post("/practice/questions/:questionId/confirm-answer", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { questionId } = req.params as { questionId: string };
    const existing = await prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    if (!existing) return reply.code(404).send({ error: "题目不存在" });
    const gate = await requireCourseView(existing.courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权操作" });

    const body = z
      .object({
        answer: z.unknown(),
        explanation: z.string().max(50_000).optional(),
      })
      .safeParse(req.body);
    if (!body.success || !isAnswerProvided(body.data.answer)) {
      return reply.code(400).send({ error: "请提供有效标准答案" });
    }

    const q = await prisma.practiceQuestion.update({
      where: { id: questionId },
      data: {
        answerJson: JSON.stringify(body.data.answer),
        ...(body.data.explanation !== undefined ? { explanation: body.data.explanation } : {}),
        answerSource: "TEACHER",
        answerConfirmed: true,
        auditStatus: "APPROVED",
      },
    });
    return { question: serializeQuestionForTeacher(q) };
  });

  app.delete("/practice/questions/:questionId", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { questionId } = req.params as { questionId: string };
    const existing = await prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    if (!existing) return reply.code(404).send({ error: "题目不存在" });
    const gate = await requireCourseView(existing.courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权删除" });
    await prisma.practiceQuestion.delete({ where: { id: questionId } });
    return { ok: true };
  });

  app.post("/courses/:courseId/practice/questions/import", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权导入" });

    const schema = z.object({ questions: z.array(teacherQuestionSchema).min(1).max(200) });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "请提交 { questions: [...] } JSON 数组" });

    const created = [];
    for (const q of body.data.questions) {
      const row = await createPracticeQuestionRecord({
        courseId,
        type: q.type as PracticeQuestionType,
        stem: q.stem,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
        tagPath: q.tagPath,
        difficulty: (q.difficulty ?? "MEDIUM") as PracticeDifficulty,
        language: q.language,
        createdById: req.auth!.sub,
        answerFromDocument: q.answerFromDocument,
      });
      created.push(row);
    }
    await Promise.all(body.data.questions.map((q) => ensureKnowledgeTag(courseId, q.tagPath)));
    return { imported: created.length };
  });

  app.post(
    "/courses/:courseId/practice/import-document",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
      if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权导入" });

      const parts = (req as unknown as { parts: () => AsyncIterable<{ type: string; fieldname: string; filename?: string; mimetype?: string; value?: unknown; toBuffer?: () => Promise<Buffer> }> }).parts();
      let fileBuf: Buffer | null = null;
      let origName = "";
      let tagPath = "";

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file" && part.toBuffer) {
          origName = part.filename ?? "upload.bin";
          fileBuf = await part.toBuffer();
        } else if (part.type === "field" && part.fieldname === "tagPath") {
          tagPath = String(part.value ?? "").trim();
        }
      }

      if (!fileBuf) return reply.code(400).send({ error: "请上传 PDF 或 Word（.docx）文件，字段名 file" });
      if (!tagPath) return reply.code(400).send({ error: "请选择或填写知识点标签 tagPath" });

      await ensureKnowledgeTag(courseId, tagPath);

      let text: string;
      try {
        text = await extractDocumentText(origName, fileBuf);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "文档解析失败";
        return reply.code(400).send({ error: msg });
      }

      const { drafts, notice } = await extractQuestionsFromDocumentText(text, tagPath);
      return {
        tagPath,
        drafts: drafts.map((d) => ({
          ...d,
          tagPath,
          answerLabel: d.answerSource === "AI" && !d.answerFromDocument ? "AI提供，仅供参考" : "教师/文档提供",
        })),
        notice,
      };
    },
  );

  app.post(
    "/courses/:courseId/practice/import-document/save",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
      if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权导入" });

      const body = importSaveSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const created = [];
      for (const q of body.data.questions) {
        const teacherProvided = isAnswerProvided(q.answer);
        const row = await prisma.practiceQuestion.create({
          data: {
            courseId,
            type: q.type as PracticeQuestionType,
            stem: q.stem,
            optionsJson: q.options ? JSON.stringify(q.options) : null,
            answerJson: JSON.stringify(q.answer ?? {}),
            explanation: q.explanation?.trim() || "（待补充解析）",
            tagPath: q.tagPath,
            difficulty: (q.difficulty ?? "MEDIUM") as PracticeDifficulty,
            language: q.language,
            createdById: req.auth!.sub,
            answerSource: q.answerSource ?? (teacherProvided ? "TEACHER" : "AI"),
            answerConfirmed: q.answerConfirmed ?? teacherProvided,
            auditStatus: (q.answerConfirmed ?? teacherProvided) ? "APPROVED" : "PENDING_REVIEW",
          },
        });
        await ensureKnowledgeTag(courseId, q.tagPath);
        created.push(serializeQuestionForTeacher(row));
      }
      return { imported: created.length, questions: created };
    },
  );

  app.get("/courses/:courseId/practice/feedbacks", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const status = (req.query as { status?: string }).status ?? "PENDING";
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权查看" });

    const feedbacks = await prisma.practiceQuestionFeedback.findMany({
      where: { courseId, status: status as "PENDING" },
      orderBy: { createdAt: "desc" },
      include: {
        question: { select: { id: true, stem: true, tagPath: true } },
      },
    });
    const users = await fetchCourseUsers(feedbacks.map((row) => row.userId), req.id);
    const usersById = new Map(users.users.map((user) => [user.id, user]));
    return { feedbacks: feedbacks.map((row) => ({ ...row, user: usersById.get(row.userId) ?? null })) };
  });

  app.patch("/practice/feedbacks/:feedbackId", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { feedbackId } = req.params as { feedbackId: string };
    const schema = z.object({
      status: z.enum(["FIXED", "REJECTED", "CLOSED"]),
      teacherReply: z.string().max(5000).optional(),
      patchQuestion: teacherQuestionSchema.partial().optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const fb = await prisma.practiceQuestionFeedback.findUnique({
      where: { id: feedbackId },
      include: { question: true },
    });
    if (!fb) return reply.code(404).send({ error: "反馈不存在" });
    const gate = await requireCourseView(fb.courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权处理" });

    if (body.data.status === "FIXED" && body.data.patchQuestion) {
      const p = body.data.patchQuestion;
      await prisma.practiceQuestion.update({
        where: { id: fb.questionId },
        data: {
          ...(p.stem !== undefined ? { stem: p.stem } : {}),
          ...(p.options !== undefined ? { optionsJson: JSON.stringify(p.options) } : {}),
          ...(p.answer !== undefined ? { answerJson: JSON.stringify(p.answer) } : {}),
          ...(p.explanation !== undefined ? { explanation: p.explanation } : {}),
          ...(p.tagPath !== undefined ? { tagPath: p.tagPath } : {}),
          auditStatus: "PENDING_REVIEW",
        },
      });
    }

    const updated = await prisma.practiceQuestionFeedback.update({
      where: { id: feedbackId },
      data: {
        status: body.data.status,
        teacherReply: body.data.teacherReply,
        resolvedById: req.auth!.sub,
        resolvedAt: new Date(),
      },
    });

    await createCourseNotifications({
      userIds: [fb.userId],
      type: "PRACTICE_FEEDBACK",
      title: "题目反馈已处理",
      body: body.data.teacherReply ?? `状态：${body.data.status}`,
      linkPath: `/courses/${fb.courseId}/practice`,
      idempotencyKey: `practice-feedback:${fb.id}:${body.data.status}`,
      requestId: req.id,
    });

    return { feedback: updated };
  });

  app.post("/courses/:courseId/practice/sessions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });
    if (gate.access.isTeacher) {
      return reply.code(403).send({ error: "教师请使用题库管理出题或导入，无需进行学生练习" });
    }

    const schema = z.object({
      mode: z.enum(["SMART", "BY_TAG", "WRONG_BOOK", "CUSTOM"]),
      count: z.number().int().min(1).max(20).optional(),
      tagPath: z.string().optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
      tagPrefix: z.string().optional(),
      tagMode: z.enum(PRACTICE_TAG_MATCH_MODES).optional(),
      tags: z.array(z.string().min(1)).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const selectedTags = (body.data.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const tagFilter =
      selectedTags.length > 0
        ? { tags: selectedTags, mode: body.data.tagMode ?? ("INCLUDE_ANY" as const) }
        : undefined;

    if (body.data.mode === "BY_TAG" && !tagFilter && !body.data.tagPath) {
      return reply.code(400).send({ error: "请至少选择一个知识点标签" });
    }

    const count =
      body.data.mode === "CUSTOM" ? (body.data.count ?? 10) : body.data.mode === "SMART" ? 10 : (body.data.count ?? 10);

    const questions = await pickQuestionsForSession({
      courseId,
      userId: req.auth!.sub,
      mode: body.data.mode,
      count,
      tagPath: body.data.tagPath,
      difficulty: body.data.difficulty as PracticeDifficulty | undefined,
      tagPrefix: tagFilter ? undefined : body.data.tagPrefix,
      tagFilter,
    });

    if (questions.length === 0) {
      let hint = "没有可用题目，请让教师先添加题库或检查筛选条件";
      if (tagFilter?.tags.length) {
        const pool = await prisma.practiceQuestion.findMany({
          where: { courseId, auditStatus: "APPROVED", answerConfirmed: true },
          select: { tagPath: true },
        });
        const n = filterByTagRules(pool, tagFilter.tags, tagFilter.mode).length;
        const pending = await prisma.practiceQuestion.count({
          where: { courseId, auditStatus: "APPROVED", answerConfirmed: false },
        });
        hint =
          n > 0
            ? `符合条件的题目不足（仅 ${n} 道，需要 ${count} 道），请减少题量或调整筛选`
            : `当前筛选下无已确认题目；请确认题目标签与筛选一致，或请教师在题库中「确认标准答案」`;
        if (pending > 0) hint += `（另有 ${pending} 道待教师确认）`;
      }
      return reply.code(400).send({ error: hint });
    }

    const session = await prisma.practiceSession.create({
      data: {
        userId: req.auth!.sub,
        courseId,
        mode: body.data.mode,
        tagFilter: tagFilter
          ? JSON.stringify(tagFilter)
          : body.data.tagPath ?? body.data.tagPrefix ?? null,
        configJson: JSON.stringify(body.data),
        maxScore: questions.length,
        items: {
          create: questions.map((q, i) => ({
            questionId: q.id,
            orderIndex: i,
            maxScore: 1,
          })),
        },
      },
      include: {
        items: { include: { question: true }, orderBy: { orderIndex: "asc" } },
      },
    });

    return {
      session: {
        id: session.id,
        mode: session.mode,
        status: session.status,
        maxScore: session.maxScore,
        items: session.items.map((it) => ({
          id: it.id,
          orderIndex: it.orderIndex,
          question: serializeQuestionForStudent(it.question, true),
        })),
      },
    };
  });

  app.get("/practice/sessions/:sessionId", { preHandler: authRequired() }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        items: { include: { question: true }, orderBy: { orderIndex: "asc" } },
      },
    });
    if (!session) return reply.code(404).send({ error: "练习不存在" });
    if (session.userId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
      const gate = await requireCourseView(session.courseId, req.auth!.sub, req.auth!.role);
      if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权查看" });
    }

    const graded = session.status === "GRADED";
    return {
      session: {
        id: session.id,
        courseId: session.courseId,
        mode: session.mode,
        status: session.status,
        score: session.score,
        maxScore: session.maxScore,
        submittedAt: session.submittedAt?.toISOString(),
        items: session.items.map((it) => ({
          id: it.id,
          orderIndex: it.orderIndex,
          answerJson: it.answerJson ? JSON.parse(it.answerJson) : null,
          correct: graded ? it.correct : undefined,
          score: graded ? it.score : undefined,
          resultJson: graded && it.resultJson ? JSON.parse(it.resultJson) : undefined,
          question: {
            ...serializeQuestionForStudent(it.question, !graded),
            ...(graded
              ? {
                  explanation:
                    it.question.explanation?.trim() ||
                    "暂无文字解析，请结合参考答案与课程资料复习。",
                }
              : {}),
          },
          ...(graded
            ? {
                explanation:
                  it.question.explanation?.trim() ||
                  "暂无文字解析，请结合参考答案与课程资料复习。",
                answer: JSON.parse(it.question.answerJson),
              }
            : {}),
          tutorMessages: parseTutorTurns(it.aiHintsJson),
        })),
      },
    };
  });

  app.patch("/practice/sessions/:sessionId/items/:itemId", { preHandler: authRequired() }, async (req, reply) => {
    const { sessionId, itemId } = req.params as { sessionId: string; itemId: string };
    const schema = z.object({
      answer: z.unknown(),
      timeSpentMs: z.number().int().min(0).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const session = await prisma.practiceSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== req.auth!.sub) return reply.code(403).send({ error: "无权作答" });
    if (session.status !== "IN_PROGRESS") return reply.code(400).send({ error: "练习已提交" });

    const item = await prisma.practiceSessionItem.update({
      where: { id: itemId, sessionId },
      data: {
        answerJson: JSON.stringify(body.data.answer),
        timeSpentMs: body.data.timeSpentMs,
      },
    });
    return { item: { id: item.id } };
  });

  app.post("/practice/sessions/:sessionId/submit", { preHandler: authRequired() }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await prisma.practiceSession.findUnique({
      where: { id: sessionId },
      include: { items: { include: { question: true } } },
    });
    if (!session || session.userId !== req.auth!.sub) return reply.code(403).send({ error: "无权提交" });
    if (session.status !== "IN_PROGRESS") return reply.code(400).send({ error: "已提交" });

    let total = 0;
    let removedFromWrongBook = 0;
    for (const item of session.items) {
      const graded = await gradePracticeAnswer(item.question, item.answerJson);
      total += graded.score;
      await prisma.practiceSessionItem.update({
        where: { id: item.id },
        data: {
          correct: graded.correct,
          score: graded.score,
          resultJson: JSON.stringify(graded.detail),
        },
      });

      const timeMs = item.timeSpentMs ?? 0;
      await prisma.practiceQuestion.update({
        where: { id: item.questionId },
        data: {
          attemptCount: { increment: 1 },
          correctCount: { increment: graded.correct ? 1 : 0 },
          totalTimeMs: { increment: timeMs },
        },
      });

      if (graded.correct) {
        const removed = await prisma.wrongBookEntry.deleteMany({
          where: {
            userId: session.userId,
            practiceQuestionId: item.questionId,
            mastered: false,
          },
        });
        removedFromWrongBook += removed.count;
      } else {
        const wbTitle = item.question.stem.slice(0, 80);
        const wbContent = analyzeWrongAnswer(item.question, item.answerJson ?? "");
        const existingWb = await prisma.wrongBookEntry.findFirst({
          where: { userId: session.userId, practiceQuestionId: item.questionId },
        });
        if (existingWb) {
          await prisma.wrongBookEntry.update({
            where: { id: existingWb.id },
            data: { title: wbTitle, content: wbContent, mastered: false },
          });
        } else {
          await prisma.wrongBookEntry.create({
            data: {
              userId: session.userId,
              courseId: session.courseId,
              practiceQuestionId: item.questionId,
              title: wbTitle,
              content: wbContent,
            },
          });
        }
      }
    }

    const updated = await prisma.practiceSession.update({
      where: { id: sessionId },
      data: {
        status: "GRADED",
        score: total,
        submittedAt: new Date(),
        gradedAt: new Date(),
      },
    });
    return {
      session: {
        id: updated.id,
        score: updated.score,
        maxScore: updated.maxScore,
        status: updated.status,
      },
      removedFromWrongBook,
    };
  });

  app.delete("/practice/sessions/:sessionId", { preHandler: authRequired() }, async (req, reply) => {
    const { sessionId } = req.params as { sessionId: string };
    const session = await prisma.practiceSession.findUnique({
      where: { id: sessionId },
      select: { id: true, userId: true, courseId: true },
    });
    if (!session) return reply.code(404).send({ error: "练习记录不存在" });

    if (session.userId !== req.auth!.sub) {
      const gate = await requireCourseView(session.courseId, req.auth!.sub, req.auth!.role);
      if (!gate.ok || !gate.access.isTeacher) {
        return reply.code(403).send({ error: "无权删除该练习记录" });
      }
    }

    await prisma.practiceSession.delete({ where: { id: sessionId } });
    return { ok: true };
  });

  app.post("/practice/sessions/:sessionId/items/:itemId/hint", { preHandler: authRequired() }, async (req, reply) => {
    const { sessionId, itemId } = req.params as { sessionId: string; itemId: string };
    const schema = z.object({ level: z.enum(["initial", "more", "example"]).optional() });
    const body = schema.safeParse(req.body ?? {});

    const item = await prisma.practiceSessionItem.findFirst({
      where: { id: itemId, sessionId },
      include: { question: true, session: true },
    });
    if (!item || item.session.userId !== req.auth!.sub) return reply.code(403).send({ error: "无权" });

    const level = body.success ? (body.data.level ?? "initial") : "initial";
    const quickAction: PracticeTutorQuickAction =
      level === "example" ? "example" : level === "more" ? "more" : "initial";
    const userText = PRACTICE_TUTOR_QUICK_PROMPTS[quickAction];
    const history = parseTutorTurns(item.aiHintsJson);
    const studentAnswer = item.answerJson ? JSON.parse(item.answerJson) : null;

    let result;
    try {
      result = await runPracticeTutorChat({
        question: item.question,
        studentAnswer,
        history,
        userMessage: userText,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI 辅导暂不可用";
      return reply.code(503).send({ error: msg });
    }

    const messages = [
      ...history,
      { role: "user" as const, content: userText },
      { role: "assistant" as const, content: result.reply },
    ];
    await prisma.practiceSessionItem.update({
      where: { id: itemId },
      data: { aiHintCount: { increment: 1 }, aiHintsJson: JSON.stringify(messages) },
    });
    return {
      hint: result.reply,
      hints: messages.filter((m) => m.role === "assistant").map((m) => m.content),
      messages,
      source: result.source,
      model: result.model,
      notice: result.notice,
    };
  });

  await app.register(async (tutorScope) => {
    await tutorScope.register(rateLimit, {
      max: config.aiRouteRateLimitMaxPerMinute,
      timeWindow: "1 minute",
    });

    tutorScope.post(
      "/practice/sessions/:sessionId/items/:itemId/tutor",
      { preHandler: authRequired() },
      async (req, reply) => {
        const { sessionId, itemId } = req.params as { sessionId: string; itemId: string };
        const schema = z
          .object({
            text: z.string().max(4000).optional(),
            quickAction: z.enum(["initial", "more", "example"]).optional(),
            clear: z.boolean().optional(),
          })
          .refine((d) => d.clear === true || Boolean(d.text?.trim()) || Boolean(d.quickAction), {
            message: "请填写消息或选择快捷操作",
          });
        const body = schema.safeParse(req.body ?? {});
        if (!body.success) {
          return reply.code(400).send({ error: body.error.flatten().formErrors.join("；") || "参数无效" });
        }

        const item = await prisma.practiceSessionItem.findFirst({
          where: { id: itemId, sessionId },
          include: { question: true, session: true },
        });
        if (!item || item.session.userId !== req.auth!.sub) {
          return reply.code(403).send({ error: "无权" });
        }
        if (item.session.status !== "IN_PROGRESS") {
          return reply.code(400).send({ error: "练习已提交，无法继续 AI 辅导" });
        }

        if (body.data.clear) {
          await prisma.practiceSessionItem.update({
            where: { id: itemId },
            data: { aiHintsJson: null },
          });
          return { messages: [] as { role: string; content: string }[] };
        }

        const userText = body.data.quickAction
          ? PRACTICE_TUTOR_QUICK_PROMPTS[body.data.quickAction]
          : body.data.text!.trim();
        const history = parseTutorTurns(item.aiHintsJson);
        const studentAnswer = item.answerJson ? JSON.parse(item.answerJson) : null;

        let result;
        try {
          result = await runPracticeTutorChat({
            question: item.question,
            studentAnswer,
            history,
            userMessage: userText,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "AI 辅导暂不可用";
          return reply.code(503).send({ error: msg });
        }

        const messages = [
          ...history,
          { role: "user" as const, content: userText },
          { role: "assistant" as const, content: result.reply },
        ];
        await prisma.practiceSessionItem.update({
          where: { id: itemId },
          data: { aiHintCount: { increment: 1 }, aiHintsJson: JSON.stringify(messages) },
        });

        return {
          reply: result.reply,
          messages,
          source: result.source,
          model: result.model,
          notice: result.notice,
        };
      },
    );
  });

  app.get("/practice/questions/:questionId/similar", { preHandler: authRequired() }, async (req, reply) => {
    const { questionId } = req.params as { questionId: string };
    const q = await prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    if (!q) return reply.code(404).send({ error: "题目不存在" });
    const similar = await findSimilarQuestions(q, 3);
    return { similar };
  });

  app.post("/practice/questions/:questionId/feedback", { preHandler: authRequired() }, async (req, reply) => {
    const { questionId } = req.params as { questionId: string };
    const schema = z.object({
      type: z.enum([
        "STEM_ERROR",
        "ANSWER_ERROR",
        "EXPLANATION_ERROR",
        "TOO_HARD",
        "TOO_EASY",
        "UNCLEAR",
        "SUGGEST_KNOWLEDGE",
      ]),
      description: z.string().min(1).max(5000),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const q = await prisma.practiceQuestion.findUnique({ where: { id: questionId } });
    if (!q) return reply.code(404).send({ error: "题目不存在" });

    const fb = await prisma.practiceQuestionFeedback.create({
      data: {
        questionId,
        courseId: q.courseId,
        userId: req.auth!.sub,
        type: body.data.type,
        description: body.data.description,
      },
    });
    return { feedback: { id: fb.id, status: fb.status } };
  });

  app.get("/courses/:courseId/practice/sessions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    const isTeacher = gate.access.isTeacher;
    const sessions = await prisma.practiceSession.findMany({
      where: isTeacher ? { courseId } : { courseId, userId: req.auth!.sub },
      orderBy: { createdAt: "desc" },
      take: isTeacher ? 100 : 30,
      include: {
        _count: { select: { items: true } },
      },
    });
    const users = isTeacher
      ? await fetchCourseUsers(sessions.map((session) => session.userId), req.id)
      : { users: [] };
    const usersById = new Map(users.users.map((user) => [user.id, user]));

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        mode: s.mode,
        status: s.status,
        score: s.score,
        maxScore: s.maxScore,
        tagFilter: s.tagFilter,
        createdAt: s.createdAt.toISOString(),
        submittedAt: s.submittedAt?.toISOString() ?? null,
        itemCount: s._count.items,
        user: isTeacher
          ? usersById.get(s.userId) ?? null
          : undefined,
      })),
    };
  });

  /** @deprecated 使用 GET /courses/:courseId/practice/sessions */
  app.get("/courses/:courseId/practice/sessions/mine", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok) return reply.code(gate.code).send({ error: gate.error });

    const sessions = await prisma.practiceSession.findMany({
      where: { courseId, userId: req.auth!.sub },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { _count: { select: { items: true } } },
    });
    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        mode: s.mode,
        status: s.status,
        score: s.score,
        maxScore: s.maxScore,
        createdAt: s.createdAt.toISOString(),
        submittedAt: s.submittedAt?.toISOString() ?? null,
        itemCount: s._count.items,
      })),
    };
  });

  app.get("/courses/:courseId/practice/stats", { preHandler: authRequired("TEACHER", "ADMIN") }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const gate = await requireCourseView(courseId, req.auth!.sub, req.auth!.role);
    if (!gate.ok || !gate.access.isTeacher) return reply.code(403).send({ error: "无权" });

    const questions = await prisma.practiceQuestion.findMany({ where: { courseId } });
    const feedbackStats = await prisma.practiceQuestionFeedback.groupBy({
      by: ["type"],
      where: { courseId },
      _count: true,
    });
    return {
      questionCount: questions.length,
      feedbackByType: feedbackStats,
      questions: questions.map((q) => ({
        id: q.id,
        stem: q.stem.slice(0, 60),
        attemptCount: q.attemptCount,
        correctRate: q.attemptCount > 0 ? q.correctCount / q.attemptCount : null,
        feedbackCount: 0,
      })),
    };
  });
};

export default practiceRoutes;
