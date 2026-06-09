import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { teachingHomeworkOverviewForTeacher } from "../lib/teaching-homework-overview.js";
import { suggestHomeworkGrading } from "../lib/ai-homework-suggest.js";
import { resolveHomeworkAi } from "../lib/homework-ai-config.js";
import {
  attachmentExtAllowed,
  HOMEWORK_ATTACHMENT_MAX_BYTES,
  HOMEWORK_ATTACHMENT_MAX_COUNT,
  homeworkCreateSchema,
  homeworkPatchSchema,
  normalizeHomeworkSettingsInput,
  revisionSummary,
} from "../lib/homework-settings.js";
import { UPLOAD_ROOT, saveHomeworkFile } from "../lib/uploads.js";
import {
  computeLateMeta,
  computeStudentStatus,
  isSubmissionFinalized,
  remainingRedoCount,
  STATUS_LABELS,
} from "../lib/homework-student.js";

const homeworkDetailInclude = {
  targetClass: { select: { id: true, name: true } },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true },
  },
};

function serializeHomework(hw: any) {
  let rubric: { name: string; maxScore: number }[] = [];
  if (hw.rubricJson) {
    try {
      rubric = JSON.parse(hw.rubricJson) as { name: string; maxScore: number }[];
    } catch {
      rubric = [];
    }
  }
  return {
    ...hw,
    rubric,
    description: hw.descriptionMd ?? hw.description,
  };
}

async function assertHomeworkTeacher(
  homeworkId: string,
  userId: string,
  role: string,
) {
  const hw = await prisma.homework.findUnique({
    where: { id: homeworkId },
    include: { course: true },
  });
  if (!hw) return { ok: false as const, code: 404 as const, error: "作业不存在" };
  if (role !== "ADMIN" && hw.course.teacherId !== userId) {
    return { ok: false as const, code: 403 as const, error: "无权操作" };
  }
  return { ok: true as const, hw };
}

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

      const body = homeworkCreateSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      if (body.data.targetClassId) {
        const cls = await prisma.class.findFirst({
          where: { id: body.data.targetClassId, courseId },
        });
        if (!cls) return reply.code(400).send({ error: "指定班级不属于本课程" });
      }

      const settings = normalizeHomeworkSettingsInput(body.data);
      const hw = await prisma.homework.create({
        data: {
          courseId,
          title: body.data.title.trim(),
          dueAt: body.data.dueAt ?? undefined,
          targetClassId: body.data.targetClassId ?? undefined,
          published: body.data.published ?? false,
          publishedAt: body.data.published ? new Date() : null,
          ...settings,
        },
        include: homeworkDetailInclude,
      });
      return { homework: serializeHomework(hw) };
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
        include: homeworkDetailInclude,
      });

      if (req.auth!.role === "STUDENT") {
        const ids = list.map((h) => h.id);
        const subs = await prisma.homeworkSubmission.findMany({
          where: { homeworkId: { in: ids }, userId: req.auth!.sub },
        });
        const redos = await prisma.homeworkRedoRequest.findMany({
          where: { homeworkId: { in: ids }, userId: req.auth!.sub, status: "PENDING" },
        });
        const subMap = new Map(subs.map((s) => [s.homeworkId, s]));
        const redoMap = new Map(redos.map((r) => [r.homeworkId, r]));
        return {
          homework: list.map((hw) => {
            const sub = subMap.get(hw.id) ?? null;
            const pendingRedo = redoMap.get(hw.id) ?? null;
            const status = computeStudentStatus(hw, sub, pendingRedo);
            return {
              ...serializeHomework(hw),
              myStatus: status,
              myStatusLabel: STATUS_LABELS[status],
              myScore: sub?.released ? sub.score : null,
              returnReason: sub?.returnReason ?? null,
              redoRemaining: remainingRedoCount(hw, sub),
            };
          }),
        };
      }

      return { homework: list.map(serializeHomework) };
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

      const body = homeworkPatchSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      if (body.data.targetClassId) {
        const cls = await prisma.class.findFirst({
          where: { id: body.data.targetClassId, courseId: hw.courseId },
        });
        if (!cls) return reply.code(400).send({ error: "指定班级不属于本课程" });
      }

      const settings = normalizeHomeworkSettingsInput({
        descriptionMd: body.data.descriptionMd ?? body.data.description ?? hw.descriptionMd,
        allowLate: body.data.allowLate ?? hw.allowLate,
        latePenaltyPercentPerDay:
          body.data.latePenaltyPercentPerDay ?? hw.latePenaltyPercentPerDay,
        lateMaxDays: body.data.lateMaxDays ?? hw.lateMaxDays,
        allowRedo: body.data.allowRedo ?? hw.allowRedo,
        maxRedoCount: body.data.maxRedoCount ?? hw.maxRedoCount,
        submissionType: body.data.submissionType ?? hw.submissionType,
        maxGroupSize: body.data.maxGroupSize ?? hw.maxGroupSize,
        rubricJson: body.data.rubricJson,
        answerMode: body.data.answerMode ?? hw.answerMode,
        allowMultipleSubmits: body.data.allowMultipleSubmits ?? hw.allowMultipleSubmits,
        requireAttachment: body.data.requireAttachment ?? hw.requireAttachment,
        redoReasonRequired: body.data.redoReasonRequired ?? hw.redoReasonRequired,
        redoGradePolicy: body.data.redoGradePolicy ?? hw.redoGradePolicy,
      });

      const patchData: Record<string, unknown> = { ...settings };
      if (body.data.title != null) patchData.title = body.data.title.trim();
      if (body.data.dueAt !== undefined) patchData.dueAt = body.data.dueAt;
      if (body.data.targetClassId !== undefined) patchData.targetClassId = body.data.targetClassId;

      const contentKeys = [
        "descriptionMd",
        "dueAt",
        "allowLate",
        "latePenaltyPercentPerDay",
        "lateMaxDays",
        "allowRedo",
        "maxRedoCount",
        "submissionType",
        "maxGroupSize",
        "rubricJson",
        "targetClassId",
        "answerMode",
        "allowMultipleSubmits",
        "requireAttachment",
        "redoReasonRequired",
        "redoGradePolicy",
      ];
      const changed = contentKeys.some(
        (k) => JSON.stringify((hw as any)[k]) !== JSON.stringify(patchData[k]),
      );
      if (changed) {
        patchData.requirementsUpdatedAt = new Date();
        await prisma.homeworkRevision.create({
          data: {
            homeworkId: id,
            userId: req.auth!.sub,
            summary: revisionSummary(hw as any, patchData),
            snapshotJson: JSON.stringify(patchData),
          },
        });
      }

      const updated = await prisma.homework.update({
        where: { id },
        data: patchData as any,
        include: homeworkDetailInclude,
      });
      return { homework: serializeHomework(updated) };
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

  app.delete(
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
        return reply.code(403).send({ error: "无权删除" });
      }

      const attachments = await prisma.homeworkAttachment.findMany({ where: { homeworkId: id } });
      const rubricPath = hw.rubricStoredPath;
      await prisma.homework.delete({ where: { id } });
      for (const item of attachments) {
        try {
          await unlink(join(UPLOAD_ROOT, item.storedPath));
        } catch {
          /* ignore */
        }
      }
      if (rubricPath) {
        try {
          await unlink(join(UPLOAD_ROOT, rubricPath));
        } catch {
          /* ignore */
        }
      }
      return { ok: true };
    },
  );

  app.delete(
    "/homework/:id/submission",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });

      const ok = await enrolledOrTeacher(req.auth!.sub, req.auth!.role, hw.courseId, hw.course.teacherId);
      if (!ok) return reply.code(403).send({ error: "无权操作" });
      if (req.auth!.role === "STUDENT" && !hw.published) {
        return reply.code(404).send({ error: "作业不存在" });
      }

      const sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });
      if (!sub) return reply.code(404).send({ error: "尚未提交" });
      if (sub.locked && !sub.returnReason) {
        return reply.code(400).send({ error: "已正式提交，无法删除；请联系教师打回后再处理" });
      }

      const files = await prisma.homeworkStudentFile.findMany({ where: { submissionId: sub.id } });
      for (const f of files) {
        try {
          await unlink(join(UPLOAD_ROOT, f.storedPath));
        } catch {
          /* ignore */
        }
      }
      await prisma.homeworkSubmission.delete({ where: { id: sub.id } });
      return { ok: true };
    },
  );

  app.get("/homework/:id", { preHandler: authRequired() }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const hw = await prisma.homework.findUnique({
      where: { id },
      include: { course: true, ...homeworkDetailInclude },
    });
    if (!hw) return reply.code(404).send({ error: "作业不存在" });
    const ok = await enrolledOrTeacher(req.auth!.sub, req.auth!.role, hw.courseId, hw.course.teacherId);
    if (!ok) return reply.code(403).send({ error: "无权查看" });
    if (req.auth!.role === "STUDENT" && !hw.published) {
      return reply.code(404).send({ error: "作业不存在" });
    }
    const revisions =
      req.auth!.role === "STUDENT"
        ? []
        : await prisma.homeworkRevision.findMany({
            where: { homeworkId: id },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, summary: true, createdAt: true, user: { select: { name: true } } },
          });
    return { homework: serializeHomework(hw), revisions };
  });

  app.post(
    "/homework/:id/attachments",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const check = await assertHomeworkTeacher(id, req.auth!.sub, req.auth!.role);
      if (!check.ok) return reply.code(check.code).send({ error: check.error });

      const count = await prisma.homeworkAttachment.count({ where: { homeworkId: id } });
      if (count >= HOMEWORK_ATTACHMENT_MAX_COUNT) {
        return reply.code(400).send({ error: `最多 ${HOMEWORK_ATTACHMENT_MAX_COUNT} 个附件` });
      }

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
        return reply.code(400).send({ error: "单个文件不能超过 20MB" });
      }

      const { storedPath, fileName } = await saveHomeworkFile(id, origName, fileBuf);
      const row = await prisma.homeworkAttachment.create({
        data: {
          homeworkId: id,
          fileName,
          storedPath,
          mimeType: mime,
          sizeBytes: fileBuf.length,
        },
      });
      return { attachment: row };
    },
  );

  app.delete(
    "/homework/:id/attachments/:aid",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id, aid } = req.params as { id: string; aid: string };
      const check = await assertHomeworkTeacher(id, req.auth!.sub, req.auth!.role);
      if (!check.ok) return reply.code(check.code).send({ error: check.error });

      const row = await prisma.homeworkAttachment.findFirst({
        where: { id: aid, homeworkId: id },
      });
      if (!row) return reply.code(404).send({ error: "附件不存在" });
      try {
        await unlink(join(UPLOAD_ROOT, row.storedPath));
      } catch {
        /* ignore */
      }
      await prisma.homeworkAttachment.delete({ where: { id: aid } });
      return { ok: true };
    },
  );

  app.get(
    "/homework/:id/attachments/:aid/download",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { id, aid } = req.params as { id: string; aid: string };
      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      const ok = await enrolledOrTeacher(req.auth!.sub, req.auth!.role, hw.courseId, hw.course.teacherId);
      if (!ok) return reply.code(403).send({ error: "无权下载" });
      if (req.auth!.role === "STUDENT" && !hw.published) {
        return reply.code(404).send({ error: "作业不存在" });
      }

      const row = await prisma.homeworkAttachment.findFirst({
        where: { id: aid, homeworkId: id },
      });
      if (!row) return reply.code(404).send({ error: "附件不存在" });
      const abs = join(UPLOAD_ROOT, row.storedPath);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "文件已丢失" });
      }
      return reply
        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`)
        .send(createReadStream(abs));
    },
  );

  app.post(
    "/homework/:id/rubric-file",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const check = await assertHomeworkTeacher(id, req.auth!.sub, req.auth!.role);
      if (!check.ok) return reply.code(check.code).send({ error: check.error });

      const parts = (req as any).parts();
      let fileBuf: Buffer | null = null;
      let origName = "rubric.pdf";
      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          origName = part.filename;
          fileBuf = await part.toBuffer();
        }
      }
      if (!fileBuf) return reply.code(400).send({ error: "请上传 file 字段" });
      if (!attachmentExtAllowed(origName)) {
        return reply.code(400).send({ error: "评分标准文件格式不支持" });
      }
      if (fileBuf.length > HOMEWORK_ATTACHMENT_MAX_BYTES) {
        return reply.code(400).send({ error: "文件不能超过 20MB" });
      }

      const { storedPath, fileName } = await saveHomeworkFile(id, origName, fileBuf);
      const hw = await prisma.homework.update({
        where: { id },
        data: { rubricStoredPath: storedPath, rubricFileName: fileName, requirementsUpdatedAt: new Date() },
      });
      return { homework: serializeHomework(hw) };
    },
  );

  app.post(
    "/homework/:id/submit",
    { preHandler: authRequired("STUDENT", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const schema = z.object({
        content: z.string().max(100000).optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const hw = await prisma.homework.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!hw) return reply.code(404).send({ error: "作业不存在" });
      if (!hw.published && req.auth!.role === "STUDENT") {
        return reply.code(403).send({ error: "作业尚未发布" });
      }

      const ok = await enrolledOrTeacher(
        req.auth!.sub,
        req.auth!.role,
        hw.courseId,
        hw.course.teacherId,
      );
      if (!ok) return reply.code(403).send({ error: "未选课" });

      const now = new Date();
      const late = computeLateMeta(hw, now);
      if (!late.canSubmit) {
        return reply.code(400).send({ error: late.lateHint ?? "无法提交" });
      }

      let sub = await prisma.homeworkSubmission.findUnique({
        where: { homeworkId_userId: { homeworkId: id, userId: req.auth!.sub } },
      });

      const pendingRedo = await prisma.homeworkRedoRequest.findFirst({
        where: { homeworkId: id, userId: req.auth!.sub, status: "PENDING" },
      });
      const status = computeStudentStatus(hw, sub, pendingRedo, now);
      if (status === "REDO_PENDING") {
        return reply.code(400).send({ error: "重做申请待审批，暂不可提交" });
      }
      const allowResubmit =
        sub?.locked &&
        !sub.graded &&
        hw.allowMultipleSubmits &&
        late.canSubmit &&
        !sub.returnReason;
      if (sub?.locked && !sub.returnReason && !allowResubmit) {
        return reply.code(400).send({ error: "作业已提交锁定，等待批改中" });
      }
      if (sub?.returnReason && sub.locked) {
        await prisma.homeworkSubmission.update({
          where: { id: sub.id },
          data: { locked: false },
        });
        sub = { ...sub, locked: false };
      }


      const content =
        (body.data.content ?? sub?.draftContent ?? "").trim();
      const files = sub
        ? await prisma.homeworkStudentFile.count({
            where: { submissionId: sub.id, versionId: null },
          })
        : 0;

      if (hw.answerMode === "RICH_TEXT" && !content) {
        return reply.code(400).send({ error: "请填写作业内容" });
      }
      if (hw.answerMode === "FILE" && files === 0) {
        return reply.code(400).send({ error: "请上传作业附件" });
      }
      if (hw.answerMode === "RICH_TEXT_OR_FILE" && !content && files === 0) {
        return reply.code(400).send({ error: "请填写内容或上传附件" });
      }
      if (hw.requireAttachment && files === 0) {
        return reply.code(400).send({ error: "请上传必传附件" });
      }

      if (!sub) {
        sub = await prisma.homeworkSubmission.create({
          data: {
            homeworkId: id,
            userId: req.auth!.sub,
            content: "",
            requirementsReadAt: null,
          },
        });
      }

      const versionCount = await prisma.homeworkSubmissionVersion.count({
        where: { submissionId: sub.id },
      });
      if (versionCount > 0 && !hw.allowMultipleSubmits && sub.submittedAt && !allowResubmit) {
        return reply.code(400).send({ error: "本作业不允许多次提交" });
      }

      const nextVersion = versionCount + 1;
      const versionRow = await prisma.homeworkSubmissionVersion.create({
        data: {
          submissionId: sub.id,
          version: nextVersion,
          content: content || "(附件提交)",
          isLate: late.isLate,
          lateDays: late.isLate ? late.lateDays : null,
        },
      });

      await prisma.homeworkStudentFile.updateMany({
        where: { submissionId: sub.id, versionId: null },
        data: { versionId: versionRow.id },
      });

      const updated = await prisma.homeworkSubmission.update({
        where: { id: sub.id },
        data: {
          content: content || "(附件提交)",
          draftContent: null,
          submittedAt: now,
          locked: true,
          graded: false,
          released: false,
          score: null,
          feedback: null,
          releasedAt: null,
          returnReason: null,
          isLate: late.isLate,
          lateDays: late.isLate ? late.lateDays : null,
          requirementsReadAt: sub.requirementsReadAt,
        },
      });

      await prisma.siteNotification.create({
        data: {
          userId: req.auth!.sub,
          type: "HOMEWORK",
          title: `作业提交成功：${hw.title}`,
          body: late.lateHint ?? "您的作业已成功提交，请等待教师批改。",
          homeworkId: id,
          linkPath: `/courses/${hw.courseId}/homework`,
        },
      });

      return {
        submission: updated,
        version: versionRow,
        message: "提交成功",
        lateHint: late.lateHint,
      };
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
        include: {
          user: { select: { id: true, name: true, email: true } },
          files: { select: { id: true, fileName: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
        },
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
          dueAt: hw.dueAt,
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
        returnForRedo: z.boolean().optional(),
        returnReason: z.string().max(2000).optional(),
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

      if (body.data.returnForRedo) {
        if (!(body.data.returnReason ?? "").trim()) {
          return reply.code(400).send({ error: "打回需填写原因" });
        }
        const updated = await prisma.homeworkSubmission.update({
          where: { id: sid },
          data: {
            returnReason: body.data.returnReason!.trim(),
            returnCount: { increment: 1 },
            locked: false,
            graded: false,
            released: false,
            score: null,
            feedback: body.data.feedback,
            releasedAt: null,
          },
        });
        await prisma.siteNotification.create({
          data: {
            userId: row.userId,
            type: "HOMEWORK",
            title: `作业已打回：${row.homework.title}`,
            body: body.data.returnReason!.trim(),
            homeworkId: row.homeworkId,
            linkPath: `/courses/${row.homework.courseId}/homework`,
          },
        });
        return { submission: updated, returned: true };
      }

      let finalScore = body.data.score;
      if (row.isLate && row.lateDays && row.homework.latePenaltyPercentPerDay) {
        const pct = Math.min(100, row.lateDays * row.homework.latePenaltyPercentPerDay);
        finalScore = Math.max(0, finalScore * (1 - pct / 100));
      }

      const updated = await prisma.homeworkSubmission.update({
        where: { id: sid },
        data: {
          score: finalScore,
          feedback: body.data.feedback,
          graded: true,
          released: false,
          releasedAt: null,
          returnReason: null,
        },
      });

      const lastVersion = await prisma.homeworkSubmissionVersion.findFirst({
        where: { submissionId: sid },
        orderBy: { version: "desc" },
      });
      if (lastVersion) {
        await prisma.homeworkSubmissionVersion.update({
          where: { id: lastVersion.id },
          data: { score: finalScore, feedback: body.data.feedback, graded: true },
        });
      }

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

      const hwAi = resolveHomeworkAi();
      const ai = await suggestHomeworkGrading({
        apiKey: hwAi.apiKey,
        omitBearerAuth: hwAi.omitBearerAuth,
        baseUrl: hwAi.baseUrl,
        model: hwAi.model,
        homeworkTitle: row.homework.title,
        homeworkDescription: row.homework.description,
        studentName: row.user.name,
        submissionContent: row.content,
      });
      const { score, feedback } = ai;

      if (body.data.apply) {
        const updated = await prisma.homeworkSubmission.update({
          where: { id: sid },
          data: { score, feedback, graded: true, released: false, releasedAt: null },
        });
        return {
          suggestion: { score, feedback },
          applied: true,
          submission: updated,
          source: ai.source,
          fallbackReason: ai.fallbackReason,
        };
      }

      return {
        suggestion: { score, feedback },
        applied: false,
        source: ai.source,
        fallbackReason: ai.fallbackReason,
      };
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
    const userId = req.auth!.sub;
    const rows = await prisma.homeworkSubmission.findMany({
      where: { userId },
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

    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true, classId: true },
    });
    const courseIds = enrollments.map((e) => e.courseId);
    const classByCourse = new Map(enrollments.map((e) => [e.courseId, e.classId]));

    const homeworkList = courseIds.length
      ? await prisma.homework.findMany({
          where: {
            courseId: { in: courseIds },
            published: true,
          },
          include: {
            course: { select: { id: true, title: true } },
          },
          orderBy: [{ dueAt: "asc" }, { title: "asc" }],
        })
      : [];

    const visibleHomework = homeworkList.filter((hw) => {
      if (!hw.targetClassId) return true;
      return hw.targetClassId === classByCourse.get(hw.courseId);
    });

    const subByHw = new Map(rows.map((r) => [r.homeworkId, r]));
    const redoRows = visibleHomework.length
      ? await prisma.homeworkRedoRequest.findMany({
          where: {
            userId,
            homeworkId: { in: visibleHomework.map((h) => h.id) },
            status: "PENDING",
          },
        })
      : [];
    const redoByHw = new Map(redoRows.map((r) => [r.homeworkId, r]));

    const assignments = visibleHomework.map((hw) => {
      const sub = subByHw.get(hw.id) ?? null;
      const pendingRedo = redoByHw.get(hw.id) ?? null;
      const status = computeStudentStatus(hw, sub, pendingRedo);
      const late = computeLateMeta(hw);
      return {
        id: hw.id,
        title: hw.title,
        dueAt: hw.dueAt,
        courseId: hw.courseId,
        courseTitle: hw.course.title,
        myStatus: status,
        myStatusLabel: STATUS_LABELS[status],
        canSubmit:
          !isSubmissionFinalized(sub) && status !== "REDO_PENDING" && late.canSubmit,
        lateHint: late.lateHint,
      };
    });

    const pending = assignments.filter((a) => a.canSubmit);

    return { submissions: sanitized, assignments, pending };
  });
};

export default homeworkRoutes;
