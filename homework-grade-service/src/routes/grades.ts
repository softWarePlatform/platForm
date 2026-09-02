import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/auth.js";
import { resolveCourseAccess, sendAccessDenial, teacherAccessDenial } from "../lib/course-client.js";
import { sendError } from "../lib/http-error.js";
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
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "课程 ID 无效");
    const access = await resolveCourseAccess(request.auth!.sub, params.data.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const config = await gradingConfig(params.data.courseId, request.auth!.sub);
    return { config: { ...config, labWeight: Number(config.labWeight), homeworkWeight: Number(config.homeworkWeight), source: "grading-config" } };
  });

  app.patch("/courses/:courseId/grading-config", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ labWeight: z.number().min(0).max(1), homeworkWeight: z.number().min(0).max(1), version: z.number().int().optional() }).safeParse(request.body);
    if (!params.success || !body.success) return sendError(reply, request, 400, "INVALID_BODY", "参数无效");
    if (Math.abs(body.data.labWeight + body.data.homeworkWeight - 1) > 0.001) return sendError(reply, request, 400, "INVALID_BODY", "实验权重与作业权重之和必须为 1");
    const access = await resolveCourseAccess(request.auth!.sub, params.data.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const current = await gradingConfig(params.data.courseId, request.auth!.sub);
    if (body.data.version != null && body.data.version !== current.version) {
      return sendError(reply, request, 409, "VERSION_CONFLICT", "成绩配置已被他人更新", { version: current.version });
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
    if (!params.success) return sendError(reply, request, 400, "INVALID_ID", "课程 ID 无效");
    const access = await resolveCourseAccess(request.auth!.sub, params.data.courseId);
    if (sendAccessDenial(reply, request, teacherAccessDenial(access))) return;
    const config = await gradingConfig(params.data.courseId, request.auth!.sub);
    const labWeight = Number(config.labWeight);
    const homeworkWeight = Number(config.homeworkWeight);
    const [homeworks, lab] = await Promise.all([
      prisma.homework.findMany({ where: { courseId: params.data.courseId }, orderBy: { title: "asc" } }),
      fetchLabGradebook(params.data.courseId, access.students.map((student) => student.id)),
    ]);
    const submissions = await prisma.homeworkSubmission.findMany({ where: { homeworkId: { in: homeworks.map((item) => item.id) } } });
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
      courseTitle: access.course?.title ?? params.data.courseId,
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
      const access = await resolveCourseAccess(request.auth!.sub, courseId);
      const config = await gradingConfig(courseId, request.auth!.sub);
      const hwRows = list.map((hw) => {
        const sub = mine.find((item) => item.homeworkId === hw.id);
        return { score: sub?.released ? sub.score : null, graded: Boolean(sub?.graded && sub.released) };
      });
      const hwAvg = homeworkAverage(hwRows);
      const lab = await fetchLabGradebook(courseId, [request.auth!.sub]);
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
