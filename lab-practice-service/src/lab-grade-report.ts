import { prisma } from "./prisma.js";

export type LabGradePlan = Array<{
  id: string;
  title: string;
  labs: Array<{ id: string; title: string }>;
}>;

export type LabGradeSubmission = { labId: string; userId: string; score: number | null };

export type LabGradeReport = {
  userId: string;
  labAverage: number | null;
  labSets: Array<{
    labSetId: string;
    title: string;
    average: number | null;
    labs: Array<{ labId: string; title: string; bestScore: number | null }>;
  }>;
};

export const labGradeRule =
  "实验总均分 = 各实验集均分的算术平均；实验集均分 = 集内各实验最高分的算术平均，仅统计已有分数。";

function bestScoreForLab(
  submissions: LabGradeSubmission[],
  userId: string,
  labId: string,
): number | null {
  const scores = submissions
    .filter((item) => item.userId === userId && item.labId === labId)
    .map((item) => item.score)
    .filter((score): score is number => score != null);
  return scores.length ? Math.max(...scores) : null;
}

export function buildLabGradeReports(
  userIds: string[],
  plan: LabGradePlan,
  submissions: LabGradeSubmission[],
): LabGradeReport[] {
  return userIds.map((userId) => {
    const labSets = plan.map((set) => {
      const labs = set.labs.map((lab) => ({
        labId: lab.id,
        title: lab.title,
        bestScore: bestScoreForLab(submissions, userId, lab.id),
      }));
      const scores = labs.map((lab) => lab.bestScore).filter((score): score is number => score != null);
      return {
        labSetId: set.id,
        title: set.title,
        average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
        labs,
      };
    });
    const setScores = labSets.map((set) => set.average).filter((score): score is number => score != null);
    return {
      userId,
      labAverage: setScores.length ? setScores.reduce((sum, score) => sum + score, 0) / setScores.length : null,
      labSets,
    };
  });
}

export async function loadLabGradeReports(
  courseId: string,
  requestedUserIds: string[],
): Promise<LabGradeReport[]> {
  const userIds = [...new Set(requestedUserIds)];
  if (!userIds.length) return [];
  const [sets, submissions] = await Promise.all([
    prisma.labSet.findMany({
      where: { courseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, title: true, labs: { orderBy: { title: "asc" }, select: { id: true, title: true } } },
    }),
    prisma.submission.findMany({
      where: { userId: { in: userIds }, lab: { courseId } },
      select: { labId: true, userId: true, score: true },
    }),
  ]);
  return buildLabGradeReports(userIds, sets, submissions);
}
