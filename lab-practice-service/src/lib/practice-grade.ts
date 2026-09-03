import type { PracticeQuestion, PracticeQuestionType } from "@lab/prisma-client-v2";
import { normalizePracticeOutput, runPracticeCode } from "./practice-runner.js";

export type GradeResult = {
  correct: boolean;
  score: number;
  maxScore: number;
  detail: Record<string, unknown>;
};

function normText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseAnswerJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export async function gradePracticeAnswer(
  question: Pick<PracticeQuestion, "type" | "answerJson" | "language">,
  answerJson: string | null,
): Promise<GradeResult> {
  const maxScore = 1;
  if (!answerJson?.trim()) {
    return { correct: false, score: 0, maxScore, detail: { reason: "未作答" } };
  }

  const student = parseAnswerJson(answerJson);
  const expected = parseAnswerJson(question.answerJson);

  switch (question.type as PracticeQuestionType) {
    case "CHOICE": {
      const ok = String(student) === String((expected as { choiceId?: string })?.choiceId ?? expected);
      return {
        correct: ok,
        score: ok ? 1 : 0,
        maxScore,
        detail: { expected: (expected as { choiceId?: string })?.choiceId ?? expected, yours: student },
      };
    }
    case "FILL": {
      const exp = (expected as { blanks?: string[] })?.blanks ?? [String(expected)];
      const got = (student as { blanks?: string[] })?.blanks ?? [String(student)];
      const ok =
        exp.length === got.length && exp.every((e, i) => normText(e) === normText(got[i] ?? ""));
      return { correct: ok, score: ok ? 1 : 0, maxScore, detail: { expected: exp, yours: got } };
    }
    case "SHORT_ANSWER": {
      const expText = normText(
        typeof expected === "object" && expected && "text" in expected
          ? String((expected as { text: string }).text)
          : String(expected),
      );
      const gotText = normText(
        typeof student === "object" && student && "text" in student
          ? String((student as { text: string }).text)
          : String(student),
      );
      const ok =
        expText.length > 0 &&
        gotText.length > 0 &&
        (expText === gotText || gotText.includes(expText) || expText.includes(gotText));
      return {
        correct: ok,
        score: ok ? 1 : 0.5,
        maxScore,
        detail: { note: ok ? "匹配参考答案" : "与参考答案差异较大，建议教师复核", expected: expText, yours: gotText },
      };
    }
    case "CODE": {
      const exp = expected as {
        language?: string;
        cases?: { input: string; expected: string }[];
      };
      const code =
        typeof student === "object" && student && "code" in student
          ? String((student as { code: string }).code)
          : String(student);
      const lang = (exp.language ?? question.language ?? "javascript") as "javascript" | "python";
      const cases = exp.cases ?? [];
      const caseResults: { input: string; expected: string; got: string; pass: boolean }[] = [];
      let passAll = true;
      for (const c of cases) {
        const run = await runPracticeCode({
          language: lang === "python" ? "python" : "javascript",
          code,
          stdin: c.input,
          timeoutMs: 5000,
        });
        const got = run.timedOut ? "[TIMEOUT]" : normalizePracticeOutput(run.stdout);
        const pass = !run.timedOut && got === normalizePracticeOutput(c.expected);
        if (!pass) passAll = false;
        caseResults.push({ input: c.input, expected: c.expected, got, pass });
      }
      const ratio = cases.length ? caseResults.filter((r) => r.pass).length / cases.length : 0;
      return {
        correct: passAll,
        score: ratio,
        maxScore,
        detail: { cases: caseResults },
      };
    }
    default:
      return { correct: false, score: 0, maxScore, detail: { reason: "未知题型" } };
  }
}
