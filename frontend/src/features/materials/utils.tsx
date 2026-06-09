import type { ReactNode } from "react";

export const FILE_TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "slides", label: "课件" },
  { value: "document", label: "文档" },
  { value: "video", label: "视频" },
  { value: "code", label: "代码" },
  { value: "image", label: "图片" },
  { value: "archive", label: "压缩包" },
];

export const VISIBILITY_LABEL: Record<string, string> = {
  ALL: "全班可见",
  CLASS: "指定班级",
  TEACHER_ONLY: "仅教师",
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function highlightText(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const qi = lower.indexOf(q.toLowerCase());
  if (qi < 0) return text;
  const before = text.slice(0, qi);
  const match = text.slice(qi, qi + q.length);
  const after = text.slice(qi + q.length);
  return (
    <>
      {before}
      <mark className="search-hit">{match}</mark>
      {highlightText(after, q)}
    </>
  );
}

export function childFolders(folders: string[], current: string): string[] {
  const prefix = current ? `${current}/` : "";
  const set = new Set<string>();
  for (const f of folders) {
    if (!f) continue;
    if (current) {
      if (f === current) continue;
      if (!f.startsWith(prefix)) continue;
    }
    const rest = current ? f.slice(prefix.length) : f;
    const seg = rest.split("/")[0];
    if (!seg) continue;
    set.add(current ? `${current}/${seg}` : seg);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "zh-CN"));
}
