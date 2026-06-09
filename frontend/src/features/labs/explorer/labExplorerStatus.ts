import type { LabSetOverviewProgress, StudentLabSetOverviewCard } from "../labSetTypes";

export type LabGridTone = "gray" | "yellow" | "green" | "red";

export type LabProblemGridStatus = "NONE" | "AC" | "WA";

/** 实验集（每次作业）卡片：未做灰 / 部分黄 / 全过绿 */
export function labSetGridTone(card: {
  completed: boolean;
  progress: LabSetOverviewProgress;
}): Exclude<LabGridTone, "red"> {
  if (card.completed) return "green";
  if (card.progress.attempted > 0) return "yellow";
  return "gray";
}

/** 单题卡片：未做灰 / WA 红 / AC 绿 */
export function labProblemGridTone(status: LabProblemGridStatus): LabGridTone {
  if (status === "AC") return "green";
  if (status === "WA") return "red";
  return "gray";
}

export function formatLabExplorerDateRange(
  startAt: string | null | undefined,
  dueAt: string | null | undefined,
): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}-${day}`;
  };
  if (startAt && dueAt) return `${fmt(startAt)} ~ ${fmt(dueAt)}`;
  if (dueAt) return `~ ${fmt(dueAt)}`;
  if (startAt) return `${fmt(startAt)} ~`;
  return "不限时";
}

export function formatLabExplorerScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "—";
  return String(Math.round(score));
}

export function labSetStatusLabel(tone: Exclude<LabGridTone, "red">): string {
  if (tone === "green") return "已全部通过";
  if (tone === "yellow") return "进行中";
  return "未开始";
}

export function labProblemStatusLabel(status: LabProblemGridStatus): string {
  if (status === "AC") return "AC";
  if (status === "WA") return "WA";
  return "未做";
}

function labSetRecencyMs(card: StudentLabSetOverviewCard): number {
  const iso = card.dueAt ?? card.startAt;
  return iso ? new Date(iso).getTime() : 0;
}

/** 未完成在前；已完成自动靠后；同组内较新的在前 */
export function sortLabSetsForDisplay(
  sets: StudentLabSetOverviewCard[],
): StudentLabSetOverviewCard[] {
  return [...sets].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ta = labSetRecencyMs(a);
    const tb = labSetRecencyMs(b);
    if (ta !== tb) return tb - ta;
    if (a.sortOrder !== b.sortOrder) return b.sortOrder - a.sortOrder;
    return a.title.localeCompare(b.title, "zh-CN");
  });
}

export function groupSetsByCourse(
  groups: Array<{ items: StudentLabSetOverviewCard[] }>,
): Array<{ courseId: string; courseTitle: string; sets: StudentLabSetOverviewCard[] }> {
  const map = new Map<string, { courseId: string; courseTitle: string; sets: StudentLabSetOverviewCard[] }>();
  for (const g of groups) {
    for (const item of g.items) {
      const cur =
        map.get(item.courseId) ??
        { courseId: item.courseId, courseTitle: item.courseTitle, sets: [] };
      cur.sets.push(item);
      map.set(item.courseId, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.courseTitle.localeCompare(b.courseTitle, "zh-CN"));
}
