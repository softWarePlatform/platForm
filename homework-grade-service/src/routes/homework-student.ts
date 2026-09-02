import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/auth.js";
import { resolveCourseAccess, sendAccessDenial, teacherAccessDenial, viewAccessDenial } from "../lib/course-client.js";
import { sendError } from "../lib/http-error.js";
import { putWrongBookEntry } from "../lib/lab-client.js";
import {
  computeLateMeta,
  computeStudentStatus,
  remainingRedoCount,
  STATUS_LABELS,
  statusBadgeClass,
} from "../lib/homework-student.js";

async function getOrCreateSubmission(homeworkId: string, userId: string) {
  return prisma.homeworkSubmission.upsert({
    where: { homeworkId_userId: { homeworkId, userId } },
    create: { homeworkId, userId, content: "" },
    update: {},
  });
}

const homeworkStudentRoutes: FastifyPluginAsync = async (app) => {
  app.get("/homework/:id/my-status", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.published) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access))) return;
    const sub = await prisma.homeworkSubmission.findUnique({ where: { homeworkId_userId: { homeworkId: hw.id, userId: request.auth!.sub } } });
    const pendingRedo = await prisma.homeworkRedoRequest.findFirst({ where: { homeworkId: hw.id, userId: request.auth!.sub, status: "PENDING" } });
    const status = computeStudentStatus(hw, sub, pendingRedo);
    const late = computeLateMeta(hw);
    return {
      homeworkId: hw.id,
      status,
      statusLabel: STATUS_LABELS[status],
      statusClass: statusBadgeClass(status),
      lateHint: late.lateHint,
      redoRemaining: remainingRedoCount(hw, sub),
      submission: sub
        ? {
            id: sub.id,
            content: sub.content,
            draftContent: sub.draftContent,
            score: sub.released ? sub.score : null,
            feedback: sub.released ? sub.feedback : null,
            graded: sub.graded,
            released: sub.released,
            locked: sub.locked,
            submittedAt: sub.submittedAt,
          }
        : null,
    };
  });

  app.put("/homework/:id/draft", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ content: z.string().max(50000) }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.published) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access, "无权操作"))) return;
    const late = computeLateMeta(hw);
    if (!late.canSubmit) return sendError(reply, request, 400, "LATE_SUBMISSION", late.lateHint ?? "已过截止时间");
    const sub = await getOrCreateSubmission(hw.id, request.auth!.sub);
    if (sub.locked && !sub.returnReason) return sendError(reply, request, 409, "VERSION_CONFLICT", "提交已锁定");
    const updated = await prisma.homeworkSubmission.update({
      where: { id: sub.id },
      data: { draftContent: body.data.content, content: body.data.content },
    });
    return { submission: updated };
  });

  app.post("/homework/:id/redo-request", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ reason: z.string().max(2000).optional() }).safeParse(request.body ?? {});
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.allowRedo) return sendError(reply, request, 400, "INVALID_BODY", "该作业不允许重做");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access, "无权操作"))) return;
    if (hw.redoReasonRequired && !body.data.reason?.trim()) return sendError(reply, request, 400, "INVALID_BODY", "请填写重做原因");
    const existing = await prisma.homeworkRedoRequest.findFirst({ where: { homeworkId: hw.id, userId: request.auth!.sub, status: "PENDING" } });
    if (existing) return sendError(reply, request, 409, "VERSION_CONFLICT", "已有待审批的重做申请");
    const row = await prisma.homeworkRedoRequest.create({
      data: { homeworkId: hw.id, userId: request.auth!.sub, reason: body.data.reason },
    });
    return reply.code(201).send({ redoRequest: row });
  });

  app.get("/homework/:id/redo-requests", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const items = await prisma.homeworkRedoRequest.findMany({ where: { homeworkId: hw.id }, orderBy: { createdAt: "desc" } });
    return { redoRequests: items };
  });

  app.patch("/homework/redo-requests/:rid", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ rid: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ status: z.enum(["APPROVED", "REJECTED"]), rejectReason: z.string().max(2000).optional() }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    const row = await prisma.homeworkRedoRequest.findUnique({ where: { id: params.data.rid } });
    if (!row) return sendError(reply, request, 404, "NOT_FOUND", "申请不存在");
    const hw = await prisma.homework.findUnique({ where: { id: row.homeworkId } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.homeworkRedoRequest.update({
        where: { id: row.id },
        data: {
          status: body.data.status,
          rejectReason: body.data.rejectReason,
          reviewedById: request.auth!.sub,
          reviewedAt: new Date(),
        },
      });
      if (body.data.status === "APPROVED") {
        await tx.homeworkSubmission.updateMany({
          where: { homeworkId: hw.id, userId: row.userId },
          data: { locked: false, graded: false, released: false, returnReason: null, redoUsedCount: { increment: 1 } },
        });
      }
      return next;
    });
    return { redoRequest: updated };
  });

  app.post("/homework/:id/wrong-book", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return sendError(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    const access = await resolveCourseAccess(request.auth!.sub, hw.courseId);
    if (sendAccessDenial(reply, request, viewAccessDenial(access, "无权操作"))) return;
    const sub = await prisma.homeworkSubmission.findUnique({
      where: { homeworkId_userId: { homeworkId: hw.id, userId: request.auth!.sub } },
    });
    if (!sub?.released) return sendError(reply, request, 400, "INVALID_BODY", "成绩发布后可生成错题本");
    const points = await loadWeakPoints(hw.title, sub.id, sub.score, sub.feedback);
    const written = [];
    const errors = [];
    for (const point of points) {
      const result = await putWrongBookEntry(
        {
          userId: request.auth!.sub,
          courseId: hw.courseId,
          sourceType: "HOMEWORK",
          sourceId: hw.id,
          title: `${hw.title} · ${point.name}`,
          content: point.evidence,
        },
        `homework:${hw.id}:${request.auth!.sub}:${point.name}`,
      );
      if (result.ok) written.push(point.name);
      else {
        errors.push({ name: point.name, status: result.status });
        request.log.warn({ homeworkId: hw.id, point: point.name, status: result.status }, "lab wrong-book put skipped");
      }
    }
    return {
      count: written.length,
      written,
      errors,
      labStatus: errors.length && !written.length ? "UNAVAILABLE" : "OK",
    };
  });

  app.get("/wrong-book/mine", { preHandler: authRequired() }, async (request, reply) => {
    return sendError(reply, request, 404, "NOT_FOUND", "错题本请经网关访问 /api/wrong-book");
  });
};

async function loadWeakPoints(
  homeworkTitle: string,
  submissionId: string,
  score: number | null,
  feedback: string | null,
) {
  const cached = await prisma.homeworkKnowledgeAnalysis.findUnique({ where: { submissionId } });
  if (cached) {
    try {
      const payload = JSON.parse(cached.payloadJson) as { points?: Array<{ name?: string; level?: string; evidence?: string }> };
      const weak = (payload.points ?? [])
        .filter((point) => point.level === "weak" && point.name)
        .map((point) => ({ name: String(point.name), evidence: point.evidence ?? payload.points?.[0]?.evidence ?? "" }));
      if (weak.length) return weak;
    } catch {
      /* fall through to score heuristic */
    }
  }
  if (score != null && score >= 70) return [];
  return [{ name: homeworkTitle, evidence: feedback?.slice(0, 200) || "根据本次作业得分生成" }];
}

export default homeworkStudentRoutes;
