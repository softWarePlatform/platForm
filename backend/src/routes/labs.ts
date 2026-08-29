import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import {
  labJudgeSelect,
  serializeJudgeConfig,
  resolveLabJudgeConfig,
  type LabJudgeSource,
} from "../lib/lab-judge-config.js";
import {
  assertCanSubmitLab,
  attachJudgeConfigToLab,
  createCodeSubmission,
  createFileSubmission,
  getJudgeConfigFromLab,
  loadLabForSubmit,
} from "../lib/lab-submit.js";
import { SubmissionStatus, type Prisma } from "@prisma/client";
import { readStoredFileAbs } from "../lib/uploads.js";
import {
  notifyLabSubmissionGraded,
  notifyLabSubmissionReturned,
} from "../lib/lab-notify.js";
import { notifyCourseStaffAndAdmins } from "../lib/role-feedback.js";
import {
  computeLabSetAccess,
  isLabSetCompleted,
  labSetJudgeSelect,
  serializeLabSetTimes,
} from "../lib/lab-set-status.js";

const labSetAccessSelect = {
  id: true,
  title: true,
  startAt: true,
  dueAt: true,
  allowMakeup: true,
  makeupDueAt: true,
  outsideAccessMode: true,
  createdAt: true,
  ...labSetJudgeSelect,
} as const;

function isCoursePrivileged(role: string, courseTeacherId: string, userId: string) {
  return role === "ADMIN" || courseTeacherId === userId;
}

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

function parseSubmissionResultDetails(
  resultJson: string | null,
): Array<{ testCaseId?: string; pass?: boolean }> {
  if (!resultJson) return [];
  try {
    const p = JSON.parse(resultJson) as { details?: unknown };
    if (!Array.isArray(p.details)) return [];
    return p.details.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
  } catch {
    return [];
  }
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
        descriptionMd: z.string().optional(),
        language: z.enum(["javascript", "python"]),
        starterCode: z.string().optional(),
        labSetId: z.string().uuid(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效：需提供所属实验集 labSetId" });

      const ls = await prisma.labSet.findFirst({
        where: { id: body.data.labSetId, courseId },
      });
      if (!ls) return reply.code(400).send({ error: "实验集不存在或不属于本课程" });
      const labSetId = ls.id;

      const lab = await prisma.lab.create({
        data: {
          courseId,
          labSetId,
          title: body.data.title,
          description: body.data.description,
          descriptionMd: body.data.descriptionMd,
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
      select: {
        id: true,
        courseId: true,
        labSetId: true,
        title: true,
        description: true,
        descriptionMd: true,
        language: true,
        starterCode: true,
        ...labJudgeSelect,
        course: true,
        labSet: { select: labSetAccessSelect },
        testCases:
          req.auth!.role === "STUDENT"
            ? { where: { hidden: false } }
            : true,
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

    const privileged = isCoursePrivileged(req.auth!.role, lab.course.teacherId, req.auth!.sub);
    const setLabs = await prisma.lab.findMany({
      where: { labSetId: lab.labSetId },
      select: { id: true },
    });
    const labIds = setLabs.map((l) => l.id);
    let labSetCompleted = true;
    if (!privileged && labIds.length > 0) {
      const subs = await prisma.submission.findMany({
        where: { userId: req.auth!.sub, labId: { in: labIds } },
        select: { labId: true, userId: true, status: true },
      });
      labSetCompleted = isLabSetCompleted(labIds, subs, req.auth!.sub);
    }

    const access = computeLabSetAccess({
      row: lab.labSet,
      isTeacher: privileged,
      labSetCompleted,
    });

    if (!privileged && !access.canBrowse) {
      return reply.code(403).send({ error: "不在可访问时间内" });
    }

    const labSetPayload = {
      ...lab.labSet,
      ...serializeLabSetTimes(lab.labSet),
      access,
    };

    const judgeConfig = serializeJudgeConfig(
      resolveLabJudgeConfig(lab as LabJudgeSource, lab.labSet as LabJudgeSource),
    );

    if (req.auth!.role === "STUDENT") {
      return {
        lab: {
          id: lab.id,
          title: lab.title,
          description: lab.description,
          descriptionMd: lab.descriptionMd,
          language: lab.language,
          starterCode: lab.starterCode,
          judgeConfig,
          labSet: labSetPayload,
          testCases: lab.testCases,
        },
      };
    }

    const full = await prisma.lab.findUnique({
      where: { id },
      select: {
        id: true,
        courseId: true,
        labSetId: true,
        title: true,
        description: true,
        descriptionMd: true,
        language: true,
        starterCode: true,
        ...labJudgeSelect,
        testCases: true,
        labSet: {
          select: {
            ...labSetAccessSelect,
            description: true,
            sortOrder: true,
          },
        },
        course: { select: { id: true, title: true } },
      },
    });
    if (!full) return reply.code(404).send({ error: "实验不存在" });
    const withConfig = attachJudgeConfigToLab(full);
    return {
      lab: {
        ...withConfig,
        judgeConfig: serializeJudgeConfig(withConfig.judgeConfig),
        labSet: {
          ...full.labSet,
          ...serializeLabSetTimes(full.labSet),
          access,
        },
      },
    };
  });

  /**
   * 教师/管理员：单题统计 + 各用例通过人数（基于 resultJson.details，与 judge-worker 写入结构一致）
   * 学生侧逐用例测评展示仍用 GET /submissions/:id/feedback（保留）
   */
  app.get(
    "/labs/:id/teacher-metrics",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lab = await prisma.lab.findUnique({
        where: { id },
        include: {
          course: true,
          testCases: { orderBy: { id: "asc" } },
        },
      });
      if (!lab) return reply.code(404).send({ error: "实验不存在" });
      if (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权查看" });
      }

      const enrollRows = await prisma.enrollment.findMany({
        where: { courseId: lab.courseId },
        select: { userId: true },
      });
      const enrolledIds = new Set(enrollRows.map((e) => e.userId));

      const subs = await prisma.submission.findMany({
        where: {
          labId: id,
          status: { notIn: ["PENDING", "JUDGING"] },
        },
        select: { userId: true, status: true, resultJson: true },
      });

      const submissionCount = subs.length;
      const distinctSubmitters = new Set(subs.map((s) => s.userId)).size;
      let acceptedStudentCount = 0;
      for (const uid of enrolledIds) {
        if (subs.some((s) => s.userId === uid && s.status === "ACCEPTED")) acceptedStudentCount += 1;
      }

      /** 选课学生中，至少在某次提交里对该用例判为通过的人数 */
      const passUsersByCase = new Map<string, Set<string>>();
      for (const tc of lab.testCases) {
        passUsersByCase.set(tc.id, new Set());
      }
      /** 曾出现在 details 中的提交次数（用于粗看参与度） */
      const verdictSubmissionsByCase = new Map<string, number>();
      for (const tc of lab.testCases) {
        verdictSubmissionsByCase.set(tc.id, 0);
      }

      for (const s of subs) {
        const details = parseSubmissionResultDetails(s.resultJson);
        const seenCase = new Set<string>();
        for (const row of details) {
          const tid = typeof row.testCaseId === "string" ? row.testCaseId : undefined;
          if (!tid || !passUsersByCase.has(tid)) continue;
          if (!seenCase.has(tid)) {
            verdictSubmissionsByCase.set(tid, (verdictSubmissionsByCase.get(tid) ?? 0) + 1);
            seenCase.add(tid);
          }
          if (row.pass === true && enrolledIds.has(s.userId)) {
            passUsersByCase.get(tid)!.add(s.userId);
          }
        }
      }

      const testCaseStats = lab.testCases.map((tc) => ({
        testCaseId: tc.id,
        hidden: tc.hidden,
        weight: tc.weight,
        passStudentCount: passUsersByCase.get(tc.id)?.size ?? 0,
        submissionsWithVerdictOnCase: verdictSubmissionsByCase.get(tc.id) ?? 0,
      }));

      return {
        labId: lab.id,
        title: lab.title,
        enrollmentCount: enrolledIds.size,
        submissionCount,
        distinctSubmitters,
        acceptedStudentCount,
        testCaseStats,
        note: "passStudentCount 仅统计选课学生；基于历次提交中该用例曾出现且 pass=true 的记录。",
      };
    },
  );

  /** 教师/管理员：更新题目（已对学生可见的题目也可改题干/语言/初始代码等） */
  app.patch(
    "/labs/:id",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lab = await prisma.lab.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!lab) return reply.code(404).send({ error: "实验不存在" });
      if (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权修改" });
      }

      const schema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        descriptionMd: z.string().optional().nullable(),
        language: z.enum(["javascript", "python"]).optional(),
        starterCode: z.string().optional().nullable(),
        judgeMode: z.enum(["AUTO", "MANUAL"]).optional().nullable(),
        allowedLanguages: z.array(z.enum(["javascript", "python"])).optional(),
        allowedFileExtensions: z.array(z.string().min(1).max(16)).optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });
      const patch = Object.fromEntries(
        Object.entries(body.data).filter(([, v]) => v !== undefined),
      ) as Record<string, unknown>;
      if (Object.keys(patch).length === 0) {
        return reply.code(400).send({ error: "无更新字段" });
      }

      const updated = await prisma.lab.update({
        where: { id },
        data: patch as {
          title?: string;
          description?: string | null;
          descriptionMd?: string | null;
          language?: string;
          starterCode?: string | null;
        },
      });
      return { lab: updated };
    },
  );

  /** 教师/管理员：删除题目（级联删除用例、提交、附件等） */
  app.delete(
    "/labs/:id",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lab = await prisma.lab.findUnique({
        where: { id },
        include: { course: true },
      });
      if (!lab) return reply.code(404).send({ error: "实验不存在" });
      if (req.auth!.role !== "ADMIN" && lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权删除" });
      }
      await prisma.lab.delete({ where: { id } });
      return { ok: true };
    },
  );

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

  /** 教师/管理员：批量创建测试用例（JSON，用于弹窗多行/文件导入） */
  app.post(
    "/labs/:id/testcases/batch",
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

      const item = z.object({
        input: z.string().max(200_000),
        expected: z.string().max(200_000),
        hidden: z.boolean().optional(),
        weight: z.number().int().positive().max(1000).optional(),
      });
      const schema = z.object({
        testCases: z.array(item).min(1).max(60),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效：testCases 为 1～60 条" });

      const created = await prisma.$transaction(
        body.data.testCases.map((tc) =>
          prisma.testCase.create({
            data: {
              labId: id,
              input: tc.input,
              expected: tc.expected,
              hidden: tc.hidden ?? false,
              weight: tc.weight ?? 1,
            },
          }),
        ),
      );

      return { count: created.length, testCases: created };
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

  app.post("/labs/:id/submit", { preHandler: authRequired("STUDENT", "TEACHER", "ADMIN") }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({
      code: z.string().min(1),
      language: z.enum(["javascript", "python"]).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "请提交代码" });

    const lab = await loadLabForSubmit(id);
    if (!lab) return reply.code(404).send({ error: "实验不存在" });

    const ok = await canAccessCourse(
      req.auth!.sub,
      req.auth!.role,
      lab.courseId,
      lab.course.teacherId,
    );
    if (!ok) return reply.code(403).send({ error: "未选课" });

    if (!assertCanSubmitLab(lab, req.auth!.role, req.auth!.sub, reply)) return;

    const judgeConfig = getJudgeConfigFromLab(lab);
    const submission = await createCodeSubmission({
      labId: id,
      userId: req.auth!.sub,
      code: body.data.code,
      language: body.data.language,
      judgeConfig,
    });
    if (req.auth!.role === "STUDENT") {
      await notifyCourseStaffAndAdmins({
        courseId: lab.courseId,
        actorUserId: req.auth!.sub,
        type: "LAB_SUBMITTED",
        title: `实验提交：${lab.title}`,
        body: "有学生提交了实验，请及时查看。",
        labSetId: lab.labSetId,
        linkPath: `/teacher/courses/${lab.courseId}/labs/${lab.id}`,
      });
    }

    return { submissionId: submission.id, status: submission.status };
  });

  /** 学生：上传文件提交（multipart: file + language） */
  app.post(
    "/labs/:id/submit-file",
    { preHandler: authRequired("STUDENT", "TEACHER", "ADMIN") },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const lab = await loadLabForSubmit(id);
      if (!lab) return reply.code(404).send({ error: "实验不存在" });

      const ok = await canAccessCourse(
        req.auth!.sub,
        req.auth!.role,
        lab.courseId,
        lab.course.teacherId,
      );
      if (!ok) return reply.code(403).send({ error: "未选课" });

      if (!assertCanSubmitLab(lab, req.auth!.role, req.auth!.sub, reply)) return;

      const parts = (req as any).parts();
      let fileBuf: Buffer | null = null;
      let origName = "";
      let language = lab.language;

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          origName = part.filename;
          fileBuf = await part.toBuffer();
        } else if (part.type === "field" && part.fieldname === "language") {
          language = String(part.value);
        }
      }

      if (!fileBuf || !origName) {
        return reply.code(400).send({ error: "请使用 multipart 上传 file 字段" });
      }

      const judgeConfig = getJudgeConfigFromLab(lab);
      try {
        const submission = await createFileSubmission({
          labId: id,
          userId: req.auth!.sub,
          language,
          fileName: origName,
          fileBuf,
          judgeConfig,
        });
        if (req.auth!.role === "STUDENT") {
          await notifyCourseStaffAndAdmins({
            courseId: lab.courseId,
            actorUserId: req.auth!.sub,
            type: "LAB_SUBMITTED",
            title: `实验提交：${lab.title}`,
            body: "有学生提交了实验文件，请及时查看。",
            labSetId: lab.labSetId,
            linkPath: `/teacher/courses/${lab.courseId}/labs/${lab.id}`,
          });
        }
        return { submissionId: submission.id, status: submission.status };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "提交失败";
        return reply.code(400).send({ error: msg });
      }
    },
  );

  /** 教师：手动批改打分 */
  app.patch(
    "/submissions/:submissionId/grade",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { submissionId } = req.params as { submissionId: string };
      const schema = z.object({
        score: z.number().min(0).max(100),
        teacherComment: z.string().max(4000).optional().nullable(),
        status: z.enum(["ACCEPTED", "WRONG_ANSWER", "PENDING_REVIEW"]).optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const sub = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { lab: { include: { course: true } } },
      });
      if (!sub) return reply.code(404).send({ error: "记录不存在" });
      if (req.auth!.role !== "ADMIN" && sub.lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权批改" });
      }

      const gradeStatus: SubmissionStatus =
        body.data.status === "PENDING_REVIEW"
          ? ("PENDING_REVIEW" as SubmissionStatus)
          : body.data.status === "WRONG_ANSWER"
            ? SubmissionStatus.WRONG_ANSWER
            : SubmissionStatus.ACCEPTED;

      const gradePatch = {
        score: body.data.score,
        teacherComment: body.data.teacherComment ?? null,
        status: gradeStatus,
        gradedById: req.auth!.sub,
        gradedAt: new Date(),
      } as Prisma.SubmissionUncheckedUpdateInput;
      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: gradePatch,
      });

      if (gradeStatus === SubmissionStatus.ACCEPTED || gradeStatus === SubmissionStatus.WRONG_ANSWER) {
        await notifyLabSubmissionGraded({
          userId: sub.userId,
          labTitle: sub.lab.title,
          courseId: sub.lab.courseId,
          labId: sub.labId,
          score: body.data.score,
          labSetId: sub.lab.labSetId,
        }).catch(() => undefined);
      }

      return { submission: updated };
    },
  );

  /** 教师：打回重做 */
  app.patch(
    "/submissions/:submissionId/return",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { submissionId } = req.params as { submissionId: string };
      const schema = z.object({ returnReason: z.string().min(1).max(2000) });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "请填写打回原因" });

      const sub = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { lab: { include: { course: true, labSet: true } } },
      });
      if (!sub) return reply.code(404).send({ error: "记录不存在" });
      if (req.auth!.role !== "ADMIN" && sub.lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权打回" });
      }

      const maxReturn = sub.lab.labSet.maxReturnCount;
      if (maxReturn != null) {
        const returnedCount = await prisma.submission.count({
          where: { labId: sub.labId, userId: sub.userId, returnedAt: { not: null } },
        });
        if (returnedCount >= maxReturn) {
          return reply.code(400).send({ error: `该学生已达最大打回次数（${maxReturn}）` });
        }
      }

      const reason = body.data.returnReason.trim();
      const updated = await prisma.submission.update({
        where: { id: submissionId },
        data: {
          returnReason: reason,
          returnedAt: new Date(),
          returnCount: { increment: 1 },
          status: SubmissionStatus.WRONG_ANSWER,
        },
      });

      await notifyLabSubmissionReturned({
        userId: sub.userId,
        labTitle: sub.lab.title,
        courseId: sub.lab.courseId,
        labId: sub.labId,
        reason,
        labSetId: sub.lab.labSetId,
      }).catch(() => undefined);

      return { submission: updated };
    },
  );

  app.get(
    "/submissions/:submissionId/download",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { submissionId } = req.params as { submissionId: string };
      const sub = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { lab: { include: { course: true } } },
      });
      if (!sub) return reply.code(404).send({ error: "记录不存在" });

      const fileRow = sub as typeof sub & { fileStoredPath?: string | null; fileName?: string | null };
      const filePath = fileRow.fileStoredPath;
      const downloadName = fileRow.fileName;
      if (!filePath) return reply.code(404).send({ error: "无附件" });

      const isOwner = sub.userId === req.auth!.sub;
      const isTeacher =
        req.auth!.role === "ADMIN" || sub.lab.course.teacherId === req.auth!.sub;
      if (!isOwner && !isTeacher) return reply.code(403).send({ error: "无权下载" });

      const abs = readStoredFileAbs(filePath);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "文件已丢失" });
      }
      const stream = createReadStream(abs);
      return reply
        .header("Content-Type", "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(downloadName ?? "submission")}`,
        )
        .send(stream);
    },
  );

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

  /**
   * 学生友好反馈（会自动隐藏 hidden 用例的 I/O）。
   * 逐用例通过情况见 feedback.details[].testCaseId / pass；教师聚合见 GET /labs/:labId/teacher-metrics。
   */
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
          returnReason: sub.returnReason,
        },
        feedback: {
          details: masked,
          last: parsed?.last ?? null,
          note: parsed?.note ?? null,
          error: typeof parsed?.error === "string" ? parsed.error : null,
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
