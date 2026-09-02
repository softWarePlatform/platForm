import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { internalRequired } from "../lib/auth.js";
import { fetchCourse, fetchRoster } from "../lib/course-client.js";
import { fetchLabGradebook } from "../lib/lab-client.js";
import { buildGradebookStudents, readGradingWeights, releasedHomeworkGrade } from "../lib/gradebook.js";

const courseIdParam = z.object({ courseId: z.string().uuid() });

function fail(reply: FastifyReply, request: FastifyRequest, status: number, code: string, message: string) {
  return reply.code(status).send({ code, message, requestId: request.id });
}

async function loadCourseHomework(courseId: string) {
  const homeworks = await prisma.homework.findMany({
    where: { courseId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
  const submissions = await prisma.homeworkSubmission.findMany({
    where: { homeworkId: { in: homeworks.map((item) => item.id) } },
    select: { homeworkId: true, userId: true, score: true, graded: true, released: true },
  });
  return { homeworks, submissions };
}

const internalRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", internalRequired);

  app.get("/internal/courses/:courseId/homework-summary", async (request, reply) => {
    const params = courseIdParam.safeParse(request.params);
    if (!params.success) return fail(reply, request, 400, "INVALID_COURSE_ID", "课程 ID 无效");
    const homeworks = await prisma.homework.findMany({ where: { courseId: params.data.courseId } });
    const submissions = await prisma.homeworkSubmission.findMany({ where: { homeworkId: { in: homeworks.map((item) => item.id) } } });
    const graded = submissions.filter((row) => row.graded && row.score != null);
    const average = graded.length ? graded.reduce((sum, row) => sum + (row.score ?? 0), 0) / graded.length : null;
    return {
      courseId: params.data.courseId,
      homeworkCount: homeworks.length,
      publishedCount: homeworks.filter((item) => item.published).length,
      submittedCount: submissions.filter((row) => row.submittedAt).length,
      gradedCount: graded.length,
      averageScore: average,
      calculatedAt: new Date().toISOString(),
    };
  });

  app.get("/internal/homework/:homeworkId", async (request, reply) => {
    const params = z.object({ homeworkId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return fail(reply, request, 400, "INVALID_HOMEWORK_ID", "作业 ID 无效");
    const hw = await prisma.homework.findUnique({
      where: { id: params.data.homeworkId },
      select: { id: true, courseId: true, title: true, dueAt: true, published: true },
    });
    if (!hw) return fail(reply, request, 404, "HOMEWORK_NOT_FOUND", "作业不存在");
    return { homework: hw };
  });

  app.get("/internal/courses/:courseId/users/:userId/homework-grade", async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid(), userId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return fail(reply, request, 400, "INVALID_ID", "课程或用户 ID 无效");
    const { homeworks, submissions } = await loadCourseHomework(params.data.courseId);
    const grade = releasedHomeworkGrade(homeworks, submissions, params.data.userId);
    return {
      courseId: params.data.courseId,
      userId: params.data.userId,
      homeworkStatus: "OK",
      homeworkAverage: grade.homeworkAverage,
      homeworks: grade.homeworks,
      calculatedAt: new Date().toISOString(),
    };
  });

  const handleGradebookBatch = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = courseIdParam.safeParse(request.params);
    if (!params.success) return fail(reply, request, 400, "INVALID_COURSE_ID", "课程 ID 无效");
    const body = z.object({ userIds: z.array(z.string()).max(500).optional() }).safeParse(request.body ?? {});
    if (!body.success) return fail(reply, request, 400, "INVALID_BODY", "请求体无效");
    const { homeworks, submissions } = await loadCourseHomework(params.data.courseId);
    const errors: Array<{ userId: string; code: string; message: string }> = [];
    let userIds = body.data.userIds;
    if (!userIds?.length) {
      userIds = [...new Set(submissions.map((row) => row.userId))];
    }
    const items = [];
    for (const userId of userIds) {
      if (!z.string().uuid().safeParse(userId).success) {
        errors.push({ userId, code: "INVALID_USER_ID", message: "用户 ID 无效" });
        continue;
      }
      const grade = releasedHomeworkGrade(homeworks, submissions, userId);
      items.push({ userId, homeworkAverage: grade.homeworkAverage, homeworks: grade.homeworks });
    }
    return {
      courseId: params.data.courseId,
      homeworkStatus: "OK",
      items,
      errors,
      calculatedAt: new Date().toISOString(),
    };
  };

  app.post("/internal/courses/:courseId/homework-gradebook/batch", handleGradebookBatch);
  app.post("/internal/courses/:courseId/homework-gradebook:batch", handleGradebookBatch);

  app.get("/internal/courses/:courseId/final-gradebook", async (request, reply) => {
    const params = courseIdParam.safeParse(request.params);
    if (!params.success) return fail(reply, request, 400, "INVALID_COURSE_ID", "课程 ID 无效");
    const courseId = params.data.courseId;
    try {
      const { homeworks, submissions } = await loadCourseHomework(courseId);
      const weights = await readGradingWeights(courseId);
      const [roster, course, lab] = await Promise.all([
        fetchRoster(courseId),
        fetchCourse(courseId),
        fetchLabGradebook(courseId),
      ]);
      const students = buildGradebookStudents({
        homeworks,
        submissions,
        students: roster.students,
        lab,
        homeworkWeight: weights.homeworkWeight,
        labWeight: weights.labWeight,
      });
      return {
        courseId,
        courseTitle: course?.title ?? courseId,
        weights,
        labStatus: lab.labStatus,
        rosterStatus: roster.status,
        homeworkStatus: "OK",
        students,
        calculatedAt: new Date().toISOString(),
      };
    } catch (error) {
      request.log.warn({ err: error }, "final-gradebook failed");
      return fail(reply, request, 503, "HOMEWORK_UNAVAILABLE", "作业成绩暂时不可用");
    }
  });
};

export default internalRoutes;
