/**
 * 作业批改用大模型：任意 OpenAI 兼容 `/v1/chat/completions`。
 * 云端：OpenAI / DeepSeek 等（需密钥）。
 * 本地免费开源：推荐 Ollama（Llama / Qwen / Mistral 等），通常无需 Bearer。
 */

function trimKey(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t || undefined;
}

/** 常见本地推理：本机 Ollama、LM Studio（可不校验密钥） */
export function looksLikeLocalOpenCompatibleEndpoint(baseUrl: string): boolean {
  const s = baseUrl.trim();
  if (/\b11434\b/.test(s)) return true;
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    const h = u.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(s);
  }
}

export type ResolvedHomeworkAi = {
  apiKey: string | undefined;
  omitBearerAuth: boolean;
  baseUrl: string;
  model: string;
  hint: string;
};

export function resolveHomeworkAi(): ResolvedHomeworkAi {
  const kGeneric = trimKey(process.env.AI_HOMEWORK_API_KEY);
  const kOpenai = trimKey(process.env.OPENAI_API_KEY);
  const kDeepseek = trimKey(process.env.DEEPSEEK_API_KEY);

  const apiKey = kGeneric ?? kOpenai ?? kDeepseek;

  const fromOllamaEnv = Boolean(trimKey(process.env.OLLAMA_BASE_URL));

  const urlExplicit =
    trimKey(process.env.AI_HOMEWORK_BASE_URL) ??
    trimKey(process.env.OLLAMA_BASE_URL) ??
    trimKey(process.env.OPENAI_BASE_URL) ??
    trimKey(process.env.DEEPSEEK_API_URL);

  const modelExplicit =
    trimKey(process.env.AI_HOMEWORK_MODEL) ??
    trimKey(process.env.OLLAMA_MODEL) ??
    trimKey(process.env.OPENAI_MODEL) ??
    trimKey(process.env.DEEPSEEK_MODEL);

  const forceLocalNoAuth =
    trimKey(process.env.AI_HOMEWORK_LOCAL_NO_AUTH) === "1" ||
    trimKey(process.env.OLLAMA_NO_API_KEY) === "1";

  let hint = "";
  if (kGeneric) hint = "AI_HOMEWORK_API_KEY";
  else if (kOpenai) hint = "OPENAI_API_KEY";
  else if (kDeepseek) hint = "DEEPSEEK_API_KEY";
  else hint = "（未配置云端密钥）";

  let baseUrl: string;
  if (urlExplicit) {
    baseUrl = urlExplicit.replace(/\/$/, "");
  } else if (kDeepseek && !kOpenai && !kGeneric) {
    baseUrl = "https://api.deepseek.com";
  } else {
    baseUrl = "https://api.openai.com/v1";
  }

  const omitBearerAuth =
    !apiKey && (looksLikeLocalOpenCompatibleEndpoint(baseUrl) || forceLocalNoAuth);

  if (omitBearerAuth) {
    hint = forceLocalNoAuth ? "AI_HOMEWORK_LOCAL_NO_AUTH=1（无 Bearer）" : "本地开源模型（无 API Key，如 Ollama）";
  }

  let model: string;
  if (modelExplicit) {
    model = modelExplicit;
  } else if (omitBearerAuth && (fromOllamaEnv || /\b11434\b/.test(baseUrl))) {
    model = trimKey(process.env.OLLAMA_MODEL) ?? "llama3.2";
  } else if (kDeepseek && !kOpenai && !kGeneric) {
    model = "deepseek-chat";
  } else {
    model = "gpt-4o-mini";
  }

  return { apiKey, omitBearerAuth, baseUrl, model, hint };
}
