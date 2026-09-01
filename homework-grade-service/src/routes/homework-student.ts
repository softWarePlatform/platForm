import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/auth.js";
import { resolveCourseAccess } from "../lib/course-client.js";
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
    if (!params.success) return reply.code(400).send({ error: "作业 ID 无效" });
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.published) return reply.code(404).send({ error: "作业不存在" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, hw.courseId, request.authorizationHeader);
    if (!access.canView) return reply.code(403).send({ error: "无权查看" });
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
    if (!params.success || !body.success) return reply.code(400).send({ error: "参数无效" });
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.published) return reply.code(404).send({ error: "作业不存在" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, hw.courseId, request.authorizationHeader);
    if (!access.canView) return reply.code(403).send({ error: "无权操作" });
    const late = computeLateMeta(hw);
    if (!late.canSubmit) return reply.code(400).send({ error: late.lateHint ?? "已过截止时间" });
    const sub = await getOrCreateSubmission(hw.id, request.auth!.sub);
    if (sub.locked && !sub.returnReason) return reply.code(409).send({ error: "提交已锁定" });
    const updated = await prisma.homeworkSubmission.update({
      where: { id: sub.id },
      data: { draftContent: body.data.content, content: body.data.content },
    });
    return { submission: updated };
  });

  app.post("/homework/:id/redo-request", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ reason: z.string().max(2000).optional() }).safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "参数无效" });
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw || !hw.allowRedo) return reply.code(400).send({ error: "该作业不允许重做" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, hw.courseId, request.authorizationHeader);
    if (!access.canView) return reply.code(403).send({ error: "无权操作" });
    if (hw.redoReasonRequired && !body.data.reason?.trim()) return reply.code(400).send({ error: "请填写重做原因" });
    const existing = await prisma.homeworkRedoRequest.findFirst({ where: { homeworkId: hw.id, userId: request.auth!.sub, status: "PENDING" } });
    if (existing) return reply.code(409).send({ error: "已有待审批的重做申请" });
    const row = await prisma.homeworkRedoRequest.create({
      data: { homeworkId: hw.id, userId: request.auth!.sub, reason: body.data.reason },
    });
    return reply.code(201).send({ redoRequest: row });
  });

  app.get("/homework/:id/redo-requests", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "作业 ID 无效" });
    const hw = await prisma.homework.findUnique({ where: { id: params.data.id } });
    if (!hw) return reply.code(404).send({ error: "作业不存在" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, hw.courseId, request.authorizationHeader);
    if (!access.isTeacher) return reply.code(403).send({ error: "无权操作" });
    const items = await prisma.homeworkRedoRequest.findMany({ where: { homeworkId: hw.id }, orderBy: { createdAt: "desc" } });
    return { redoRequests: items };
  });

  app.patch("/homework/redo-requests/:rid", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ rid: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ status: z.enum(["APPROVED", "REJECTED"]), rejectReason: z.string().max(2000).optional() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "参数无效" });
    const row = await prisma.homeworkRedoRequest.findUnique({ where: { id: params.data.rid } });
    if (!row) return reply.code(404).send({ error: "申请不存在" });
    const hw = await prisma.homework.findUnique({ where: { id: row.homeworkId } });
    if (!hw) return reply.code(404).send({ error: "作业不存在" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, hw.courseId, request.authorizationHeader);
    if (!access.isTeacher) return reply.code(403).send({ error: "无权操作" });
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

  app.post("/homework/:id/wrong-book", { preHandler: authRequired() }, async (_request, reply) => {
    return reply.code(501).send({ error: "错题本已归属 lab-practice-service，请经网关转发 /wrong-book" });
  });

  app.get("/wrong-book/mine", { preHandler: authRequired() }, async (_request, reply) => {
    return reply.code(501).send({ error: "错题本已归属 lab-practice-service，请经网关转发 /wrong-book" });
  });
};

export default homeworkStudentRoutes;
