import { createHash } from "node:crypto";
import { prisma } from "./prisma.js";

export type HomeworkWrongBookItem = { title: string; content: string };
export type SaveHomeworkWrongBookInput = {
  userId: string;
  courseId: string;
  homeworkId: string;
  entries: HomeworkWrongBookItem[];
};
export type SavedWrongBookEntry = { id: string; title: string; content: string; created: boolean };

export function deduplicateWrongBookItems(entries: HomeworkWrongBookItem[]): HomeworkWrongBookItem[] {
  const byTitle = new Map<string, HomeworkWrongBookItem>();
  for (const item of entries) {
    const title = item.title.trim();
    byTitle.set(title, { title, content: item.content.trim() });
  }
  return [...byTitle.values()];
}

export function homeworkWrongBookSourceKey(userId: string, homeworkId: string, title: string): string {
  return createHash("sha256").update(`${userId}\0${homeworkId}\0${title}`).digest("hex");
}

export async function saveHomeworkWrongBookEntries(
  input: SaveHomeworkWrongBookInput,
): Promise<SavedWrongBookEntry[]> {
  return prisma.$transaction(async (tx) => {
    const saved: SavedWrongBookEntry[] = [];
    for (const item of deduplicateWrongBookItems(input.entries)) {
      const sourceKey = homeworkWrongBookSourceKey(input.userId, input.homeworkId, item.title);
      const existing = await tx.wrongBookEntry.findUnique({ where: { sourceKey }, select: { id: true } });
      const row = await tx.wrongBookEntry.upsert({
        where: { sourceKey },
        create: {
          userId: input.userId,
          courseId: input.courseId,
          homeworkId: input.homeworkId,
          sourceKey,
          title: item.title,
          content: item.content,
        },
        update: { courseId: input.courseId, content: item.content },
        select: { id: true, title: true, content: true },
      });
      saved.push({ ...row, created: existing == null });
    }
    return saved;
  });
}
