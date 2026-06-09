/**
 * 与作业批改 AI 建议相同的大模型调用方式（resolveHomeworkAi + OpenAI 兼容接口）。
 */
import { resolveHomeworkAi } from "./homework-ai-config.js";

export const PLATFORM_AI_ENV_HINT =
  "AI 可在 backend/.env 配置（与作业批改相同：Ollama 或 OpenAI / DeepSeek 等）；";

export type PlatformLlmChatResult = {
  content: string;
  source: "llm" | "heuristic";
  fallbackReason?: string;
};

/** 与 suggestHomeworkGrading 相同的 useLlm 判定与请求方式 */
export async function platformLlmChat(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<PlatformLlmChatResult> {
  const hwAi = resolveHomeworkAi();
  const key = hwAi.apiKey?.trim();
  const useLlm = Boolean(key) || hwAi.omitBearerAuth;

  if (!useLlm) {
    return {
      content: "",
      source: "heuristic",
      fallbackReason: "未配置 API Key 且未指向本机 Ollama",
    };
  }

  const base = hwAi.baseUrl.replace(/\/$/, "");
  const url = `${base}/chat/completions`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers.Authorization = `Bearer ${key}`;
    else if (!hwAi.omitBearerAuth) throw new Error("缺少 API 密钥");

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: hwAi.model,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        temperature: opts.temperature ?? 0.2,
        max_tokens: opts.maxTokens ?? 4096,
      }),
      signal: controller.signal,
    });

    const rawText = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${rawText.slice(0, 400)}`);
    }

    const data = JSON.parse(rawText) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (data.error?.message) throw new Error(data.error.message);

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content) throw new Error("模型返回空内容");
    return { content, source: "llm" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: "", source: "heuristic", fallbackReason: msg };
  } finally {
    clearTimeout(t);
  }
}
