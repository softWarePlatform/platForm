/**
 * 平台大模型配置：作业批改、练习识题、知识漏洞分析等共用。
 * 云端：OpenAI / DeepSeek 等（需密钥）。
 * 本地：Ollama（默认 http://127.0.0.1:11434/v1，无需 Bearer）。
 */

import { config } from "./config.js";

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

const DEFAULT_LOCAL_LLM = "http://127.0.0.1:11434/v1";
const DEFAULT_CLOUD_LLM = "https://api.deepseek.com";

export function isPlatformLlmReady(cfg: ResolvedHomeworkAi): boolean {
  return Boolean(cfg.apiKey?.trim()) || cfg.omitBearerAuth;
}

export function platformLlmSetupLines(): string[] {
  return [
    "在服务环境变量中任选一种方式配置（改后需重启服务）：",
    "1) 云端：DEEPSEEK_API_KEY=sk-... ，DEEPSEEK_API_URL=https://api.deepseek.com ，DEEPSEEK_MODEL=deepseek-chat",
    "2) 或：OPENAI_API_KEY=sk-... ，OPENAI_BASE_URL=服务商地址 ，OPENAI_MODEL=模型名",
    "3) 本机 Ollama：先运行 ollama serve，再设 OLLAMA_BASE_URL=http://127.0.0.1:11434/v1 ，OLLAMA_MODEL=模型名",
    "4) 硅基流动等：AI_HOMEWORK_API_KEY / AI_HOMEWORK_BASE_URL / AI_HOMEWORK_MODEL（练习与作业共用）",
  ];
}

export function resolveHomeworkAi(): ResolvedHomeworkAi {
  const kPractice = trimKey(process.env.AI_PRACTICE_API_KEY);
  const kGeneric = trimKey(process.env.AI_HOMEWORK_API_KEY);
  const kOpenai = trimKey(process.env.OPENAI_API_KEY);
  const kDeepseek = trimKey(process.env.DEEPSEEK_API_KEY);

  const apiKey = kPractice ?? kGeneric ?? kOpenai ?? kDeepseek ?? trimKey(config.openaiApiKey);

  const fromOllamaEnv = Boolean(trimKey(process.env.OLLAMA_BASE_URL));

  const urlExplicit =
    trimKey(process.env.AI_PRACTICE_BASE_URL) ??
    trimKey(process.env.AI_HOMEWORK_BASE_URL) ??
    trimKey(process.env.OLLAMA_BASE_URL) ??
    trimKey(process.env.OPENAI_BASE_URL) ??
    trimKey(process.env.DEEPSEEK_API_URL);

  const modelExplicit =
    trimKey(process.env.AI_PRACTICE_MODEL) ??
    trimKey(process.env.AI_HOMEWORK_MODEL) ??
    trimKey(process.env.OLLAMA_MODEL) ??
    trimKey(process.env.OPENAI_MODEL) ??
    trimKey(process.env.DEEPSEEK_MODEL);

  const forceLocalNoAuth =
    trimKey(process.env.AI_PRACTICE_LOCAL_NO_AUTH) === "1" ||
    trimKey(process.env.AI_HOMEWORK_LOCAL_NO_AUTH) === "1" ||
    trimKey(process.env.OLLAMA_NO_API_KEY) === "1";

  let hint = "";
  if (kPractice) hint = "AI_PRACTICE_API_KEY";
  else if (kGeneric) hint = "AI_HOMEWORK_API_KEY";
  else if (kOpenai) hint = "OPENAI_API_KEY";
  else if (kDeepseek) hint = "DEEPSEEK_API_KEY";

  let baseUrl: string;
  if (urlExplicit) {
    baseUrl = urlExplicit.replace(/\/$/, "");
  } else if (apiKey) {
    baseUrl = (
      trimKey(process.env.OPENAI_BASE_URL) ??
      trimKey(process.env.DEEPSEEK_API_URL) ??
      config.openaiBaseUrl ??
      DEFAULT_CLOUD_LLM
    ).replace(/\/$/, "");
  } else {
    baseUrl = DEFAULT_LOCAL_LLM;
  }

  const omitBearerAuth =
    !apiKey && (looksLikeLocalOpenCompatibleEndpoint(baseUrl) || forceLocalNoAuth);

  if (omitBearerAuth) {
    hint = forceLocalNoAuth
      ? "本地推理（AI_*_LOCAL_NO_AUTH=1）"
      : `本机 Ollama（${baseUrl}，无需 API Key）`;
  } else if (!hint) {
    hint = "（未配置云端密钥，且未指向本机 Ollama）";
  }

  let model: string;
  if (modelExplicit) {
    model = modelExplicit;
  } else if (omitBearerAuth && (fromOllamaEnv || /\b11434\b/.test(baseUrl))) {
    model = trimKey(process.env.OLLAMA_MODEL) ?? "llama3.2";
  } else if (kDeepseek && !kOpenai && !kGeneric && !kPractice) {
    model = "deepseek-chat";
  } else if (apiKey) {
    model = trimKey(process.env.OPENAI_MODEL) ?? config.openaiModel ?? "deepseek-chat";
  } else {
    model = "llama3.2";
  }

  return { apiKey, omitBearerAuth, baseUrl, model, hint };
}

