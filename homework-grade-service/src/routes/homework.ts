import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/auth.js";
import { notifyUsers, resolveCourseAccess, sendAccessDenial, teacherAccessDenial, viewAccessDenial } from "../lib/course-client.js";
import { deleteWrongBookEntries } from "../lib/lab-client.js";
import { sendError } from "../lib/http-error.js";
import {
  homeworkCreateSchema,
  homeworkPatchSchema,
  normalizeHomeworkSettingsInput,
  revisionSummary,
} from "../lib/homework-settings.js";
import { computeLateMeta } from "../lib/homework-student.js";

function serializeHomework(hw: {
  rubricJson: string | null;
  descriptionMd: string | null;
  description: string | null;
} & Record<string, unknown>) {
  let rubric: { name: string; maxScore: number }[] = [];
  if (hw.rubricJson) {
    try {
      rubric = JSON.parse(hw.rubricJson) as { name: string; maxScore: number }[];
    } catch {
      rubric = [];
    }
  }
  return { ...hw, rubric, description: hw.descriptionMd ?? hw.description };
}

function applyLatePenalty(rawScore: number, lateDays: number, percentPerDay: number | null) {
  const pct = percentPerDay ?? 0;
  return Math.max(0, rawScore * (1 - (pct * lateDays) / 100));
}

const homeworkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/homework/teaching", { preHandler: authRequired("TEACHER", "ADMIN") }, async () => {
    const items = await prisma.homework.findMany({ orderBy: { title: "asc" } });
    return { homeworks: items.map(serializeHomework) };
  });

  app.get("/homework/mine", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request) => {
    const uid = request.auth!.sub;
    const published = await prisma.homework.findMany({ where: { published: true }, orderBy: { dueAt: "asc" } });
    const visible = [];
    for (const hw of published) {
      const access = await resolveCourseAccess(uid, hw.courseId);
      if (access.canView) visible.push(serializeHomework(hw));
    }
    return { homeworks: visible };
  });

  app.post("/courses/:courseId/homework", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    const body = homeworkCreateSchema.safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const access = await resolveCourseAccess(request.auth!.sub, params.data.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const settings = normalizeHomeworkSettingsInput(body.data);
    const hw = await prisma.homework.create({
      data: {
        courseId: params.data.courseId,
        title: body.data.title,
        description: settings.description,
        descriptionMd: settings.descriptionMd,
        dueAt: body.data.dueAt ?? undefined,
        targetClassId: body.data.targetClassId ?? undefined,
        published: body.data.published ?? false,
        publishedAt: body.data.published ? new Date() : undefined,
        allowLate: settings.allowLate,
        latePenaltyPercentPerDay: settings.latePenaltyPercentPerDay,
        lateMaxDays: settings.lateMaxDays,
        allowRedo: settings.allowRedo,
        maxRedoCount: settings.maxRedoCount,
        submissionType: settings.submissionType,
        maxGroupSize: settings.maxGroupSize,
        answerMode: settings.answerMode,
        allowMultipleSubmits: settings.allowMultipleSubmits,
        requireAttachment: settings.requireAttachment,
        redoReasonRequired: settings.redoReasonRequired,
        redoGradePolicy: settings.redoGradePolicy,
        rubricJson: settings.rubricJson,
      },
    });
    return reply.code(201).send({ homework: serializeHomework(hw) });
  });

  app.get("/courses/:courseId/homework", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "课程 ID 无效");
    const access = await resolveCourseAccess(request.auth!.sub, params.data.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access, "无权查看该课程作业"))) return;
    const where = access.isTeacher ? { courseId: params.data.courseId } : { courseId: params.data.courseId, published: true };
    const items = await prisma.homework.findMany({ where, orderBy: { title: "asc" } });
    return { homeworks: items.map(serializeHomework) };
  });

  app.get("/homework/:id", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id }, include: { attachments: { orderBy: { createdAt: "asc" } } } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access))) return;
    if (!access.isTeacher && !hw.published) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    return { homework: serializeHomework(hw) };
  });

  app.patch("/homework/:id", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = homeworkPatchSchema.safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const settings = normalizeHomeworkSettingsInput(body.data);
    const updated = await prisma.homework.update({
      where: { id: hw.id },
      data: {
        title: body.data.title ?? undefined,
        dueAt: body.data.dueAt === undefined ? undefined : body.data.dueAt,
        targetClassId: body.data.targetClassId === undefined ? undefined : body.data.targetClassId,
        description: settings.description,
        descriptionMd: settings.descriptionMd,
        allowLate: settings.allowLate,
        latePenaltyPercentPerDay: settings.latePenaltyPercentPerDay,
        lateMaxDays: settings.lateMaxDays,
        allowRedo: settings.allowRedo,
        maxRedoCount: settings.maxRedoCount,
        submissionType: settings.submissionType,
        maxGroupSize: settings.maxGroupSize,
        answerMode: settings.answerMode,
        allowMultipleSubmits: settings.allowMultipleSubmits,
        requireAttachment: settings.requireAttachment,
        redoReasonRequired: settings.redoReasonRequired,
        redoGradePolicy: settings.redoGradePolicy,
        rubricJson: settings.rubricJson,
        requirementsUpdatedAt: new Date(),
      },
    });
    await prisma.homeworkRevision.create({
      data: {
        homeworkId: hw.id,
        userId: request.auth!.sub,
        summary: revisionSummary(hw as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>),
        snapshotJson: JSON.stringify(updated),
      },
    });
    return { homework: serializeHomework(updated) };
  });

  app.patch("/homework/:id/publish", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ published: z.boolean().optional() }).safeParse(request.body ?? {});
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const published = body.success ? (body.data.published ?? !hw.published) : !hw.published;
    const updated = await prisma.homework.update({
      where: { id: hw.id },
      data: { published, publishedAt: published ? hw.publishedAt ?? new Date() : hw.publishedAt },
    });
    return { homework: serializeHomework(updated) };
  });

  app.delete("/homework/:id", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    await prisma.homework.delete({ where: { id: hw.id } });
    void deleteWrongBookEntries("HOMEWORK", hw.id).then((result) => {
      if (!result.ok) console.warn("lab wrong-book delete skipped", result.status, hw.id);
    });
    return { ok: true };
  });

  app.post("/homework/:id/submit", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ content: z.string().max(50000) }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.published) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access, "无权提交"))) return;
    if (access.isTeacher && request.auth!.role !== "ADMIN") return sendError(reply, request, 403, "FORBIDDEN", "仅学生可提交");
    const late = computeLateMeta(hw);
    if (!late.canSubmit) return sendError(reply, request, 400, "LATE_SUBMISSION", late.lateHint ?? "已过截止时间");
    const sub = await prisma.$transaction(async (tx) => {
      const current = await tx.homeworkSubmission.upsert({
        where: { homeworkId_userId: { homeworkId: hw.id, userId: request.auth!.sub } },
        create: { homeworkId: hw.id, userId: request.auth!.sub, content: body.data.content },
        update: {},
      });
      if (current.locked && !hw.allowMultipleSubmits && !current.returnReason) {
        throw Object.assign(new Error("提交已锁定"), { statusCode: 409 });
      }
      const version = (await tx.homeworkSubmissionVersion.count({ where: { submissionId: current.id } })) + 1;
      await tx.homeworkSubmissionVersion.create({
        data: {
          submissionId: current.id,
          version,
          content: body.data.content,
          isLate: late.isLate,
          lateDays: late.lateDays || null,
        },
      });
      return tx.homeworkSubmission.update({
        where: { id: current.id },
        data: {
          content: body.data.content,
          draftContent: null,
          locked: true,
          submittedAt: new Date(),
          isLate: late.isLate,
          lateDays: late.lateDays || null,
          returnReason: null,
        },
      });
    });
    return { submission: sub };
  });

  app.get("/homework/:id/submissions", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const submissions = await prisma.homeworkSubmission.findMany({ where: { homeworkId: hw.id }, orderBy: { updatedAt: "desc" } });
    return { submissions, rosterStatus: access.rosterStatus };
  });

  app.patch("/homework/submissions/:sid/grade", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ sid: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ score: z.number().min(0).max(100), feedback: z.string().max(5000).optional() }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const sub = await prisma.homeworkSubmission.findUnique({ where: { id: params.data.sid } });
    if (!sub) return sendError(reply, request, 404, "NOT_FOUND", "提交不存在");
    const hw = await prisma.homework.findUnique({ where: { id: sub.homeworkId } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const lateDays = sub.lateDays ?? 0;
    const score = applyLatePenalty(body.data.score, lateDays, hw.latePenaltyPercentPerDay);
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.homeworkSubmission.update({
        where: { id: sub.id },
        data: { score, feedback: body.data.feedback, graded: true },
      });
      const latest = await tx.homeworkSubmissionVersion.findFirst({ where: { submissionId: sub.id }, orderBy: { version: "desc" } });
      if (latest) {
        await tx.homeworkSubmissionVersion.update({ where: { id: latest.id }, data: { score, feedback: body.data.feedback, graded: true } });
      }
      return next;
    });
    return { submission: updated };
  });

  app.patch("/homework/:id/release-grades", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const result = await prisma.homeworkSubmission.updateMany({
      where: { homeworkId: hw.id, graded: true, released: false },
      data: { released: true, releasedAt: new Date() },
    });
    const graded = await prisma.homeworkSubmission.findMany({ where: { homeworkId: hw.id, graded: true }, select: { userId: true } });
    void notifyUsers({
      userIds: graded.map((row) => row.userId),
      title: "作业成绩已发布",
      body: `《${hw.title}》成绩已发布`,
      homeworkId: hw.id,
      requestId: request.id,
    });
    return { ok: true, released: result.count };
  });

  app.get("/homework/:id/questions", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access))) return;
    const questions = await prisma.homeworkQuestion.findMany({ where: { homeworkId: hw.id }, orderBy: { createdAt: "asc" } });
    return { questions };
  });

  app.post("/homework/:id/questions", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ question: z.string().min(1).max(5000) }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access, "无权操作"))) return;
    const question = await prisma.homeworkQuestion.create({ data: { homeworkId: hw.id, userId: request.auth!.sub, question: body.data.question } });
    return reply.code(201).send({ question });
  });

  app.patch("/homework/questions/:qid/answer", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ qid: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ answer: z.string().min(1).max(5000) }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const question = await prisma.homeworkQuestion.findUnique({ where: { id: params.data.qid } });
    if (!question) return sendError(reply, request, 404, "NOT_FOUND", "问题不存在");
    const hw = await prisma.homework.findUnique({ where: { id: question.homeworkId } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const updated = await prisma.homeworkQuestion.update({
      where: { id: question.id },
      data: { answer: body.data.answer, answeredById: request.auth!.sub, answeredAt: new Date() },
    });
    return { question: updated };
  });
};

export default homeworkRoutes;
