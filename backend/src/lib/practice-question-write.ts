import type {
  PracticeAnswerSource,
  PracticeDifficulty,
  PracticeQuestion,
  PracticeQuestionType,
} from "@prisma/client";
import { prisma } from "./prisma.js";
import { pickAnswerMetaForCreate } from "./practice-answer-meta.js";
import { generateAnswerForQuestion } from "./practice-import-ai.js";

export function isAnswerProvided(answer: unknown): boolean {
  if (answer == null) return false;
  if (typeof answer === "object") {
    const o = answer as Record<string, unknown>;
    if ("choiceId" in o && String(o.choiceId ?? "").trim()) return true;
    if ("blanks" in o && Array.isArray(o.blanks) && o.blanks.some((b) => String(b).trim())) return true;
    if ("text" in o && String(o.text ?? "").trim()) return true;
    if ("cases" in o && Array.isArray(o.cases) && o.cases.length > 0) return true;
    return false;
  }
  return String(answer).trim().length > 0;
}

export async function resolveQuestionContent(input: {
  type: PracticeQuestionType;
  stem: string;
  options?: { id: string; text: string }[];
  answer?: unknown;
  explanation?: string;
  answerSource?: PracticeAnswerSource;
  answerFromDocument?: boolean;
}): Promise<{
  answerJson: string;
  explanation: string;
  answerSource: PracticeAnswerSource;
  answerConfirmed: boolean;
}> {
  const teacherProvided = isAnswerProvided(input.answer);
  let answer = input.answer;
  let explanation = input.explanation?.trim() ?? "";
  let meta = pickAnswerMetaForCreate({
    teacherProvidedAnswer: teacherProvided,
    answerFromDocument: input.answerFromDocument,
    answerSource: input.answerSource,
  });

  if (!teacherProvided) {
    const gen = await generateAnswerForQuestion({
      type: input.type,
      stem: input.stem,
      options: input.options,
    });
    answer = gen.answer;
    if (!explanation) explanation = gen.explanation;
    meta = { answerSource: "AI", answerConfirmed: false };
  }

  if (!explanation) explanation = "（待教师补充解析）";

  return {
    answerJson: JSON.stringify(answer),
    explanation,
    ...meta,
  };
}

export async function createPracticeQuestionRecord(data: {
  courseId: string;
  type: PracticeQuestionType;
  stem: string;
  options?: { id: string; text: string }[];
  answer?: unknown;
  explanation?: string;
  tagPath: string;
  difficulty?: PracticeDifficulty;
  language?: string;
  createdById?: string;
  answerSource?: PracticeAnswerSource;
  answerFromDocument?: boolean;
}): Promise<PracticeQuestion> {
  const resolved = await resolveQuestionContent(data);
  return prisma.practiceQuestion.create({
    data: {
      courseId: data.courseId,
      type: data.type,
      stem: data.stem,
      optionsJson: data.options ? JSON.stringify(data.options) : null,
      answerJson: resolved.answerJson,
      explanation: resolved.explanation,
      answerSource: resolved.answerSource,
      answerConfirmed: resolved.answerConfirmed,
      tagPath: data.tagPath,
      difficulty: data.difficulty ?? "MEDIUM",
      language: data.language,
      createdById: data.createdById,
      auditStatus: resolved.answerConfirmed ? "APPROVED" : "PENDING_REVIEW",
    },
  });
}
