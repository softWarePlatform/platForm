import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import {
  WRONG_SUBMISSION_PENALTY_MINUTES,
  analyzeSubmissionsForLabSet,
} from "../lib/lab-set-penalty.js";
import { computeLabSetSetAverage } from "../lib/lab-grades.js";
import { notifyLabSetPublished } from "../lib/lab-notify.js";
import {
  computeLabSetAccess,
  getPenaltyStartMs,
  isLabSetCompleted,
  labSetDetailSelect,
  labSetListSelect,
  labSetTimeSelect,
  labSetJudgeSelect,
  labSetWithLabsSelect,
  penaltyRulePayload,
  serializeLabSetTimes,
  toLabSetTimeRow,
  type LabSetListRow,
} from "../lib/lab-set-status.js";

const labSetTimePatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional().nullable(),
    startAt: z.coerce.date().optional().nullable(),
    dueAt: z.coerce.date().optional().nullable(),
    allowMakeup: z.boolean().optional(),
    makeupDueAt: z.coerce.date().optional().nullable(),
    outsideAccessMode: z.enum(["BLOCK", "VIEW_ONLY"]).optional(),
    sortOrder: z.number().int().optional(),
    judgeMode: z.enum(["AUTO", "MANUAL"]).optional(),
    allowedLanguages: z.array(z.enum(["javascript", "python"])).optional(),
    allowedFileExtensions: z.array(z.string().min(1).max(16)).optional(),
    maxReturnCount: z.number().int().min(0).max(20).optional().nullable(),
  })
  .refine(
    (d) => {
      if (d.startAt && d.dueAt && d.startAt.getTime() > d.dueAt.getTime()) return false;
      return true;
    },
    { message: "开始时间不能晚于截止时间" },
  )
  .refine(
    (d) => {
      if (d.allowMakeup && d.dueAt && d.makeupDueAt && d.makeupDueAt.getTime() <= d.dueAt.getTime()) {
        return false;
      }
      return true;
    },
    { message: "补交截止时间须晚于正式截止时间" },
  );

function mapLabSetListItem(r: LabSetListRow) {
  return {
    id: r.id,
    courseId: r.courseId,
    title: r.title,
    description: r.description,
    ...serializeLabSetTimes(r),
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    problemCount: r._count.labs,
  };
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

function isCourseTeacher(role: string, teacherId: string, userId: string) {
  return role === "ADMIN" || teacherId === userId;
}

const labSetsRoutes: FastifyPluginAsync = async (app) => {
  /** 列表：已选课学生 / 本课教师 / 管理员 */
  app.get(
    "/courses/:courseId/lab-sets",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canAccessCourse(req.auth!.sub, req.auth!.role, courseId, course.teacherId);
      if (!ok) return reply.code(403).send({ error: "未选课或无权访问" });

      const rows = await prisma.labSet.findMany({
        where: { courseId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: labSetListSelect,
      });

      return {
        labSets: rows.map(mapLabSetListItem),
      };
    },
  );

  /**
   * 实验集汇总统计（教师/管理员）
   * 罚时规则说明见 GET …/students-progress 与 lib/lab-set-penalty.ts
   */
  app.get(
    "/courses/:courseId/lab-sets/:labSetId/stats",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !isCourseTeacher(req.auth!.role, course.teacherId, req.auth!.sub)) {
        return reply.code(403).send({ error: "无权查看统计" });
      }

      const row = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        select: labSetWithLabsSelect,
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      const timeRow = toLabSetTimeRow(row);
      const labIds = row.labs.map((l) => l.id);
      const enrollments = await prisma.enrollment.findMany({
        where: { courseId },
        select: { userId: true },
      });
      const enrolledIds = enrollments.map((e) => e.userId);

      const penaltyRule = {
        ...penaltyRulePayload(timeRow),
        wrongSubmissionPenaltyMinutes: WRONG_SUBMISSION_PENALTY_MINUTES,
      };

      if (labIds.length === 0) {
        return {
          penaltyRule,
          problemCount: 0,
          enrolledStudentCount: enrolledIds.length,
          fullySolvedStudentCount: 0,
          completionRate: null,
          problems: [],
        };
      }

      const submissions = await prisma.submission.findMany({
        where: { labId: { in: labIds } },
        select: { labId: true, userId: true, status: true, score: true, createdAt: true },
      });

      const labTitles = new Map(row.labs.map((l) => [l.id, l.title]));

      const problems = labIds.map((labId) => {
        const sub = submissions.filter((s) => s.labId === labId);
        const distinct = new Set(sub.map((s) => s.userId));
        const accepted = new Set(
          sub.filter((s) => s.status === "ACCEPTED").map((s) => s.userId),
        );
        return {
          labId,
          title: labTitles.get(labId) ?? "",
          submissionCount: sub.length,
          distinctStudentCount: distinct.size,
          acceptedStudentCount: accepted.size,
        };
      });

      let fully = 0;
      for (const uid of enrolledIds) {
        const a = analyzeSubmissionsForLabSet({
          penaltyStartMs: getPenaltyStartMs(timeRow),
          labIds,
          labTitles,
          submissions,
          userId: uid,
        });
        if (a.allSolved) fully += 1;
      }

      const completionRate =
        enrolledIds.length === 0 ? null : Math.round((fully / enrolledIds.length) * 1000) / 1000;

      return {
        penaltyRule,
        problemCount: labIds.length,
        enrolledStudentCount: enrolledIds.length,
        fullySolvedStudentCount: fully,
        completionRate,
        problems,
      };
    },
  );

  /** 按学生：各题通过情况、最后提交、总罚时（教师/管理员） */
  app.get(
    "/courses/:courseId/lab-sets/:labSetId/students-progress",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !isCourseTeacher(req.auth!.role, course.teacherId, req.auth!.sub)) {
        return reply.code(403).send({ error: "无权查看统计" });
      }

      const row = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        select: labSetWithLabsSelect,
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      const timeRow = toLabSetTimeRow(row);
      const labIds = row.labs.map((l) => l.id);
      const labTitles = new Map(row.labs.map((l) => [l.id, l.title]));

      const enrollments = await prisma.enrollment.findMany({
        where: { courseId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      const submissions =
        labIds.length === 0
          ? []
          : await prisma.submission.findMany({
              where: { labId: { in: labIds } },
              select: { labId: true, userId: true, status: true, score: true, createdAt: true },
            });

      const students = enrollments.map((en) => {
        const r = analyzeSubmissionsForLabSet({
          penaltyStartMs: getPenaltyStartMs(timeRow),
          labIds,
          labTitles,
          submissions,
          userId: en.userId,
        });
        return {
          user: en.user,
          allSolved: r.allSolved,
          totalPenaltyMinutes: r.totalPenaltyMinutes,
          lastSubmitAt: r.lastSubmitAt,
          labs: r.labs,
        };
      });

      return {
        penaltyRule: {
          ...penaltyRulePayload(timeRow),
          wrongSubmissionPenaltyMinutes: WRONG_SUBMISSION_PENALTY_MINUTES,
        },
        students,
      };
    },
  );

  /** 单集详情（含题目简要列表） */
  app.get(
    "/courses/:courseId/lab-sets/:labSetId",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canAccessCourse(req.auth!.sub, req.auth!.role, courseId, course.teacherId);
      if (!ok) return reply.code(403).send({ error: "未选课或无权访问" });

      const row = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        select: labSetDetailSelect,
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      const privileged =
        req.auth!.role === "ADMIN" || course.teacherId === req.auth!.sub;
      const labIds = row.labs.map((l) => l.id);
      let labSetCompleted = true;
      if (!privileged && labIds.length > 0) {
        const subs = await prisma.submission.findMany({
          where: { userId: req.auth!.sub, labId: { in: labIds } },
          select: { labId: true, userId: true, status: true },
        });
        labSetCompleted = isLabSetCompleted(labIds, subs, req.auth!.sub);
      }

      const access = computeLabSetAccess({
        row: toLabSetTimeRow(row),
        isTeacher: privileged,
        labSetCompleted,
      });

      if (!privileged && !access.canBrowse) {
        return reply.code(403).send({ error: "不在可访问时间内" });
      }

      return {
        labSet: {
          id: row.id,
          courseId: row.courseId,
          title: row.title,
          description: row.description,
          ...serializeLabSetTimes(row),
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          judgeMode: row.judgeMode,
          allowedLanguages: row.allowedLanguages,
          allowedFileExtensions: row.allowedFileExtensions,
          problemCount: row._count.labs,
          labs: row.labs,
          access,
        },
      };
    },
  );

  /** 学生：本集各题学习情况（灰/黄/绿、AC/WA 网格用） */
  app.get(
    "/courses/:courseId/lab-sets/:labSetId/my-progress",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canAccessCourse(req.auth!.sub, req.auth!.role, courseId, course.teacherId);
      if (!ok) return reply.code(403).send({ error: "未选课或无权访问" });

      const row = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        select: labSetDetailSelect,
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      const privileged =
        req.auth!.role === "ADMIN" || course.teacherId === req.auth!.sub;
      const labIds = row.labs.map((l) => l.id);
      let labSetCompleted = true;
      if (!privileged && labIds.length > 0) {
        const subs = await prisma.submission.findMany({
          where: { userId: req.auth!.sub, labId: { in: labIds } },
          select: { labId: true, userId: true, status: true },
        });
        labSetCompleted = isLabSetCompleted(labIds, subs, req.auth!.sub);
      }

      const access = computeLabSetAccess({
        row: toLabSetTimeRow(row),
        isTeacher: privileged,
        labSetCompleted,
      });

      if (!privileged && !access.canBrowse) {
        return reply.code(403).send({ error: "不在可访问时间内" });
      }

      const timeRow = toLabSetTimeRow(row);
      const labTitles = new Map(row.labs.map((l) => [l.id, l.title]));
      const submissions =
        labIds.length === 0
          ? []
          : await prisma.submission.findMany({
              where: { labId: { in: labIds }, userId: req.auth!.sub },
              select: {
                labId: true,
                userId: true,
                status: true,
                score: true,
                createdAt: true,
              },
            });

      const analysis = analyzeSubmissionsForLabSet({
        penaltyStartMs: getPenaltyStartMs(timeRow),
        labIds,
        labTitles,
        submissions,
        userId: req.auth!.sub,
      });

      const byLab = new Map(analysis.labs.map((l) => [l.labId, l]));

      return {
        labSet: {
          id: row.id,
          courseId: row.courseId,
          title: row.title,
          ...serializeLabSetTimes(row),
          access,
          score: computeLabSetSetAverage(labIds, submissions, req.auth!.sub),
          completed: analysis.allSolved,
          progress: {
            done: analysis.labs.filter((l) => l.solved).length,
            total: labIds.length,
            attempted: analysis.labs.filter((l) => l.lastStatus !== "—").length,
          },
        },
        labs: row.labs.map((lab) => {
          const p = byLab.get(lab.id);
          let gridStatus: "NONE" | "AC" | "WA" = "NONE";
          if (p?.solved) gridStatus = "AC";
          else if (p && p.lastStatus !== "—") gridStatus = "WA";

          return {
            id: lab.id,
            title: lab.title,
            language: lab.language,
            gridStatus,
            bestScore: p?.bestScore ?? null,
            lastStatus: p?.lastStatus ?? "—",
            lastSubmitAt: p?.lastSubmitAt ?? null,
          };
        }),
      };
    },
  );

  /** 创建实验集 */
  app.post(
    "/courses/:courseId/lab-sets",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !isCourseTeacher(req.auth!.role, course.teacherId, req.auth!.sub)) {
        return reply.code(403).send({ error: "无权创建实验集" });
      }

      const schema = z.object({
        title: z.string().min(1),
        description: z.string().optional().nullable(),
        startAt: z.coerce.date().optional().nullable(),
        dueAt: z.coerce.date().optional().nullable(),
        allowMakeup: z.boolean().optional(),
        makeupDueAt: z.coerce.date().optional().nullable(),
        outsideAccessMode: z.enum(["BLOCK", "VIEW_ONLY"]).optional(),
        sortOrder: z.number().int().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const created = await prisma.labSet.create({
        data: {
          courseId,
          title: body.data.title,
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          ...(body.data.startAt !== undefined ? { startAt: body.data.startAt } : {}),
          ...(body.data.dueAt !== undefined ? { dueAt: body.data.dueAt } : {}),
          ...(body.data.allowMakeup !== undefined ? { allowMakeup: body.data.allowMakeup } : {}),
          ...(body.data.makeupDueAt !== undefined ? { makeupDueAt: body.data.makeupDueAt } : {}),
          ...(body.data.outsideAccessMode !== undefined
            ? { outsideAccessMode: body.data.outsideAccessMode }
            : {}),
          sortOrder: body.data.sortOrder ?? 0,
        },
        include: { course: { select: { title: true } } },
      });

      await notifyLabSetPublished({
        courseId,
        labSetId: created.id,
        labSetTitle: created.title,
        courseTitle: created.course.title,
      }).catch(() => undefined);

      return reply.code(201).send({
        labSet: {
          id: created.id,
          courseId: created.courseId,
          title: created.title,
          description: created.description,
          ...serializeLabSetTimes(created),
          sortOrder: created.sortOrder,
          createdAt: created.createdAt,
          problemCount: 0,
        },
      });
    },
  );

  /** 更新实验集（标题、说明、截止时间、排序） */
  app.patch(
    "/courses/:courseId/lab-sets/:labSetId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !isCourseTeacher(req.auth!.role, course.teacherId, req.auth!.sub)) {
        return reply.code(403).send({ error: "无权修改" });
      }

      const existing = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        select: labSetTimeSelect,
      });
      if (!existing) return reply.code(404).send({ error: "实验集不存在" });

      const existingTime = toLabSetTimeRow(existing);

      const body = labSetTimePatchSchema.safeParse(req.body);
      if (!body.success) {
        const msg = body.error.issues[0]?.message ?? "参数无效";
        return reply.code(400).send({ error: msg });
      }
      if (Object.keys(body.data).length === 0) {
        return reply.code(400).send({ error: "无更新字段" });
      }

      const mergedStart =
        body.data.startAt !== undefined ? body.data.startAt : existingTime.startAt;
      const mergedDue = body.data.dueAt !== undefined ? body.data.dueAt : existingTime.dueAt;
      const mergedMakeupDue =
        body.data.makeupDueAt !== undefined ? body.data.makeupDueAt : existingTime.makeupDueAt;
      const mergedAllowMakeup =
        body.data.allowMakeup !== undefined ? body.data.allowMakeup : existingTime.allowMakeup;
      if (mergedStart && mergedDue && mergedStart.getTime() > mergedDue.getTime()) {
        return reply.code(400).send({ error: "开始时间不能晚于截止时间" });
      }
      if (
        mergedAllowMakeup &&
        mergedDue &&
        mergedMakeupDue &&
        mergedMakeupDue.getTime() <= mergedDue.getTime()
      ) {
        return reply.code(400).send({ error: "补交截止时间须晚于正式截止时间" });
      }

      const updated = await prisma.labSet.update({
        where: { id: labSetId },
        data: {
          ...(body.data.title !== undefined ? { title: body.data.title } : {}),
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          ...(body.data.startAt !== undefined ? { startAt: body.data.startAt } : {}),
          ...(body.data.dueAt !== undefined ? { dueAt: body.data.dueAt } : {}),
          ...(body.data.allowMakeup !== undefined ? { allowMakeup: body.data.allowMakeup } : {}),
          ...(body.data.makeupDueAt !== undefined ? { makeupDueAt: body.data.makeupDueAt } : {}),
          ...(body.data.outsideAccessMode !== undefined
            ? { outsideAccessMode: body.data.outsideAccessMode }
            : {}),
          ...(body.data.sortOrder !== undefined ? { sortOrder: body.data.sortOrder } : {}),
          ...(body.data.judgeMode !== undefined ? { judgeMode: body.data.judgeMode } : {}),
          ...(body.data.allowedLanguages !== undefined
            ? { allowedLanguages: body.data.allowedLanguages }
            : {}),
          ...(body.data.allowedFileExtensions !== undefined
            ? { allowedFileExtensions: body.data.allowedFileExtensions }
            : {}),
          ...(body.data.maxReturnCount !== undefined
            ? { maxReturnCount: body.data.maxReturnCount }
            : {}),
        },
        select: {
          id: true,
          courseId: true,
          title: true,
          description: true,
          sortOrder: true,
          ...labSetTimeSelect,
          ...labSetJudgeSelect,
          _count: { select: { labs: true } },
        },
      });

      return {
        labSet: {
          id: updated.id,
          courseId: updated.courseId,
          title: updated.title,
          description: updated.description,
          ...serializeLabSetTimes(updated),
          judgeMode: updated.judgeMode,
          allowedLanguages: updated.allowedLanguages,
          allowedFileExtensions: updated.allowedFileExtensions,
          sortOrder: updated.sortOrder,
          createdAt: updated.createdAt,
          problemCount: updated._count.labs,
        },
      };
    },
  );

  /** 教师：某学生在实验集下各题最后一次提交（含文件下载信息） */
  app.get(
    "/courses/:courseId/lab-sets/:labSetId/students/:userId/submissions",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, labSetId, userId } = req.params as {
        courseId: string;
        labSetId: string;
        userId: string;
      };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !isCourseTeacher(req.auth!.role, course.teacherId, req.auth!.sub)) {
        return reply.code(403).send({ error: "无权查看" });
      }

      const row = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        select: { labs: { select: { id: true, title: true }, orderBy: { title: "asc" } } },
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      const labIds = row.labs.map((l) => l.id);
      const allSubs =
        labIds.length === 0
          ? []
          : await prisma.submission.findMany({
              where: { labId: { in: labIds }, userId },
              orderBy: { createdAt: "desc" },
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            });

      const latestByLab = new Map<string, (typeof allSubs)[0]>();
      for (const s of allSubs) {
        if (!latestByLab.has(s.labId)) latestByLab.set(s.labId, s);
      }

      const problems = row.labs.map((lab) => {
        const sub = latestByLab.get(lab.id);
        return {
          labId: lab.id,
          title: lab.title,
          submission: sub
            ? {
                id: sub.id,
                status: sub.status,
                score: sub.score,
                submissionKind: sub.submissionKind,
                language: sub.language,
                fileName: sub.fileName,
                hasFile: Boolean(sub.fileStoredPath),
                teacherComment: sub.teacherComment,
                returnReason: sub.returnReason,
                returnedAt: sub.returnedAt?.toISOString() ?? null,
                createdAt: sub.createdAt,
                gradedAt: sub.gradedAt,
              }
            : null,
        };
      });

      return { userId, problems };
    },
  );

  /**
   * 删除实验集（级联删除其下所有 Lab 及关联 TestCase、Submission、LabFile 等，与 Prisma schema 一致）
   */
  app.delete(
    "/courses/:courseId/lab-sets/:labSetId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !isCourseTeacher(req.auth!.role, course.teacherId, req.auth!.sub)) {
        return reply.code(403).send({ error: "无权删除" });
      }

      const existing = await prisma.labSet.findFirst({
        where: { id: labSetId, courseId },
        include: { _count: { select: { labs: true } } },
      });
      if (!existing) return reply.code(404).send({ error: "实验集不存在" });

      const force = String((req.query as { force?: string })?.force ?? "") === "1";
      if (existing._count.labs > 0 && !force) {
        return reply.code(409).send({
          error: "实验集下仍有题目。若确认删除整集及全部题目与提交记录，请附加查询参数 force=1",
          problemCount: existing._count.labs,
        });
      }

      await prisma.labSet.delete({ where: { id: labSetId } });
      return { ok: true, deletedLabSetId: labSetId, deletedProblems: existing._count.labs };
    },
  );
};

export default labSetsRoutes;
