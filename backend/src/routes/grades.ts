import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

const gradesRoutes: FastifyPluginAsync = async (app) => {
  /** 学生：汇总成绩（实验最高分 + 作业平均分 仅作示例，可扩展权重） */
  app.get("/grades/me", { preHandler: authRequired("STUDENT", "ADMIN") }, async (req) => {
    const uid = req.auth!.sub;

    const subs = await prisma.submission.groupBy({
      by: ["labId"],
      where: { userId: uid, score: { not: null } },
      _max: { score: true },
    });

    const hw = await prisma.homeworkSubmission.findMany({
      where: { userId: uid, graded: true, score: { not: null } },
    });

    const labScore =
      subs.length === 0
        ? null
        : subs.reduce((a, b) => a + (b._max.score ?? 0), 0) / subs.length;

    const hwAvg =
      hw.length === 0 ? null : hw.reduce((a, b) => a + (b.score ?? 0), 0) / hw.length;

    return {
      summary: {
        labAverage: labScore,
        homeworkAverage: hwAvg,
        labAttempts: subs.length,
        homeworkGraded: hw.length,
      },
      homework: hw,
    };
  });

  /** 教师：班级实验 / 作业统计 */
  app.get(
    "/courses/:courseId/gradebook",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        include: {
          enrollments: { include: { user: true } },
          labs: true,
          homeworks: true,
        },
      });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      if (course.teacherId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
        return reply.code(403).send({ error: "无权查看" });
      }

      const studentIds = course.enrollments.map((e) => e.userId);

      const submissions = await prisma.submission.findMany({
        where: { userId: { in: studentIds }, lab: { courseId } },
      });

      const hwSubs = await prisma.homeworkSubmission.findMany({
        where: {
          userId: { in: studentIds },
          homework: { courseId },
        },
        include: { homework: true },
      });

      const perStudent = studentIds.map((sid) => {
        const user = course.enrollments.find((e) => e.userId === sid)!.user;
        const labScores = course.labs.map((lab) => {
          const best = submissions
            .filter((s) => s.labId === lab.id && s.userId === sid)
            .map((s) => s.score)
            .filter((x): x is number => x != null)
            .reduce((a, b) => Math.max(a, b), 0);
          return { labId: lab.id, title: lab.title, bestScore: best || null };
        });

        const hwForStudent = course.homeworks.map((h) => {
          const row = hwSubs.find((x) => x.homeworkId === h.id && x.userId === sid);
          return {
            homeworkId: h.id,
            title: h.title,
            score: row?.score ?? null,
            graded: row?.graded ?? false,
          };
        });

        return {
          user: { id: user.id, name: user.name, email: user.email },
          labs: labScores,
          homework: hwForStudent,
        };
      });

      return { courseId, students: perStudent };
    },
  );
};

export default gradesRoutes;
