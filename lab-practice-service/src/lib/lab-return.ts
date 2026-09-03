import { prisma } from "./prisma.js";

/** 统计某题被教师打回的次数（含当前待重做） */
export async function countLabReturns(labId: string, userId: string): Promise<number> {
  return prisma.submission.count({
    where: { labId, userId, returnedAt: { not: null } },
  });
}

export async function getLatestSubmission(labId: string, userId: string) {
  return prisma.submission.findFirst({
    where: { labId, userId },
    orderBy: { createdAt: "desc" },
  });
}

/** 打回后重做前检查次数上限 */
export async function assertReturnQuota(
  labId: string,
  userId: string,
  maxReturnCount: number | null | undefined,
): Promise<void> {
  const latest = await getLatestSubmission(labId, userId);
  if (!latest?.returnReason) return;
  if (maxReturnCount == null) return;
  const n = await countLabReturns(labId, userId);
  if (n >= maxReturnCount) {
    throw new Error(`已达最大打回次数（${maxReturnCount}），请联系教师`);
  }
}


