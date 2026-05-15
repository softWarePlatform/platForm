import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import {
  WRONG_SUBMISSION_PENALTY_MINUTES,
  analyzeSubmissionsForLabSet,
} from "../lib/lab-set-penalty.js";

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
        include: {
          _count: { select: { labs: true } },
        },
      });

      return {
        labSets: rows.map((r) => ({
          id: r.id,
          courseId: r.courseId,
          title: r.title,
          description: r.description,
          dueAt: r.dueAt,
          sortOrder: r.sortOrder,
          createdAt: r.createdAt,
          problemCount: r._count.labs,
        })),
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
        include: {
          labs: { select: { id: true, title: true }, orderBy: { title: "asc" } },
        },
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      const labIds = row.labs.map((l) => l.id);
      const enrollments = await prisma.enrollment.findMany({
        where: { courseId },
        select: { userId: true },
      });
      const enrolledIds = enrollments.map((e) => e.userId);

      if (labIds.length === 0) {
        return {
          penaltyRule: {
            startAt: row.createdAt.toISOString(),
            source: "lab_set_created_at",
            wrongSubmissionPenaltyMinutes: WRONG_SUBMISSION_PENALTY_MINUTES,
            formula:
              "每道已 AC 题：max(0,⌊(首次AC−起点)/60000⌋)+20×首次AC前错误提交次数；总罚时为各题之和。起点=实验集创建时间。",
          },
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
          penaltyStartMs: row.createdAt.getTime(),
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
        penaltyRule: {
          startAt: row.createdAt.toISOString(),
          source: "lab_set_created_at",
          wrongSubmissionPenaltyMinutes: WRONG_SUBMISSION_PENALTY_MINUTES,
          formula:
            "每道已 AC 题：max(0,⌊(首次AC−起点)/60000⌋)+20×首次AC前错误提交次数；总罚时为各题之和。起点=实验集创建时间。",
        },
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
        include: {
          labs: { select: { id: true, title: true }, orderBy: { title: "asc" } },
        },
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

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
          penaltyStartMs: row.createdAt.getTime(),
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
          startAt: row.createdAt.toISOString(),
          source: "lab_set_created_at",
          wrongSubmissionPenaltyMinutes: WRONG_SUBMISSION_PENALTY_MINUTES,
          formula:
            "每道已 AC 题：max(0,⌊(首次AC−起点)/60000⌋)+20×首次AC前错误提交次数；总罚时为各题之和。起点=实验集创建时间。",
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
        include: {
          labs: {
            orderBy: { title: "asc" },
            select: { id: true, title: true, language: true },
          },
          _count: { select: { labs: true } },
        },
      });
      if (!row) return reply.code(404).send({ error: "实验集不存在" });

      return {
        labSet: {
          id: row.id,
          courseId: row.courseId,
          title: row.title,
          description: row.description,
          dueAt: row.dueAt,
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          problemCount: row._count.labs,
          labs: row.labs,
        },
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
        dueAt: z.coerce.date().optional().nullable(),
        sortOrder: z.number().int().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const created = await prisma.labSet.create({
        data: {
          courseId,
          title: body.data.title,
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          ...(body.data.dueAt !== undefined ? { dueAt: body.data.dueAt } : {}),
          sortOrder: body.data.sortOrder ?? 0,
        },
      });

      return reply.code(201).send({
        labSet: {
          id: created.id,
          courseId: created.courseId,
          title: created.title,
          description: created.description,
          dueAt: created.dueAt,
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
      });
      if (!existing) return reply.code(404).send({ error: "实验集不存在" });

      const schema = z.object({
        title: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        dueAt: z.coerce.date().optional().nullable(),
        sortOrder: z.number().int().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });
      if (Object.keys(body.data).length === 0) {
        return reply.code(400).send({ error: "无更新字段" });
      }

      const updated = await prisma.labSet.update({
        where: { id: labSetId },
        data: {
          ...(body.data.title !== undefined ? { title: body.data.title } : {}),
          ...(body.data.description !== undefined ? { description: body.data.description } : {}),
          ...(body.data.dueAt !== undefined ? { dueAt: body.data.dueAt } : {}),
          ...(body.data.sortOrder !== undefined ? { sortOrder: body.data.sortOrder } : {}),
        },
        include: { _count: { select: { labs: true } } },
      });

      return {
        labSet: {
          id: updated.id,
          courseId: updated.courseId,
          title: updated.title,
          description: updated.description,
          dueAt: updated.dueAt,
          sortOrder: updated.sortOrder,
          createdAt: updated.createdAt,
          problemCount: updated._count.labs,
        },
      };
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
