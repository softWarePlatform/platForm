import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import {
  attachmentExtAllowed,
  HOMEWORK_ATTACHMENT_MAX_BYTES,
} from "../lib/homework-settings.js";
import {
  buildKnowledgeGap,
  explainWrongQuestion,
  type KnowledgeGapPayload,
} from "../lib/homework-knowledge-gap.js";
import {
  computeLateMeta,
  computeStudentStatus,
  isSubmissionFinalized,
  remainingRedoCount,
  STATUS_LABELS,
  statusBadgeClass,
} from "../lib/homework-student.js";
import { UPLOAD_ROOT, saveStudentHomeworkFile } from "../lib/uploads.js";

async function enrolledStudent(userId: string, role: string, courseId: string, teacherId: string) {
  if (role === "ADMIN") return true;
  if (teacherId === userId) return true;
  return !!(await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  }));
}

async function getOrCreateSubmission(homeworkId: string, userId: string) {
  return prisma.homeworkSubmission.upsert({
    where: { homeworkId_userId: { homeworkId, userId } },
    create: { homeworkId, userId, content: "" },
    update: {},
  });
}

async function notifyHomework(userId: string, homeworkId: string, title: string, body: string) {
  await prisma.siteNotification.create({
    data: {
      userId,
      type: "HOMEWORK",
      title,
      body,
      homeworkId,
      linkPath: `/courses`,
    },
  });
}

function serializeStudentView(
  hw: any,
  sub: any,
  pendingRedo: any,
  versions: any[],
  files: any[],
) {
  const status = computeStudentStatus(hw, sub, pendingRedo);
  const late = computeLateMeta(hw);
  const redoLeft = remainingRedoCount(hw, sub);
  const finalized = isSubmissionFinalized(sub);
  return {
    status,
    statusLabel: STATUS_LABELS[status],
    statusClass: statusBadgeClass(status),
    canEdit: !finalized && status !== "REDO_PENDING" && late.canSubmit,
    canSubmit: !finalized && status !== "REDO_PENDING" && late.canSubmit,
    lateHint: late.lateHint,
    returnReason: sub?.returnReason ?? null,
    redoRemaining: redoLeft,
    released: Boolean(sub?.released),
    score: sub?.released ? sub.score : null,
    feedback: sub?.released ? sub.feedback : null,
    draftContent: sub?.draftContent ?? "",
    content: finalized ? (sub?.content ?? "") : "",
    requirementsReadAt: sub?.requirementsReadAt ?? null,
    submittedAt: sub?.submittedAt ?? null,
    locked: Boolean(sub?.locked),
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      submittedAt: v.submittedAt,
      isLate: v.isLate,
      lateDays: v.lateDays,
      score: v.released ? v.score : null,
    })),
    files: files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      sizeBytes: f.sizeBytes,
      versionId: f.versionId,
    })),
    pendingRedo: pendingRedo
      ? { id: pendingRedo.id, reason: pendingRedo.reason, createdAt: pendingRedo.createdAt }
      : null,
    allowRedoRequest:
      hw.allowRedo &&
      sub?.released &&
      sub?.graded &&
      status !== "REDO_PENDING" &&
      (redoLeft === null || redoLeft > 0),
    redoExhausted: hw.allowRedo && redoLeft !== null && redoLeft <= 0,
  };
}

const homeworkStudentRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/homework/:id/my-status",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true, attachments: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (!hw.published && req.auth!.role === "STUDENT") {
        return reply.code(404).send({ error: "作业不存在" });
      }
      const ok = await enrolledStudent(
        req.auth!.sub,
        req.auth!.role,
        hw.courseId,
        hw.course.teacherId,
      );
      if (!ok) return reply.code(403).send({ error: "未选课" });

      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      const pendingRedo = await prisma.homeworkRedoRequest.findFirst({
        where: { homeworkId: id, userId: req.auth!.sub, status: "PENDING" },
        orderBy: { createdAt: "desc" },
      });
      const versions = sub
        ? await prisma.homeworkSubmissionVersion.findMany({
            where: { submissionId: sub.id },
            orderBy: { version: "desc" },
          })
        : [];
      const files = sub
        ? await prisma.homeworkStudentFile.findMany({
            where: { submissionId: sub.id, versionId: null },
            orderBy: { createdAt: "asc" },
          })
        : [];

      return {
        homework: {
          id: hw.id,
          title: hw.title,
          dueAt: hw.dueAt,
          answerMode: hw.answerMode,
          allowMultipleSubmits: hw.allowMultipleSubmits,
          requireAttachment: hw.requireAttachment,
          allowLate: hw.allowLate,
          latePenaltyPercentPerDay: hw.latePenaltyPercentPerDay,
          lateMaxDays: hw.lateMaxDays,
          allowRedo: hw.allowRedo,
          maxRedoCount: hw.maxRedoCount,
          redoReasonRequired: hw.redoReasonRequired,
          requirementsUpdatedAt: hw.requirementsUpdatedAt,
        },
        student: serializeStudentView(hw, sub, pendingRedo, versions, files),
      };
    },
  );

  app.put(
    "/homework/:id/draft",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z.object({ content: z.string().max(100000) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      const ok = await enrolledStudent(
        req.auth!.sub,
        req.auth!.role,
        hw.courseId,
        hw.course.teacherId,
      );
      if (!ok) return reply.code(403).send({ error: "未选课" });

      const existing = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (existing?.locked) {
        return reply.code(400).send({ error: "作业已提交锁定，无法保存草稿" });
      }

      const sub = await prisma.homeworkSubmission.upsert({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
        create: {
          homeworkId: id,
          userId: req.auth!.sub,
          draftContent: body.data.content,
          content: "",
        },
        update: { draftContent: body.data.content },
      });
      return { submission: { id: sub.id, draftContent: sub.draftContent } };
    },
  );


  app.post(
    "/homework/:id/submit-files",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      const ok = await enrolledStudent(
        req.auth!.sub,
        req.auth!.role,
        hw.courseId,
        hw.course.teacherId,
      );
      if (!ok) return reply.code(403).send({ error: "未选课" });

      const sub = await getOrCreateSubmission(id, req.auth!.sub);
      if (sub.locked) return reply.code(400).send({ error: "作业已锁定" });

      const count = await prisma.homeworkStudentFile.count({
        where: { submissionId: sub.id, versionId: null },
      });
      if (count >= 10) return reply.code(400).send({ error: "最多 10 个附件" });

      const parts = (req as any).parts();
      let fileBuf: Buffer | null = null;
      let origName = "file.bin";
      let mime = "application/octet-stream";
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          origName = part.filename;
          mime = part.mimetype;
          fileBuf = await part.toBuffer();
        }
      }
      if (!fileBuf) return reply.code(400).send({ error: "请上传 file 字段" });
      if (!attachmentExtAllowed(origName)) {
        return reply.code(400).send({ error: "仅支持 .pdf/.doc/.docx/.zip/.rar" });
      }
      if (fileBuf.length > HOMEWORK_ATTACHMENT_MAX_BYTES) {
        return reply.code(400).send({ error: "文件不能超过 20MB" });
      }

      const { storedPath, fileName } = await saveStudentHomeworkFile(sub.id, origName, fileBuf);
      const row = await prisma.homeworkStudentFile.create({
        data: {
          submissionId: sub.id,
          fileName,
          storedPath,
          mimeType: mime,
          sizeBytes: fileBuf.length,
        },
      });
      return { file: row };
    },
  );

  app.delete(
    "/homework/:id/submit-files/:fid",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id, fid } = req.params as { id: string; fid: string };
      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (!sub) return reply.code(404).send({ error: "尚未开始作答" });
      if (sub.locked) return reply.code(400).send({ error: "已锁定无法删除附件" });
      const row = await prisma.homeworkStudentFile.findFirst({
        where: { id: fid, submissionId: sub.id, versionId: null },
      });
      if (row) {
        try {
          await unlink(join(UPLOAD_ROOT, row.storedPath));
        } catch {
          /* ignore */
        }
        await prisma.homeworkStudentFile.delete({ where: { id: fid } });
      }
      return { ok: true };
    },
  );

  app.get(
    "/homework/:id/submit-files/:fid/download",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { id, fid } = req.params as { id: string; fid: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });

      const row = await prisma.homeworkStudentFile.findFirst({
        where: { id: fid },
        include: { submission: true },
      });
      if (!row || row.submission.homeworkId !== id) {
        return reply.code(404).send({ error: "文件不存在" });
      }
      const isOwner = row.submission.userId === req.auth!.sub;
      const isTeacher =
        req.auth!.role === "ADMIN" || hw.course.teacherId === req.auth!.sub;
      if (!isOwner && !isTeacher) return reply.code(403).send({ error: "无权下载" });

      const abs = join(UPLOAD_ROOT, row.storedPath);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "文件已丢失" });
      }
      return reply
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        )
        .send(createReadStream(abs));
    },
  );

  app.post(
    "/homework/:id/redo-request",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z.object({ reason: z.string().max(2000).optional() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (!hw.allowRedo) return reply.code(400).send({ error: "本作业不允许重做" });

      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (!sub?.released || !sub.graded) {
        return reply.code(400).send({ error: "成绩发布后方可申请重做" });
      }
      const left = remainingRedoCount(hw, sub);
      if (left !== null && left <= 0) {
        return reply.code(400).send({ error: "已达最大重做次数" });
      }
      if (hw.redoReasonRequired && !(body.data.reason ?? "").trim()) {
        return reply.code(400).send({ error: "请填写重做申请理由" });
      }

      const pending = await prisma.homeworkRedoRequest.findFirst({
        where: { homeworkId: id, userId: req.auth!.sub, status: "PENDING" },
      });
      if (pending) return reply.code(400).send({ error: "已有待审批的重做申请" });

      const row = await prisma.homeworkRedoRequest.create({
        data: {
          homeworkId: id,
          userId: req.auth!.sub,
          reason: body.data.reason?.trim() || null,
        },
      });
      return { request: row };
    },
  );

  app.get(
    "/homework/:id/redo-requests",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: { select: { id: true, teacherId: true } } },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (req.auth!.role !== "ADMIN" && hw.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权查看" });
      }

      const requests = await prisma.homeworkRedoRequest.findMany({
        where: { homeworkId: id },
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      });
      return { requests };
    },
  );

  app.patch(
    "/homework/redo-requests/:rid",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { rid } = req.params as { rid: string };
      const body = z
        .object({
          action: z.enum(["approve", "reject"]),
          rejectReason: z.string().max(500).optional(),
        })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const row = await prisma.homeworkRedoRequest.findUnique({
        where: { id: rid },
        include: { homework: { include: { course: true } } },
      });
      if (!row) return reply.code(404).send({ error: "申请不存在" });
      if (row.status !== "PENDING") return reply.code(400).send({ error: "已处理" });
      if (req.auth!.role !== "ADMIN" && row.homework.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权审批" });
      }

      if (body.data.action === "reject") {
        const updated = await prisma.homeworkRedoRequest.update({
          where: { id: rid },
          data: {
            status: "REJECTED",
            rejectReason: body.data.rejectReason?.trim() || null,
            reviewedById: req.auth!.sub,
            reviewedAt: new Date(),
          },
        });
        await notifyHomework(
          row.userId,
          row.homeworkId,
          "重做申请未通过",
          body.data.rejectReason ?? "教师未通过您的重做申请",
        );
        return { request: updated };
      }

      await prisma.homeworkRedoRequest.update({
        where: { id: rid },
        data: {
          status: "APPROVED",
          reviewedById: req.auth!.sub,
          reviewedAt: new Date(),
        },
      });

      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: row.homeworkId, userId: row.userId } },
      });
      if (sub) {
        await prisma.homeworkSubmission.update({
          where: { id: sub.id },
          data: {
            locked: false,
            returnReason: null,
            submittedAt: null,
            draftContent: sub.content || sub.draftContent,
            content: "",
            graded: false,
            released: false,
            score: null,
            feedback: null,
            releasedAt: null,
            redoUsedCount: { increment: 1 },
          },
        });
      }

      await notifyHomework(row.userId, row.homeworkId, "重做申请已通过", "您可以重新提交作业");
      return { ok: true };
    },
  );

  app.get(
    "/homework/:id/knowledge-gap",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({ where: { id } });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });

      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (!sub?.released || !sub.graded) {
        return reply.code(400).send({ error: "成绩发布后可查看知识漏洞分析" });
      }

      const cached = await prisma.homeworkKnowledgeAnalysis.findUnique({
        where: { submissionId: sub.id },
      });
      if (cached) {
        return { analysis: JSON.parse(cached.payloadJson) as KnowledgeGapPayload, cached: true };
      }

      const analysis = await buildKnowledgeGap(hw, sub);
      await prisma.homeworkKnowledgeAnalysis.create({
        data: { submissionId: sub.id, payloadJson: JSON.stringify(analysis) },
      });
      return { analysis, cached: false };
    },
  );

  app.post(
    "/homework/:id/knowledge-gap/ask",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z.object({ question: z.string().min(1).max(1000) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "请填写问题" });

      const hw = await prisma.homework.findUnique({ where: { id } });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (!sub) return reply.code(400).send({ error: "尚未提交作业" });

      const answer = await explainWrongQuestion({
        homeworkTitle: hw.title,
        question: body.data.question,
        submissionContent: sub.content,
        feedback: sub.feedback,
      });
      return { answer };
    },
  );

  app.post(
    "/homework/:id/wrong-book",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({ where: { id }, include: { course: true } });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });

      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (!sub?.released) return reply.code(400).send({ error: "成绩发布后可生成错题本" });

      let analysis: KnowledgeGapPayload;
      const cached = await prisma.homeworkKnowledgeAnalysis.findUnique({
        where: { submissionId: sub.id },
      });
      if (cached) analysis = JSON.parse(cached.payloadJson);
      else {
        analysis = await buildKnowledgeGap(hw, sub);
        await prisma.homeworkKnowledgeAnalysis.upsert({
          where: { submissionId: sub.id },
          create: { submissionId: sub.id, payloadJson: JSON.stringify(analysis) },
          update: { payloadJson: JSON.stringify(analysis) },
        });
      }

      const weak = analysis.points.filter((p) => p.level === "weak");
      const created = [];
      for (const p of weak) {
        const row = await prisma.wrongBookEntry.create({
          data: {
            userId: req.auth!.sub,
            courseId: hw.courseId,
            homeworkId: id,
            title: `${hw.title} · ${p.name}`,
            content: p.evidence ?? analysis.summary ?? "",
          },
        });
        created.push(row);
      }
      return { entries: created, count: created.length };
    },
  );

  app.get("/wrong-book/mine", { preHandler: authRequired() }, async (req) => {
    const rows = await prisma.wrongBookEntry.findMany({
      where: { userId: req.auth!.sub, mastered: false },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return { entries: rows };
  });

  app.patch("/wrong-book/:id/mastered", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await prisma.wrongBookEntry.findFirst({
      where: { id, userId: req.auth!.sub },
    });
    if (!row) return reply.code(404).send({ error: "记录不存在" });
    const updated = await prisma.wrongBookEntry.update({
      where: { id },
      data: { mastered: true },
    });
    return { entry: updated };
  });
};

export default homeworkStudentRoutes;
