import { platformLlmChat } from "./platform-llm.js";

export type PracticeLlmResult = {
  content: string;
  source: "llm" | "heuristic";
  fallbackReason?: string;
};

/** 与作业批改共用 .env 配置，调用方式一致 */
export async function practiceLlmChat(
  system: string,
  user: string,
  maxTokens = 4096,
): Promise<PracticeLlmResult> {
  return platformLlmChat({ system, user, maxTokens });
}

export function extractJsonFromLlm(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const m = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) throw new Error("无法从模型输出中解析 JSON");
    return JSON.parse(m[0]);
  }
}
