/**
 * 实验成绩计算（与 grades 成绩册一致，供 overview / gradebook 共用）
 */

/** 每题取该学生最高分；无提交为 null，得分为 0 时保留 0 */
export function bestScoreForLab(
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

/** 实验集均分 = 集内各题最高分的算术平均（仅统计已有分数的题目） */
export function computeLabSetSetAverage(
  labIds: string[],
  submissions: Array<{ labId: string; userId: string; score: number | null }>,
  userId: string,
): number | null {
  if (labIds.length === 0) return null;
  const scores = labIds
    .map((labId) => bestScoreForLab(submissions, userId, labId))
    .filter((x): x is number => x != null);
  if (scores.length === 0) return null;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** 学生作业均分只统计已批改且已发布的有效分数，避免提前泄露成绩。 */
export function computeReleasedHomeworkAverage(
  submissions: Array<{ score: number | null; graded: boolean; released: boolean }>,
): number | null {
  const scores = submissions
    .filter((submission) => submission.graded && submission.released)
    .map((submission) => submission.score)
    .filter((score): score is number => score != null);
  if (scores.length === 0) return null;
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
