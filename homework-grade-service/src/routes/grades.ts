import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/auth.js";
import { resolveCourseAccess } from "../lib/course-client.js";
import { combineTotal, fetchLabGradebook } from "../lib/lab-client.js";
import { buildGradebookStudents, homeworkAverage } from "../lib/gradebook.js";

async function gradingConfig(courseId: string, updatedById: string) {
  return prisma.gradingConfig.upsert({
    where: { courseId },
    update: {},
    create: { courseId, labWeight: 0.5, homeworkWeight: 0.5, updatedById, version: 1 },
  });
}

const gradesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses/:courseId/grading-config", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, params.data.courseId, request.authorizationHeader);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.isTeacher) return reply.code(403).send({ error: "无权操作" });
    const config = await gradingConfig(params.data.courseId, request.auth!.sub);
    return { config: { ...config, labWeight: Number(config.labWeight), homeworkWeight: Number(config.homeworkWeight), source: "grading-config" } };
  });

  app.patch("/courses/:courseId/grading-config", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ labWeight: z.number().min(0).max(1), homeworkWeight: z.number().min(0).max(1), version: z.number().int().optional() }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "参数无效" });
    if (Math.abs(body.data.labWeight + body.data.homeworkWeight - 1) > 0.001) return reply.code(400).send({ error: "实验权重与作业权重之和必须为 1" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, params.data.courseId, request.authorizationHeader);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.isTeacher) return reply.code(403).send({ error: "无权操作" });
    const current = await gradingConfig(params.data.courseId, request.auth!.sub);
    if (body.data.version != null && body.data.version !== current.version) {
      return reply.code(409).send({ error: "成绩配置已被他人更新", version: current.version });
    }
    const updated = await prisma.gradingConfig.update({
      where: { courseId: params.data.courseId },
      data: {
        labWeight: body.data.labWeight,
        homeworkWeight: body.data.homeworkWeight,
        updatedById: request.auth!.sub,
        version: { increment: 1 },
      },
    });
    return { config: { ...updated, labWeight: Number(updated.labWeight), homeworkWeight: Number(updated.homeworkWeight), source: "grading-config" } };
  });

  app.get("/courses/:courseId/gradebook", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, params.data.courseId, request.authorizationHeader);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.isTeacher) return reply.code(403).send({ error: "无权操作" });
    const config = await gradingConfig(params.data.courseId, request.auth!.sub);
    const labWeight = Number(config.labWeight);
    const homeworkWeight = Number(config.homeworkWeight);
    const homeworks = await prisma.homework.findMany({ where: { courseId: params.data.courseId }, orderBy: { title: "asc" } });
    const submissions = await prisma.homeworkSubmission.findMany({ where: { homeworkId: { in: homeworks.map((item) => item.id) } } });
    const lab = await fetchLabGradebook(params.data.courseId);
    const students = buildGradebookStudents({
      homeworks,
      submissions,
      students: access.students,
      lab,
      homeworkWeight,
      labWeight,
    });
    return {
      courseId: params.data.courseId,
      courseTitle: access.course.title,
      weights: { lab: labWeight, homework: homeworkWeight, version: config.version },
      labStatus: lab.labStatus,
      rosterStatus: access.rosterStatus,
      students,
      calculatedAt: new Date().toISOString(),
    };
  });

  app.get("/grades/me", { preHandler: authRequired("STUDENT", "ADMIN") }, async (request) => {
    const mine = await prisma.homeworkSubmission.findMany({ where: { userId: request.auth!.sub } });
    const homeworkIds = [...new Set(mine.map((row) => row.homeworkId))];
    const homeworks = await prisma.homework.findMany({ where: { id: { in: homeworkIds } } });
    const byCourse = new Map<string, typeof homeworks>();
    for (const hw of homeworks) {
      const list = byCourse.get(hw.courseId) ?? [];
      list.push(hw);
      byCourse.set(hw.courseId, list);
    }
    const courses = [];
    for (const [courseId, list] of byCourse) {
      const access = await resolveCourseAccess(request.auth!.sub, request.auth!.role, courseId, request.authorizationHeader);
      const config = await gradingConfig(courseId, request.auth!.sub);
      const hwRows = list.map((hw) => {
        const sub = mine.find((item) => item.homeworkId === hw.id);
        return { score: sub?.released ? sub.score : null, graded: Boolean(sub?.graded && sub.released) };
      });
      const hwAvg = homeworkAverage(hwRows);
      const lab = await fetchLabGradebook(courseId);
      const total = combineTotal(hwAvg, lab.labAverage, Number(config.homeworkWeight), Number(config.labWeight), lab.labStatus);
      courses.push({
        courseId,
        courseTitle: access.course?.title ?? courseId,
        homeworkAverage: hwAvg,
        labAverage: total.labAverage,
        labStatus: lab.labStatus,
        totalScore: total.totalScore,
        provisionalTotal: total.provisionalTotal,
        weights: { lab: Number(config.labWeight), homework: Number(config.homeworkWeight), version: config.version },
      });
    }
    return { courses };
  });
};

export default gradesRoutes;
