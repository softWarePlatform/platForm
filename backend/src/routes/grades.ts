import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

type GradebookStudent = {
  user: { id: string; name: string; email: string };
  labs: Array<{ labId: string; title: string; bestScore: number | null }>;
  homework: Array<{
    homeworkId: string;
    title: string;
    score: number | null;
    graded: boolean;
  }>;
};

async function loadGradebook(courseId: string): Promise<{
  courseTitle: string;
  courseId: string;
  students: GradebookStudent[];
} | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      enrollments: { include: { user: true } },
      labs: true,
      homeworks: true,
    },
  });
  if (!course) return null;

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

  const students: GradebookStudent[] = studentIds.map((sid) => {
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

  return { courseTitle: course.title, courseId: course.id, students };
}

function csvEscape(cell: string): string {
  if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function toCsv(data: NonNullable<Awaited<ReturnType<typeof loadGradebook>>>): string {
  if (data.students.length === 0) {
    return "姓名,邮箱\n";
  }

  const first = data.students[0]!;
  const labCols = first.labs.map((l) => `实验_${l.title}`);
  const hwCols = first.homework.map((h) => `作业_${h.title}`);

  const header = ["姓名", "邮箱", ...labCols, ...hwCols];
  const lines = [header.join(",")];

  for (const row of data.students) {
    const cells = [
      csvEscape(row.user.name),
      csvEscape(row.user.email),
      ...row.labs.map((l) => csvEscape(l.bestScore == null ? "" : String(l.bestScore))),
      ...row.homework.map((h) =>
        csvEscape(!h.graded ? "未批改" : h.score == null ? "" : String(h.score)),
      ),
    ];
    lines.push(cells.join(","));
  }

  return `\ufeff${lines.join("\n")}\n`;
}

const gradesRoutes: FastifyPluginAsync = async (app) => {
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

  app.get(
    "/courses/:courseId/gradebook",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      if (course.teacherId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
        return reply.code(403).send({ error: "无权查看" });
      }

      const data = await loadGradebook(courseId);
      if (!data) return reply.code(404).send({ error: "课程不存在" });

      return {
        courseId: data.courseId,
        courseTitle: data.courseTitle,
        students: data.students,
      };
    },
  );

  app.get(
    "/courses/:courseId/gradebook/export.csv",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      if (course.teacherId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
        return reply.code(403).send({ error: "无权导出" });
      }

      const data = await loadGradebook(courseId);
      if (!data) return reply.code(404).send({ error: "课程不存在" });

      const safeName = data.courseTitle.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
      const filename = `成绩册_${safeName}.csv`;

      const csv = toCsv(data);
      return reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`)
        .send(csv);
    },
  );
};

export default gradesRoutes;
