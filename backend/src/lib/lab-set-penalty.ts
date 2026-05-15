/**
 * 实验集罚时规则（与《拓展.md》ICPC 思路对齐，便于前后端一致展示）
 *
 * - 计时起点 penaltyStartAt：当前使用 LabSet.createdAt（实验集创建时刻）。
 * - 对「某学生 × 某题」：按提交时间升序，找到首次 AC；在其之前每次 WRONG_ANSWER / ERROR / TIMEOUT 记一次罚分。
 * - 单题罚时分 = max(0, floor((firstAC - penaltyStartAt) / 60000)) + wrongSubmissionPenaltyMinutes × wrongBeforeFirstAC
 * - 总罚时 = 所有「已 AC 题目」的单题罚时分之和。
 * - 未 AC 的题目：不计入总罚时；allSolved = 每题均至少有一次 AC。
 */
export const WRONG_SUBMISSION_PENALTY_MINUTES = 20;

const FAIL: ReadonlySet<string> = new Set(["WRONG_ANSWER", "ERROR", "TIMEOUT"]);

export type UserLabPenaltyRow = {
  labId: string;
  title: string;
  solved: boolean;
  bestScore: number | null;
  lastStatus: string;
  lastSubmitAt: string | null;
  wrongBeforeFirstAc: number;
  firstAcAt: string | null;
  problemPenaltyMinutes: number;
};

export function analyzeSubmissionsForLabSet(opts: {
  penaltyStartMs: number;
  labIds: string[];
  labTitles: Map<string, string>;
  submissions: Array<{
    labId: string;
    userId: string;
    status: string;
    score: number | null;
    createdAt: Date;
  }>;
  userId: string;
}): {
  allSolved: boolean;
  totalPenaltyMinutes: number;
  lastSubmitAt: string | null;
  labs: UserLabPenaltyRow[];
} {
  const { penaltyStartMs, labIds, labTitles, submissions, userId } = opts;
  const userSubs = submissions.filter((s) => s.userId === userId);
  let lastTs: number | null = null;
  for (const s of userSubs) {
    const t = s.createdAt.getTime();
    if (lastTs == null || t > lastTs) lastTs = t;
  }

  const labs: UserLabPenaltyRow[] = [];
  let totalPenalty = 0;
  let solvedCount = 0;

  for (const labId of labIds) {
    const list = userSubs
      .filter((s) => s.labId === labId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let wrongBefore = 0;
    let firstAc: Date | null = null;
    for (const s of list) {
      if (s.status === "ACCEPTED") {
        firstAc = s.createdAt;
        break;
      }
      if (FAIL.has(s.status)) wrongBefore += 1;
    }

    const scores = list.map((s) => s.score).filter((x): x is number => x != null);
    const bestScore = scores.length ? Math.max(...scores) : null;
    const last = list.length ? list[list.length - 1] : null;

    let problemPenalty = 0;
    let solved = false;
    if (firstAc) {
      solved = true;
      solvedCount += 1;
      const acPart = Math.max(0, Math.floor((firstAc.getTime() - penaltyStartMs) / 60000));
      problemPenalty = acPart + WRONG_SUBMISSION_PENALTY_MINUTES * wrongBefore;
      totalPenalty += problemPenalty;
    }

    labs.push({
      labId,
      title: labTitles.get(labId) ?? "",
      solved,
      bestScore,
      lastStatus: last?.status ?? "—",
      lastSubmitAt: last ? last.createdAt.toISOString() : null,
      wrongBeforeFirstAc: wrongBefore,
      firstAcAt: firstAc ? firstAc.toISOString() : null,
      problemPenaltyMinutes: solved ? problemPenalty : 0,
    });
  }

  const allSolved = labIds.length > 0 && solvedCount === labIds.length;

  return {
    allSolved,
    totalPenaltyMinutes: totalPenalty,
    lastSubmitAt: lastTs != null ? new Date(lastTs).toISOString() : null,
    labs,
  };
}
