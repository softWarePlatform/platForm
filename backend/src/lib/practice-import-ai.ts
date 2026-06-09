import type { PracticeAnswerSource, PracticeDifficulty, PracticeQuestionType } from "@prisma/client";
import { PLATFORM_AI_ENV_HINT } from "./platform-llm.js";
import { heuristicExtractQuestions } from "./practice-heuristic-import.js";
import { extractJsonFromLlm, practiceLlmChat } from "./practice-llm.js";

export type ParsedPracticeDraft = {
  type: PracticeQuestionType;
  stem: string;
  options?: { id: string; text: string }[];
  answer: unknown;
  explanation: string;
  answerSource: PracticeAnswerSource;
  answerFromDocument: boolean;
  difficulty: PracticeDifficulty;
};

const EXTRACT_SYSTEM = `你是高校题库录入助手。从教师上传的试卷/习题文档纯文本中识别独立题目。
只输出 JSON 对象，不要 markdown。格式：
{"questions":[{"type":"CHOICE|FILL|SHORT_ANSWER|CODE","stem":"题干","options":[{"id":"a","text":"..."}],"answer":null或标准答案对象,"answerFromDocument":true/false,"explanation":"解析或空字符串","difficulty":"EASY|MEDIUM|HARD"}]}

规则：
- type=CHOICE 时 options 必填；answer 可为 {"choiceId":"a"} 或 null
- type=FILL 时 answer 可为 {"blanks":["x"]} 或 null
- type=SHORT_ANSWER 时 answer 可为 {"text":"..."} 或 null
- type=CODE 时 answer 可为 {"language":"python","cases":[{"input":"1\\n2\\n","expected":"3"}]} 或 null
- answerFromDocument：仅当文档中明确给出该题答案时为 true
- 不要编造文档中不存在的题目；最多 50 题`;

export async function extractQuestionsFromDocumentText(
  documentText: string,
  defaultTagPath: string,
): Promise<{ drafts: ParsedPracticeDraft[]; notice?: string }> {
  const user = `默认知识点标签（录入时由教师指定，此处可忽略）：${defaultTagPath}

【文档正文】
${documentText.slice(0, 80_000)}`;

  const llm = await practiceLlmChat(EXTRACT_SYSTEM, user, 8192);
  if (llm.source !== "llm") {
    const heuristic = heuristicExtractQuestions(documentText);
    if (heuristic.length > 0) {
      const enriched = await fillMissingAnswers(heuristic);
      return {
        drafts: enriched,
        notice: llm.fallbackReason
          ? `（大模型不可用，已使用简易规则识题：${llm.fallbackReason.slice(0, 200)}）${PLATFORM_AI_ENV_HINT}`
          : `（未配置大模型，已使用简易规则识题）${PLATFORM_AI_ENV_HINT}`,
      };
    }
    return {
      drafts: [],
      notice: llm.fallbackReason
        ? `识题失败：${llm.fallbackReason.slice(0, 240)}。${PLATFORM_AI_ENV_HINT}`
        : `无法识题。${PLATFORM_AI_ENV_HINT}`,
    };
  }

  try {
    const parsed = extractJsonFromLlm(llm.content) as { questions?: unknown[] };
    const rawList = Array.isArray(parsed.questions) ? parsed.questions : [];
    const drafts: ParsedPracticeDraft[] = [];

    for (const item of rawList.slice(0, 50)) {
      const d = normalizeDraftItem(item);
      if (d) drafts.push(d);
    }

    const enriched = await fillMissingAnswers(drafts);
    return { drafts: enriched, notice: enriched.length === 0 ? "未识别到有效题目" : undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { drafts: [], notice: `题目解析失败：${msg}` };
  }
}

function normalizeDraftItem(item: unknown): ParsedPracticeDraft | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  const type = o.type;
  if (type !== "CHOICE" && type !== "FILL" && type !== "SHORT_ANSWER" && type !== "CODE") return null;
  const stem = typeof o.stem === "string" ? o.stem.trim() : "";
  if (!stem) return null;

  const difficulty =
    o.difficulty === "EASY" || o.difficulty === "HARD" ? o.difficulty : "MEDIUM";

  let options: { id: string; text: string }[] | undefined;
  if (Array.isArray(o.options)) {
    options = o.options
      .map((opt) => {
        if (!opt || typeof opt !== "object") return null;
        const x = opt as { id?: string; text?: string };
        const id = String(x.id ?? "").trim();
        const text = String(x.text ?? "").trim();
        if (!id || !text) return null;
        return { id, text };
      })
      .filter(Boolean) as { id: string; text: string }[];
  }

  const answerFromDocument = o.answerFromDocument === true && o.answer != null;
  const hasAnswer = o.answer != null && o.answer !== "";
  const explanation =
    typeof o.explanation === "string" && o.explanation.trim()
      ? o.explanation.trim()
      : "（待教师或 AI 补充解析）";

  return {
    type,
    stem,
    options: type === "CHOICE" ? options : undefined,
    answer: hasAnswer ? o.answer : null,
    explanation,
    answerSource: answerFromDocument ? "TEACHER" : "AI",
    answerFromDocument,
    difficulty,
  };
}

async function fillMissingAnswers(drafts: ParsedPracticeDraft[]): Promise<ParsedPracticeDraft[]> {
  const out: ParsedPracticeDraft[] = [];
  for (const d of drafts) {
    if (d.answer != null && d.answerFromDocument) {
      out.push({ ...d, answerSource: "TEACHER" });
      continue;
    }
    const generated = await generateAnswerForDraft(d);
    out.push(generated);
  }
  return out;
}

async function generateAnswerForDraft(draft: ParsedPracticeDraft): Promise<ParsedPracticeDraft> {
  const system = `你是高校教师助手。根据题目给出标准答案与简要解析。
只输出 JSON：{"answer":...,"explanation":"..."}
answer 格式与题型一致：CHOICE {"choiceId":"a"}；FILL {"blanks":["x"]}；SHORT_ANSWER {"text":"..."}；CODE {"language":"python","cases":[{"input":"...\\n","expected":"..."}]}`;

  const user = `题型：${draft.type}
题干：${draft.stem}
${draft.options ? `选项：${JSON.stringify(draft.options)}` : ""}`;

  const llm = await practiceLlmChat(system, user, 2048);
  if (llm.source !== "llm") {
    return {
      ...draft,
      answer: draft.answer ?? placeholderAnswer(draft.type),
      answerSource: "AI",
      answerFromDocument: false,
      explanation: `${draft.explanation}\n（AI 未能生成答案：${llm.fallbackReason ?? "未配置 API"}）`,
    };
  }

  try {
    const parsed = extractJsonFromLlm(llm.content) as { answer?: unknown; explanation?: string };
    return {
      ...draft,
      answer: parsed.answer ?? placeholderAnswer(draft.type),
      answerSource: "AI",
      answerFromDocument: false,
      explanation:
        typeof parsed.explanation === "string" && parsed.explanation.trim()
          ? parsed.explanation.trim()
          : draft.explanation,
    };
  } catch {
    return {
      ...draft,
      answer: draft.answer ?? placeholderAnswer(draft.type),
      answerSource: "AI",
      answerFromDocument: false,
    };
  }
}

function placeholderAnswer(type: PracticeQuestionType): unknown {
  switch (type) {
    case "CHOICE":
      return { choiceId: "a" };
    case "FILL":
      return { blanks: [""] };
    case "SHORT_ANSWER":
      return { text: "" };
    case "CODE":
      return { language: "python", cases: [{ input: "\n", expected: "" }] };
  }
}

export async function generateAnswerForQuestion(input: {
  type: PracticeQuestionType;
  stem: string;
  options?: { id: string; text: string }[];
}): Promise<{ answer: unknown; explanation: string; answerSource: PracticeAnswerSource }> {
  const draft: ParsedPracticeDraft = {
    type: input.type,
    stem: input.stem,
    options: input.options,
    answer: null,
    explanation: "（待补充）",
    answerSource: "AI",
    answerFromDocument: false,
    difficulty: "MEDIUM",
  };
  const r = await generateAnswerForDraft(draft);
  return {
    answer: r.answer ?? placeholderAnswer(input.type),
    explanation: r.explanation,
    answerSource: "AI",
  };
}
