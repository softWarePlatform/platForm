import type { PracticeQuestion } from "@lab/prisma-client-v2";
import { config } from "./config.js";
import { isPlatformLlmReady, resolveHomeworkAi } from "./homework-ai-config.js";
import { mapLlmErrorToPublicMessage, openaiChatCompletion, type ChatMessage } from "./openai-chat.js";
import { PLATFORM_AI_ENV_HINT } from "./platform-llm.js";
import { buildPracticeHint } from "./practice-ai.js";

export type TutorTurn = { role: "user" | "assistant"; content: string };

export const PRACTICE_TUTOR_QUICK_PROMPTS = {
  initial: "我不太会这道题，请给我分步解题思路，引导我自己思考，不要直接给出最终答案。",
  more: "请再详细一点，针对我可能卡住的环节给更具体的提示，仍然不要直接给出最终答案。",
  example: "请举一个考查相同知识点的类似例题思路（不要给出与本题相同的答案）。",
} as const;

export type PracticeTutorQuickAction = keyof typeof PRACTICE_TUTOR_QUICK_PROMPTS;

export function parseTutorTurns(json: string | null | undefined): TutorTurn[] {
  if (!json?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const turns: TutorTurn[] = [];
    for (const row of parsed) {
      if (typeof row === "string" && row.trim()) {
        turns.push({ role: "assistant", content: row.trim() });
        continue;
      }
      if (
        row &&
        typeof row === "object" &&
        "role" in row &&
        "content" in row &&
        (row.role === "user" || row.role === "assistant") &&
        typeof row.content === "string" &&
        row.content.trim()
      ) {
        turns.push({ role: row.role, content: row.content.trim() });
      }
    }
    return turns;
  } catch {
    return [];
  }
}

function formatQuestionContext(
  q: Pick<PracticeQuestion, "type" | "stem" | "tagPath" | "difficulty" | "language" | "optionsJson">,
  studentAnswer: unknown,
): string {
  let options = "";
  if (q.optionsJson) {
    try {
      const opts = JSON.parse(q.optionsJson) as { id: string; text: string }[];
      if (opts.length) {
        options = "\n选项：\n" + opts.map((o) => `${o.id}. ${o.text}`).join("\n");
      }
    } catch {
      /* ignore */
    }
  }
  const ans =
    studentAnswer != null && studentAnswer !== ""
      ? `\n学生当前作答（可能未完成）：${JSON.stringify(studentAnswer).slice(0, 800)}`
      : "";
  return [
    `题型：${q.type}`,
    `知识点：${q.tagPath}`,
    `难度：${q.difficulty}`,
    q.language ? `编程语言：${q.language}` : "",
    `题干：${q.stem}`,
    options,
    ans,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPracticeTutorSystemPrompt(
  q: Pick<PracticeQuestion, "type" | "stem" | "tagPath" | "difficulty" | "language" | "optionsJson">,
  studentAnswer: unknown,
): string {
  const context = formatQuestionContext(q, studentAnswer);
  return [
    "你是课程练习模块的 AI 辅导老师，用中文与学生多轮对话。",
    "",
    "【硬性约束】",
    "- 不得直接给出本题的最终答案、正确选项编号、填空完整答案或可提交的完整题解代码。",
    "- 以苏格拉底式引导：分步思路、关键概念、常见误区、自检问题与小练习。",
    "- 学生反复索要答案时，仍只提供思路与检查清单，并鼓励其先完成一小步。",
    "- 不要编造题库中不存在的「官方解析」；可给通用例题思路。",
    "- 回答简洁清晰，可使用 Markdown。",
    "",
    "【当前题目】",
    context,
  ].join("\n");
}

export async function runPracticeTutorChat(opts: {
  question: PracticeQuestion;
  studentAnswer: unknown;
  history: TutorTurn[];
  userMessage: string;
}): Promise<{
  reply: string;
  source: "llm" | "heuristic";
  model?: string | null;
  notice?: string;
}> {
  const hwAi = resolveHomeworkAi();
  const system = buildPracticeTutorSystemPrompt(opts.question, opts.studentAnswer);

  if (!isPlatformLlmReady(hwAi)) {
    const level: "initial" | "more" | "example" = opts.userMessage.includes("例题")
      ? "example"
      : opts.userMessage.includes("详细")
        ? "more"
        : "initial";
    return {
      reply: buildPracticeHint(opts.question, level),
      source: "heuristic",
      model: null,
      notice: `${PLATFORM_AI_ENV_HINT}未配置时将使用规则提示。`,
    };
  }

  const apiMessages: ChatMessage[] = [{ role: "system", content: system }];
  for (const t of opts.history) {
    apiMessages.push({ role: t.role, content: t.content });
  }
  apiMessages.push({ role: "user", content: opts.userMessage });

  try {
    const { content } = await openaiChatCompletion({
      baseUrl: hwAi.baseUrl,
      apiKey: hwAi.apiKey ?? "",
      omitBearerAuth: hwAi.omitBearerAuth,
      model: hwAi.model,
      messages: apiMessages,
      timeoutMs: config.aiTimeoutMs,
      maxTokens: config.aiMaxTokens,
    });
    return { reply: content, source: "llm", model: hwAi.model };
  } catch (e) {
    throw new Error(mapLlmErrorToPublicMessage(e));
  }
}
