export type MentionMember = { id: string; name: string; isTeacher?: boolean };

export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 从正文中的 @姓名 解析被提及用户 id */
export function parseMentionUserIds(text: string, members: MentionMember[]): string[] {
  const ids = new Set<string>();
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const re = new RegExp(`@${escapeRegExp(m.name)}(?=\\s|$|[，。！？,.!?\\n])`);
    if (re.test(text)) ids.add(m.id);
  }
  return [...ids];
}

export function mergeMentionIds(...lists: (string[] | undefined)[]): string[] {
  return [...new Set(lists.flat().filter(Boolean) as string[])];
}
