import type { PracticeDifficulty, PracticeQuestion, PracticeSessionMode } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function pickQuestionsForSession(opts: {
  courseId: string;
  userId: string;
  mode: PracticeSessionMode;
  count: number;
  tagPath?: string;
  difficulty?: PracticeDifficulty;
  tagPrefix?: string;
}): Promise<PracticeQuestion[]> {
  const baseWhere = {
    courseId: opts.courseId,
    auditStatus: "APPROVED" as const,
  };

  if (opts.mode === "WRONG_BOOK") {
    const wrong = await prisma.wrongBookEntry.findMany({
      where: {
        userId: opts.userId,
        courseId: opts.courseId,
        mastered: false,
        practiceQuestionId: { not: null },
      },
      take: opts.count * 3,
    });
    const ids = wrong.map((w) => w.practiceQuestionId!).filter(Boolean);
    if (ids.length === 0) return [];
    const qs = await prisma.practiceQuestion.findMany({
      where: { id: { in: ids }, ...baseWhere },
    });
    return shuffle(qs).slice(0, opts.count);
  }

  if (opts.mode === "BY_TAG" && opts.tagPath) {
    return prisma.practiceQuestion.findMany({
      where: { ...baseWhere, tagPath: { startsWith: opts.tagPath } },
      take: opts.count * 5,
      orderBy: { attemptCount: "asc" },
    }).then((rows) => shuffle(rows).slice(0, opts.count));
  }

  const where: Record<string, unknown> = { ...baseWhere };
  if (opts.difficulty) where.difficulty = opts.difficulty;
  if (opts.tagPrefix) where.tagPath = { startsWith: opts.tagPrefix };

  if (opts.mode === "SMART") {
    const weak = await prisma.practiceSessionItem.findMany({
      where: {
        session: { userId: opts.userId, courseId: opts.courseId },
        correct: false,
      },
      include: { question: { select: { tagPath: true } } },
      take: 50,
      orderBy: { createdAt: "desc" },
    });
    const tagCounts = new Map<string, number>();
    for (const w of weak) {
      const t = w.question.tagPath.split(" > ")[0] ?? w.question.tagPath;
      tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const weakTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const picked: PracticeQuestion[] = [];
    for (const tag of weakTags) {
      if (picked.length >= opts.count) break;
      const batch = await prisma.practiceQuestion.findMany({
        where: { ...baseWhere, tagPath: { startsWith: tag } },
        take: 5,
        orderBy: [{ correctCount: "asc" }, { attemptCount: "desc" }],
      });
      for (const q of shuffle(batch)) {
        if (picked.length >= opts.count) break;
        if (!picked.some((p) => p.id === q.id)) picked.push(q);
      }
    }
    if (picked.length < opts.count) {
      const more = await prisma.practiceQuestion.findMany({
        where: baseWhere,
        take: opts.count * 3,
      });
      for (const q of shuffle(more)) {
        if (picked.length >= opts.count) break;
        if (!picked.some((p) => p.id === q.id)) picked.push(q);
      }
    }
    return picked.slice(0, opts.count);
  }

  const pool = await prisma.practiceQuestion.findMany({
    where,
    take: opts.count * 5,
  });
  return shuffle(pool).slice(0, opts.count);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function serializeQuestionForStudent(q: PracticeQuestion, hideAnswer: boolean) {
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.optionsJson ? JSON.parse(q.optionsJson) : null,
    tagPath: q.tagPath,
    difficulty: q.difficulty,
    language: q.language,
    attemptCount: q.attemptCount,
    correctRate: q.attemptCount > 0 ? q.correctCount / q.attemptCount : null,
    explanation: hideAnswer ? undefined : q.explanation,
    answer: hideAnswer ? undefined : undefined,
  };
}

export function serializeQuestionForTeacher(q: PracticeQuestion) {
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.optionsJson ? JSON.parse(q.optionsJson) : null,
    answer: JSON.parse(q.answerJson),
    explanation: q.explanation,
    tagPath: q.tagPath,
    difficulty: q.difficulty,
    language: q.language,
    attemptCount: q.attemptCount,
    correctCount: q.correctCount,
    correctRate: q.attemptCount > 0 ? q.correctCount / q.attemptCount : null,
    avgTimeMs: q.attemptCount > 0 ? Math.round(q.totalTimeMs / q.attemptCount) : null,
    auditStatus: q.auditStatus,
    createdAt: q.createdAt.toISOString(),
    updatedAt: q.updatedAt.toISOString(),
  };
}
