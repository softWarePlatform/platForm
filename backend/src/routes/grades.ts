import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";

type LabScoreCell = { labId: string; title: string; bestScore: number | null };

type LabSetGrade = {
  labSetId: string;
  labSetTitle: string;
  /** 该实验集内各题最高分的算术平均（仅统计已有分数的题目） */
  setAverage: number | null;
  labs: LabScoreCell[];
};

type GradebookStudent = {
  user: { id: string; name: string; email: string };
  /** 按实验集分组；实验总均分 = 各集 setAverage 的算术平均（仅统计有 setAverage 的集） */
  labSets: LabSetGrade[];
  /** 展平题目（顺序与 labSets 一致），便于导出 */
  labs: LabScoreCell[];
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

function bestScoreForLab(
  submissions: Array<{ labId: string; userId: string; score: number | null }>,
  userId: string,
  labId: string,
): number | null {
  const nums = submissions
    .filter((s) => s.labId === labId && s.userId === userId)
    .map((s) => s.score)
    .filter((x): x is number => x != null);
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

async function loadGradebook(courseId: string): Promise<{
  courseTitle: string;
  courseId: string;
  weights: { lab: number; homework: number };
  labColumnPlan: Array<{ labSetId: string; labSetTitle: string; labId: string; labTitle: string }>;
  labGradingRule: string;
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
      labSets: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          labs: { orderBy: { title: "asc" }, select: { id: true, title: true } },
        },
      },
      homeworks: true,
      classes: { select: { id: true, name: true } },
    },
  });
  if (!course) return null;

  const studentIds = course.enrollments.map((e) => e.userId);

  const submissions = await prisma.submission.findMany({
    where: { userId: { in: studentIds }, lab: { courseId } },
    select: { labId: true, userId: true, score: true },
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

  const labColumnPlan = course.labSets.flatMap((ls) =>
    ls.labs.map((l) => ({
      labSetId: ls.id,
      labSetTitle: ls.title,
      labId: l.id,
      labTitle: l.title,
    })),
  );

  const labGradingRule =
    "实验总均分 = 各「实验集均分」的算术平均；每实验集均分 = 该集内各题最高分的算术平均（仅统计已有分数的提交）。";

  const students: GradebookStudent[] = studentIds.map((sid) => {
    const user = course.enrollments.find((e) => e.userId === sid)!.user;

    const labSets: LabSetGrade[] = course.labSets.map((ls) => {
      const labs: LabScoreCell[] = ls.labs.map((lab) => ({
        labId: lab.id,
        title: lab.title,
        bestScore: bestScoreForLab(submissions, sid, lab.id),
      }));
      const inSet = labs.map((x) => x.bestScore).filter((x): x is number => x != null);
      const setAverage = inSet.length ? inSet.reduce((a, b) => a + b, 0) / inSet.length : null;
      return {
        labSetId: ls.id,
        labSetTitle: ls.title,
        setAverage,
        labs,
      };
    });

    const labs: LabScoreCell[] = labSets.flatMap((g) => g.labs);

    const hwForStudent = course.homeworks.map((h) => {
      const row = hwSubs.find((x) => x.homeworkId === h.id && x.userId === sid);
      return {
        homeworkId: h.id,
        title: h.title,
        score: row?.score ?? null,
        graded: row?.graded ?? false,
      };
    });

    const setMeans = labSets.map((g) => g.setAverage).filter((x): x is number => x != null);
    const labAverage = setMeans.length ? setMeans.reduce((a, b) => a + b, 0) / setMeans.length : null;

    const hwNums = hwForStudent
      .filter((x) => x.graded)
      .map((x) => x.score)
      .filter((x): x is number => x != null);
    const homeworkAverage = hwNums.length ? hwNums.reduce((a, b) => a + b, 0) / hwNums.length : null;
    const totalScore =
      labAverage == null && homeworkAverage == null
        ? null
        : (labAverage ?? 0) * weights.lab + (homeworkAverage ?? 0) * weights.homework;

    return {
      user: { id: user.id, name: user.name, email: user.email },
      labSets,
      labs,
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

  return {
    courseTitle: course.title,
    courseId: course.id,
    students,
    weights,
    labColumnPlan,
    labGradingRule,
    distribution: dist,
  };
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
  const setIds = uniqueLabSetIdsFromPlan(data.labColumnPlan);
  const setTitleById = new Map(data.labColumnPlan.map((c) => [c.labSetId, c.labSetTitle]));
  const headerCells = [
    csvEscape("姓名"),
    csvEscape("邮箱"),
    ...data.labColumnPlan.map((c) => csvEscape(`${c.labSetTitle} / ${c.labTitle}`)),
    ...setIds.map((id) => csvEscape(`实验集均分 ${setTitleById.get(id) ?? id}`)),
    ...first.homework.map((h) => csvEscape(`作业 ${h.title}`)),
    csvEscape("实验总均分"),
    csvEscape("作业均分"),
    csvEscape("总评"),
    csvEscape("排名"),
  ];
  const lines = [headerCells.join(",")];

  for (const row of data.students) {
    const scoreByLab = new Map(row.labs.map((l) => [l.labId, l.bestScore]));
    const setAvgById = new Map(row.labSets.map((g) => [g.labSetId, g.setAverage]));

    const cells = [
      csvEscape(row.user.name),
      csvEscape(row.user.email),
      ...data.labColumnPlan.map((c) =>
        csvEscape(
          scoreByLab.get(c.labId) == null ? "" : String(scoreByLab.get(c.labId)),
        ),
      ),
      ...setIds.map((id) => {
        const v = setAvgById.get(id);
        return csvEscape(v == null ? "" : v.toFixed(2));
      }),
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

/** labColumnPlan 顺序下，按实验集 id 去重且保序 */
function uniqueLabSetIdsFromPlan(plan: Array<{ labSetId: string }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of plan) {
    if (seen.has(p.labSetId)) continue;
    seen.add(p.labSetId);
    out.push(p.labSetId);
  }
  return out;
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
        labColumnPlan: data.labColumnPlan,
        labGradingRule: data.labGradingRule,
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
