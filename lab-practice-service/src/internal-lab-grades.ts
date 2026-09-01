import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { internalAuth } from "../../backend/src/lib/internal-auth.js";
import {
  labGradeRule,
  loadLabGradeReports,
  type LabGradeReport,
} from "../../backend/src/lib/lab-grade-report.js";

type Options = {
  token?: string;
  loadReports?: (courseId: string, userIds: string[]) => Promise<LabGradeReport[]>;
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
  const authenticate = internalAuth(options.token);
  const loadReports = options.loadReports ?? loadLabGradeReports;

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
};

export default internalLabGradesRoutes;
