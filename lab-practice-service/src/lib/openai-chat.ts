/**
 * OpenAI 兼容 Chat Completions（可用于 DeepSeek：BASE_URL + /v1/chat/completions）
 */

function normalizeBaseUrl(raw: string): string {
  const u = raw.trim().replace(/\/+$/, "");
  if (/\/v\d+$/i.test(u)) return u;
  return `${u}/v1`;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function openaiChatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  /** 本机 Ollama 等可不携带 Bearer */
  omitBearerAuth?: boolean;
  model: string;
  messages: ChatMessage[];
  timeoutMs: number;
  maxTokens: number;
}): Promise<{ content: string; rawRequestId?: string }> {
  const base = normalizeBaseUrl(opts.baseUrl);
  const url = `${base}/chat/completions`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.apiKey?.trim()) {
      headers.Authorization = `Bearer ${opts.apiKey.trim()}`;
    } else if (!opts.omitBearerAuth) {
      throw new Error("缺少 API 密钥");
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        max_tokens: opts.maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    const rawRequestId = res.headers.get("x-request-id") ?? undefined;
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new Error(`HTTP ${res.status}: 非 JSON 响应`);
    }

    if (!res.ok) {
      const errMsg =
        typeof json === "object" &&
        json !== null &&
        "error" in json &&
        typeof (json as { error?: { message?: string } }).error?.message === "string"
          ? (json as { error: { message: string } }).error.message
          : `HTTP ${res.status}`;
      throw new Error(errMsg);
    }

    const choices = (json as { choices?: Array<{ message?: { content?: string | null } }> }).choices;
    const content = choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new Error("模型返回空内容");
    }
    return { content: content.trim(), rawRequestId };
  } finally {
    clearTimeout(t);
  }
}

export function mapLlmErrorToPublicMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.message.includes("aborted")) {
      return "AI 请求超时，请缩短问题或稍后重试。";
    }
    const m = err.message.toLowerCase();
    if (m.includes("401") || m.includes("invalid api key") || m.includes("incorrect api key")) {
      return "AI 服务鉴权失败，请检查服务端 API Key 配置。";
    }
    if (m.includes("429") || m.includes("rate limit")) {
      return "AI 服务限流，请稍后再试。";
    }
  }
  return "AI 服务暂时不可用，请稍后重试。";
}


