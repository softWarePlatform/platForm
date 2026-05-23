import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/authGuard.js";
import {
  buildStudentLabSetOverview,
  buildTeacherLabSetOverview,
} from "../lib/lab-set-overview.js";

const querySchema = z.object({
  courseId: z.string().uuid().optional(),
});

const labOverviewRoutes: FastifyPluginAsync = async (app) => {
  /** 学生：已选课程下全部实验集（可按 courseId 过滤） */
  app.get("/lab-sets/mine/overview", { preHandler: authRequired() }, async (req, reply) => {
    const q = querySchema.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "参数无效" });

    if (req.auth!.role === "TEACHER") {
      return reply.code(403).send({ error: "请使用教师实验管理接口" });
    }

    const overview = await buildStudentLabSetOverview({
      userId: req.auth!.sub,
      courseId: q.data.courseId,
    });
    return overview;
  });

  /** 教师 / 管理员：授课课程下全部实验集（可按 courseId 过滤） */
  app.get(
    "/lab-sets/teaching/overview",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const q = querySchema.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ error: "参数无效" });

      const overview = await buildTeacherLabSetOverview({
        userId: req.auth!.sub,
        role: req.auth!.role,
        courseId: q.data.courseId,
      });
      return overview;
    },
  );
};

export default labOverviewRoutes;
