import type { CourseUser } from "./course-client.js";
import { combineTotal, type LabGradebook } from "./lab-client.js";
import { prisma } from "./prisma.js";

export type HomeworkRef = { id: string; title: string };
export type SubmissionRef = {
  homeworkId: string;
  userId: string;
  score: number | null;
  graded: boolean;
  released: boolean;
};

export function homeworkAverage(rows: Array<{ score: number | null; graded: boolean }>) {
  const scores = rows.filter((row) => row.graded && row.score != null).map((row) => row.score as number);
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export async function readGradingWeights(courseId: string) {
  const row = await prisma.gradingConfig.findUnique({ where: { courseId } });
  return {
    labWeight: row ? Number(row.labWeight) : 0.5,
    homeworkWeight: row ? Number(row.homeworkWeight) : 0.5,
    version: row?.version ?? 0,
  };
}

export function rosterOrSubmitters(students: CourseUser[], submissions: SubmissionRef[]): CourseUser[] {
  if (students.length) return students;
  return [
    ...new Map(
      submissions.map((row) => [row.userId, { id: row.userId, email: "", name: row.userId, role: "STUDENT" as const }]),
    ).values(),
  ];
}

export function buildGradebookStudents(input: {
  homeworks: HomeworkRef[];
  submissions: SubmissionRef[];
  students: CourseUser[];
  lab: LabGradebook;
  homeworkWeight: number;
  labWeight: number;
}) {
  const students = rosterOrSubmitters(input.students, input.submissions);
  const rows = students.map((student) => {
    const homework = input.homeworks.map((hw) => {
      const sub = input.submissions.find((item) => item.homeworkId === hw.id && item.userId === student.id);
      return {
        homeworkId: hw.id,
        title: hw.title,
        score: sub?.score ?? null,
        graded: Boolean(sub?.graded),
        released: Boolean(sub?.released),
      };
    });
    const hwAvg = homeworkAverage(homework);
    const labAvg =
      input.lab.students.find((item) => item.userId === student.id)?.labAverage ??
      (input.lab.labStatus === "OK" ? input.lab.labAverage : null);
    const total = combineTotal(hwAvg, labAvg ?? null, input.homeworkWeight, input.labWeight, input.lab.labStatus);
    return {
      user: { id: student.id, name: student.name, email: student.email },
      homework,
      summary: {
        homeworkAverage: hwAvg,
        labAverage: total.labAverage,
        labStatus: input.lab.labStatus,
        totalScore: total.totalScore,
        provisionalTotal: total.provisionalTotal,
      },
    };
  });
  rows.sort((a, b) => (b.summary.totalScore ?? -1) - (a.summary.totalScore ?? -1));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}

export function releasedHomeworkGrade(homeworks: HomeworkRef[], submissions: SubmissionRef[], userId: string) {
  const released = homeworks
    .map((hw) => {
      const sub = submissions.find((item) => item.homeworkId === hw.id && item.userId === userId);
      if (!sub?.released) return null;
      return {
        homeworkId: hw.id,
        title: hw.title,
        score: sub.score,
        graded: Boolean(sub.graded),
        released: true,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
  return {
    homeworks: released,
    homeworkAverage: homeworkAverage(released),
  };
}
