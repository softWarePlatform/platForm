import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { fetchCourseUserIds } from "./course-client.js";
import { internalRequired } from "./internal-auth.js";
import {
  labGradeRule,
  loadLabGradeReports,
  type LabGradeReport,
} from "./lab-grade-report.js";

type Options = {
  token?: string;
  loadReports?: (courseId: string, userIds: string[]) => Promise<LabGradeReport[]>;
  loadUserIds?: (courseId: string) => Promise<string[]>;
};

const singleParamsSchema = z.object({
  courseId: z.string().uuid(),
  userId: z.string().uuid(),
});
const courseParamsSchema = z.object({ courseId: z.string().uuid() });
const batchSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(500),
});

const internalLabGradesRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  const authenticate = internalRequired(options.token);
  const loadReports = options.loadReports ?? loadLabGradeReports;
  const loadUserIds = options.loadUserIds ?? fetchCourseUserIds;

  app.get(
    "/internal/courses/:courseId/lab-gradebook",
    { preHandler: authenticate },
    async (req, reply) => {
      const params = courseParamsSchema.safeParse(req.params);
      if (!params.success) {
        return reply.code(400).send({ code: "INVALID_ARGUMENT", message: "课程 ID 格式无效", requestId: req.id });
      }
      try {
        const userIds = await loadUserIds(params.data.courseId);
        const reports = await loadReports(params.data.courseId, userIds);
        const available = reports.map((report) => report.labAverage).filter((value): value is number => value != null);
        return {
          courseId: params.data.courseId,
          labStatus: "OK",
          labAverage: available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null,
          students: reports.map(({ userId, labAverage }) => ({ userId, labAverage })),
        };
      } catch (error) {
        req.log.warn({ err: error }, "lab gradebook unavailable");
        return reply.code(503).send({ code: "UNAVAILABLE", message: "实验成绩暂不可用", requestId: req.id });
      }
    },
  );

  app.get(
    "/internal/courses/:courseId/lab-grades/:userId",
    { preHandler: authenticate },
    async (req, reply) => {
      const params = singleParamsSchema.safeParse(req.params);
      if (!params.success) return reply.code(400).send({ error: "课程或用户 ID 格式无效" });

      const [grade] = await loadReports(params.data.courseId, [params.data.userId]);
      return { courseId: params.data.courseId, rule: labGradeRule, grade };
    },
  );

  app.post(
    "/internal/courses/:courseId/lab-grades/batch",
    { preHandler: authenticate },
    async (req, reply) => {
      const params = courseParamsSchema.safeParse(req.params);
      const body = batchSchema.safeParse(req.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ error: "课程 ID 或用户 ID 列表格式无效" });
      }

      const grades = await loadReports(params.data.courseId, body.data.userIds);
      return { courseId: params.data.courseId, rule: labGradeRule, grades };
    },
  );

  app.post(
    "/internal/courses/:courseId/lab-grades:batch",
    { preHandler: authenticate },
    async (req, reply) => {
      const params = courseParamsSchema.safeParse(req.params);
      const body = batchSchema.safeParse(req.body);
      if (!params.success || !body.success) {
        return reply.code(400).send({ code: "INVALID_ARGUMENT", message: "课程 ID 或用户 ID 列表格式无效", requestId: req.id });
      }
      const grades = await loadReports(params.data.courseId, body.data.userIds);
      return { courseId: params.data.courseId, rule: labGradeRule, grades };
    },
  );
};

export default internalLabGradesRoutes;
