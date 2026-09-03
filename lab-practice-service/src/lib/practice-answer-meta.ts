import type { PracticeAnswerSource, PracticeQuestion } from "@lab/prisma-client-v2";

export const AI_ANSWER_DISCLAIMER = "AI提供，仅供参考";

export function answerSourceLabel(
  source: PracticeAnswerSource,
  confirmed: boolean,
): string | null {
  if (source === "TEACHER" && confirmed) return "教师提供";
  if (source === "AI" && !confirmed) return AI_ANSWER_DISCLAIMER;
  if (source === "AI" && confirmed) return "教师确认（原 AI 建议）";
  return null;
}

export function pickAnswerMetaForCreate(opts: {
  answerSource?: PracticeAnswerSource;
  answerFromDocument?: boolean;
  teacherProvidedAnswer: boolean;
}): { answerSource: PracticeAnswerSource; answerConfirmed: boolean } {
  if (opts.teacherProvidedAnswer || opts.answerFromDocument) {
    return { answerSource: "TEACHER", answerConfirmed: true };
  }
  if (opts.answerSource === "AI") {
    return { answerSource: "AI", answerConfirmed: false };
  }
  return { answerSource: "TEACHER", answerConfirmed: true };
}

export function serializeAnswerMeta(q: Pick<PracticeQuestion, "answerSource" | "answerConfirmed">) {
  return {
    answerSource: q.answerSource,
    answerConfirmed: q.answerConfirmed,
    answerLabel: answerSourceLabel(q.answerSource, q.answerConfirmed),
  };
}
