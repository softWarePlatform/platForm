import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";

export type HomeworkWrongBookItem = {
  title: string;
  content: string;
};

export type SaveHomeworkWrongBookInput = {
  userId: string;
  courseId: string;
  homeworkId: string;
  entries: HomeworkWrongBookItem[];
};

export type SavedWrongBookEntry = {
  id: string;
  title: string;
  content: string;
  created: boolean;
};

/** 同一请求内标题相同的条目只写一次，以最后一个内容为准。 */
export function deduplicateWrongBookItems(
  entries: HomeworkWrongBookItem[],
): HomeworkWrongBookItem[] {
  const byTitle = new Map<string, HomeworkWrongBookItem>();
  for (const entry of entries) {
    const title = entry.title.trim();
    byTitle.set(title, { title, content: entry.content.trim() });
  }
  return [...byTitle.values()];
}

export function homeworkWrongBookSourceKey(
  userId: string,
  homeworkId: string,
  title: string,
): string {
  return createHash("sha256").update(`${userId}\0${homeworkId}\0${title}`).digest("hex");
}

/**
 * Homework 服务写入错题的唯一数据入口。
 * 重复投递时更新原记录，不制造重复数据，也不重置用户的 mastered 状态。
 */
export async function saveHomeworkWrongBookEntries(
  input: SaveHomeworkWrongBookInput,
): Promise<SavedWrongBookEntry[]> {
  const entries = deduplicateWrongBookItems(input.entries);

  return prisma.$transaction(async (tx) => {
    const saved: SavedWrongBookEntry[] = [];
    for (const entry of entries) {
      const sourceKey = homeworkWrongBookSourceKey(input.userId, input.homeworkId, entry.title);
      const existing = await tx.wrongBookEntry.findUnique({
        where: { sourceKey },
        select: { id: true },
      });

      const row = await tx.wrongBookEntry.upsert({
        where: { sourceKey },
        create: {
          userId: input.userId,
          courseId: input.courseId,
          homeworkId: input.homeworkId,
          sourceKey,
          title: entry.title,
          content: entry.content,
        },
        update: { courseId: input.courseId, content: entry.content },
        select: { id: true, title: true, content: true },
      });
      saved.push({ ...row, created: existing == null });
    }
    return saved;
  });
}
