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

function splitTagPath(path: string): string[] {
  return path
    .split(/\s*>\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 题目 tagPath 与筛选标签是否相关：
 * - 精确相等；筛选标签为题目路径前缀（父级）；
 * - 筛选标签为路径中的任意一段（如题目「数据库 > ER图」可匹配筛选「ER图」）。
 */
export function tagPathRelates(questionPath: string, filterTag: string): boolean {
  const q = questionPath.trim();
  const f = filterTag.trim();
  if (!f) return false;
  if (q === f) return true;
  if (q.startsWith(`${f} >`)) return true;
  const qSegs = splitTagPath(q);
  const fSegs = splitTagPath(f);
  if (fSegs.length === 1 && qSegs.includes(f)) return true;
  if (fSegs.length > 1 && (q === f || q.startsWith(`${f} >`))) return true;
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

export function parseTagFilterQuery(query: {
  tagMode?: string;
  tags?: string | string[];
}): { mode: PracticeTagMatchMode; tags: string[] } | null {
  const raw = query.tags;
  const tags = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((t) => String(t).trim())
    .filter(Boolean);
  if (tags.length === 0) return null;
  const mode = (query.tagMode ?? "INCLUDE_ANY") as PracticeTagMatchMode;
  if (!PRACTICE_TAG_MATCH_MODES.includes(mode)) return { mode: "INCLUDE_ANY", tags };
  return { mode, tags };
}
