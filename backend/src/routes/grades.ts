import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
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
  summary: {
    labAverage: number | null;
    homeworkAverage: number | null;
    totalScore: number | null;
  };
  rank?: number;
};

async function loadGradebook(courseId: string): Promise<{
  courseTitle: string;
  courseId: string;
  weights: { lab: number; homework: number };
  distribution: {
    lt60: number;
    b60_69: number;
    b70_79: number;
    b80_89: number;
    gte90: number;
  };
  students: GradebookStudent[];
} | null> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      enrollments: { include: { user: true } },
      labs: true,
      homeworks: true,
      classes: { select: { id: true, name: true } },
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

  const weights = {
    lab: course.labWeight,
    homework: course.homeworkWeight,
  };

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

    const labNums = labScores.map((x) => x.bestScore).filter((x): x is number => x != null);
    const hwNums = hwForStudent
      .filter((x) => x.graded)
      .map((x) => x.score)
      .filter((x): x is number => x != null);
    const labAverage = labNums.length ? labNums.reduce((a, b) => a + b, 0) / labNums.length : null;
    const homeworkAverage = hwNums.length ? hwNums.reduce((a, b) => a + b, 0) / hwNums.length : null;
    const totalScore =
      labAverage == null && homeworkAverage == null
        ? null
        : (labAverage ?? 0) * weights.lab + (homeworkAverage ?? 0) * weights.homework;

    return {
      user: { id: user.id, name: user.name, email: user.email },
      labs: labScores,
      homework: hwForStudent,
      summary: { labAverage, homeworkAverage, totalScore },
    };
  });

  const ranked = [...students].sort(
    (a, b) => (b.summary.totalScore ?? -1) - (a.summary.totalScore ?? -1),
  );
  const rankMap = new Map<string, number>();
  ranked.forEach((s, i) => rankMap.set(s.user.id, i + 1));
  students.forEach((s) => {
    s.rank = rankMap.get(s.user.id);
  });

  const dist = { lt60: 0, b60_69: 0, b70_79: 0, b80_89: 0, gte90: 0 };
  for (const s of students) {
    const t = s.summary.totalScore;
    if (t == null) continue;
    if (t < 60) dist.lt60++;
    else if (t < 70) dist.b60_69++;
    else if (t < 80) dist.b70_79++;
    else if (t < 90) dist.b80_89++;
    else dist.gte90++;
  }

  return { courseTitle: course.title, courseId: course.id, students, weights, distribution: dist };
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

  const header = ["姓名", "邮箱", ...labCols, ...hwCols, "实验均分", "作业均分", "总评", "排名"];
  const lines = [header.join(",")];

  for (const row of data.students) {
    const cells = [
      csvEscape(row.user.name),
      csvEscape(row.user.email),
      ...row.labs.map((l) => csvEscape(l.bestScore == null ? "" : String(l.bestScore))),
      ...row.homework.map((h) =>
        csvEscape(!h.graded ? "未批改" : h.score == null ? "" : String(h.score)),
      ),
      csvEscape(row.summary.labAverage == null ? "" : row.summary.labAverage.toFixed(2)),
      csvEscape(row.summary.homeworkAverage == null ? "" : row.summary.homeworkAverage.toFixed(2)),
      csvEscape(row.summary.totalScore == null ? "" : row.summary.totalScore.toFixed(2)),
      csvEscape(row.rank == null ? "" : String(row.rank)),
    ];
    lines.push(cells.join(","));
  }

  return `\ufeff${lines.join("\n")}\n`;
}

const gradesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/grades/me", { preHandler: authRequired("STUDENT", "ADMIN") }, async (req) => {
    const uid = req.auth!.sub;

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: uid },
      include: { course: { select: { id: true, title: true, labWeight: true, homeworkWeight: true } } },
    });

    const courseGrades = await Promise.all(
      enrollments.map(async (en) => {
        const data = await loadGradebook(en.course.id);
        if (!data) return null;
        const mine = data.students.find((s) => s.user.id === uid);
        if (!mine) return null;
        return {
          courseId: data.courseId,
          courseTitle: data.courseTitle,
          rank: mine.rank,
          classSize: data.students.length,
          summary: mine.summary,
          weights: data.weights,
        };
      }),
    );
    const valid = courseGrades.filter(Boolean);

    return {
      courses: valid,
    };
  });

  app.get(
    "/courses/:courseId/grading-config",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      if (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权查看" });
      }
      return {
        config: {
          labWeight: course.labWeight,
          homeworkWeight: course.homeworkWeight,
        },
      };
    },
  );

  app.patch(
    "/courses/:courseId/grading-config",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const schema = z.object({
        labWeight: z.number().min(0).max(1),
        homeworkWeight: z.number().min(0).max(1),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const sum = Number((body.data.labWeight + body.data.homeworkWeight).toFixed(6));
      if (Math.abs(sum - 1) > 0.000001) {
        return reply.code(400).send({ error: "权重之和必须为 1" });
      }

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      if (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权修改" });
      }

      const updated = await prisma.course.update({
        where: { id: courseId },
        data: { labWeight: body.data.labWeight, homeworkWeight: body.data.homeworkWeight },
      });
      return { config: { labWeight: updated.labWeight, homeworkWeight: updated.homeworkWeight } };
    },
  );

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
        weights: data.weights,
        distribution: data.distribution,
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
