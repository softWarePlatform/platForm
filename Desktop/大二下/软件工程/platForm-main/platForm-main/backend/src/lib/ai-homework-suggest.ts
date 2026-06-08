/** 作业批改 AI：任意 OpenAI 兼容 Chat Completions API，未配置密钥或调用失败时用本地启发式 */

export type AiSuggestSource = "llm" | "heuristic";

export type AiSuggestResult = {
  score: number;
  feedback: string;
  source: AiSuggestSource;
  /** 已配置大模型但调用失败时的错误摘要（已改用启发式） */
  fallbackReason?: string;
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 简易启发式（无 API 密钥或 API 失败时使用） */
export function heuristicHomeworkSuggest(content: string): Pick<AiSuggestResult, "score" | "feedback"> {
  const text = content.trim();
  const len = text.length;
  const paragraphs = text.split(/\n{2,}/).filter((x) => x.trim().length > 0).length;
  const keywords = ["复杂度", "算法", "数据结构", "实现", "思路", "边界", "优化", "案例"];
  const hit = keywords.filter((k) => text.includes(k)).length;

  const score = clampScore(
    35 + Math.min(35, len / 20) + Math.min(10, paragraphs * 3) + Math.min(20, hit * 4),
  );

  const feedback = [
    `AI建议分数：${score}（仅供教师参考；启发式规则）`,
    len < 60 ? "内容较短，建议补充分析过程与关键步骤。" : "内容长度充足。",
    hit < 2 ? "关键词覆盖较少，建议补充术语与关键概念。" : "关键词覆盖较好。",
    paragraphs <= 1 ? "建议分段组织答案，增强可读性。" : "结构分段较清晰。",
  ].join("\n");

  return { score, feedback };
}

function extractJsonObject(raw: string): { score?: unknown; feedback?: unknown } {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as { score?: unknown; feedback?: unknown };
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("无法从模型输出中解析 JSON");
    return JSON.parse(m[0]) as { score?: unknown; feedback?: unknown };
  }
}

export type OpenAiCompatibleSuggestInput = {
  apiKey: string;
  /** 本地 Ollama 等可不携带 Bearer */
  omitBearerAuth?: boolean;
  baseUrl: string;
  model: string;
  homeworkTitle: string;
  homeworkDescription: string | null | undefined;
  studentName: string;
  submissionContent: string;
};

/** OpenAI 兼容：`POST {baseUrl}/chat/completions`（baseUrl 含或不含 /v1 均可，见下方拼接） */
export async function openAiCompatibleHomeworkSuggest(
  input: OpenAiCompatibleSuggestInput,
): Promise<Pick<AiSuggestResult, "score" | "feedback">> {
  const body = input.submissionContent.trim().slice(0, 14_000);
  const userPrompt = `你是高校课程助教。请根据作业要求阅读学生作答，给出 0–100 的整数分数（score）与简短中文评语（feedback）。
评语应指出亮点与可改进点，总字数建议 200–600 字。

只输出一个 JSON 对象，不要 markdown 代码围栏，不要其它文字。格式严格为：
{"score":整数,"feedback":"字符串"}

【作业标题】
${input.homeworkTitle}

【作业说明】
${input.homeworkDescription?.trim() || "（未填写）"}

【学生姓名】${input.studentName}

【学生作答】
${body || "（空）"}
`;

  const base = input.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 90_000);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (input.apiKey?.trim()) {
      headers.Authorization = `Bearer ${input.apiKey.trim()}`;
    } else if (!input.omitBearerAuth) {
      throw new Error("缺少 API 密钥");
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content:
              "你只输出包含 score 与 feedback 键的 JSON 对象。score 为 0–100 的整数；feedback 为中文评语字符串，可适当换行。",
          },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.35,
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 400)}`);
    }

    let data: {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    try {
      data = JSON.parse(rawText) as typeof data;
    } catch {
      throw new Error(`响应非 JSON：${rawText.slice(0, 200)}`);
    }

    const errMsg = data.error?.message;
    if (errMsg) throw new Error(errMsg);

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("模型返回空内容");

    const parsed = extractJsonObject(content);
    const score = clampScore(Number(parsed.score));
    const feedback =
      typeof parsed.feedback === "string" && parsed.feedback.trim().length > 0
        ? parsed.feedback.trim()
        : "（模型未返回评语）";

    return {
      score,
      feedback: [`【AI】参考评分 ${score} 分（请教师终审）`, "", feedback].join("\n"),
    };
  } finally {
    clearTimeout(t);
  }
}

export type OrchestratorInput = {
  apiKey?: string;
  omitBearerAuth?: boolean;
  baseUrl: string;
  model: string;
  homeworkTitle: string;
  homeworkDescription: string | null | undefined;
  studentName: string;
  submissionContent: string;
};

/** 优先调用 OpenAI 兼容接口；失败或未配置密钥时使用启发式 */
export async function suggestHomeworkGrading(input: OrchestratorInput): Promise<AiSuggestResult> {
  const key = input.apiKey?.trim();
  const useLlm = Boolean(key) || Boolean(input.omitBearerAuth);
  if (useLlm) {
    try {
      const r = await openAiCompatibleHomeworkSuggest({
        apiKey: key ?? "",
        omitBearerAuth: input.omitBearerAuth,
        baseUrl: input.baseUrl,
        model: input.model,
        homeworkTitle: input.homeworkTitle,
        homeworkDescription: input.homeworkDescription,
        studentName: input.studentName,
        submissionContent: input.submissionContent,
      });
      return { ...r, source: "llm" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const h = heuristicHomeworkSuggest(input.submissionContent);
      return {
        score: h.score,
        feedback: [
          h.feedback,
          "",
          `（大模型调用失败，已使用本地启发式：${msg.slice(0, 240)}）`,
        ].join("\n"),
        source: "heuristic",
        fallbackReason: msg,
      };
    }
  }

  const h = heuristicHomeworkSuggest(input.submissionContent);
  return { ...h, source: "heuristic" };
}
