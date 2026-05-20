export const PRACTICE_TAG_MATCH_MODES = [
  "INCLUDE_ALL",
  "INCLUDE_ANY",
  "EXCLUDE_ANY",
  "EXCLUDE_ALL",
] as const;

export type PracticeTagMatchMode = (typeof PRACTICE_TAG_MATCH_MODES)[number];

export const PRACTICE_TAG_MATCH_LABELS: Record<PracticeTagMatchMode, string> = {
  INCLUDE_ALL: "同时选择",
  INCLUDE_ANY: "任意选择",
  EXCLUDE_ANY: "排除任意选中选项",
  EXCLUDE_ALL: "排除同时满足所有标签",
};

export const PRACTICE_TAG_MATCH_HINTS: Record<PracticeTagMatchMode, string> = {
  INCLUDE_ALL: "题目须同时关联已选的全部标签（含下级路径）",
  INCLUDE_ANY: "题目关联已选标签中的任意一个即可",
  EXCLUDE_ANY: "排除关联了已选标签中任意一个的题目",
  EXCLUDE_ALL: "排除同时关联已选全部标签的题目",
};

function splitTagPath(path: string): string[] {
  return path
    .split(/\s*>\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function tagPathRelates(questionPath: string, filterTag: string): boolean {
  const q = questionPath.trim();
  const f = filterTag.trim();
  if (!f) return false;
  if (q === f) return true;
  if (q.startsWith(`${f} >`)) return true;
  const qSegs = splitTagPath(q);
  if (splitTagPath(f).length === 1 && qSegs.includes(f)) return true;
  if (f.includes(" > ") && (q === f || q.startsWith(`${f} >`))) return true;
  return false;
}

export function matchesTagFilter(
  questionTagPath: string,
  selectedTags: string[],
  mode: PracticeTagMatchMode,
): boolean {
  if (selectedTags.length === 0) return true;
  const rel = (t: string) => tagPathRelates(questionTagPath, t);
  switch (mode) {
    case "INCLUDE_ALL":
      return selectedTags.every(rel);
    case "INCLUDE_ANY":
      return selectedTags.some(rel);
    case "EXCLUDE_ANY":
      return !selectedTags.some(rel);
    case "EXCLUDE_ALL":
      return !selectedTags.every(rel);
    default:
      return true;
  }
}

export function filterByTagRules<T extends { tagPath: string }>(
  items: T[],
  selectedTags: string[],
  mode: PracticeTagMatchMode,
): T[] {
  if (selectedTags.length === 0) return items;
  return items.filter((q) => matchesTagFilter(q.tagPath, selectedTags, mode));
}
