import { prisma } from "./prisma.js";
import { bestScoreForLab, computeLabSetSetAverage } from "./lab-grades.js";

export type LabGradePlan = Array<{
  id: string;
  title: string;
  labs: Array<{ id: string; title: string }>;
}>;

export type LabGradeSubmission = {
  labId: string;
  userId: string;
  score: number | null;
};

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

export function buildLabGradeReports(
  userIds: string[],
  plan: LabGradePlan,
  submissions: LabGradeSubmission[],
): LabGradeReport[] {
  return userIds.map((userId) => {
    const labSets = plan.map((labSet) => ({
      labSetId: labSet.id,
      title: labSet.title,
      average: computeLabSetSetAverage(
        labSet.labs.map((lab) => lab.id),
        submissions,
        userId,
      ),
      labs: labSet.labs.map((lab) => ({
        labId: lab.id,
        title: lab.title,
        bestScore: bestScoreForLab(submissions, userId, lab.id),
      })),
    }));
    const setAverages = labSets
      .map((labSet) => labSet.average)
      .filter((score): score is number => score != null);

    return {
      userId,
      labAverage:
        setAverages.length > 0
          ? setAverages.reduce((sum, score) => sum + score, 0) / setAverages.length
          : null,
      labSets,
    };
  });
}

export async function loadLabGradeReports(
  courseId: string,
  requestedUserIds: string[],
): Promise<LabGradeReport[]> {
  const userIds = [...new Set(requestedUserIds)];
  if (userIds.length === 0) return [];

  const [labSets, submissions] = await Promise.all([
    prisma.labSet.findMany({
      where: { courseId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        labs: {
          orderBy: { title: "asc" },
          select: { id: true, title: true },
        },
      },
    }),
    prisma.submission.findMany({
      where: { userId: { in: userIds }, lab: { courseId } },
      select: { labId: true, userId: true, score: true },
    }),
  ]);

  return buildLabGradeReports(userIds, labSets, submissions);
}
