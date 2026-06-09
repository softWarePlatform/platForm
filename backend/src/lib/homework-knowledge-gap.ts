import type { Homework, HomeworkSubmission } from "@prisma/client";
import { resolveHomeworkAi } from "./homework-ai-config.js";

export type KnowledgePointLevel = "weak" | "fair" | "good";

export type KnowledgePointRow = {
  name: string;
  level: KnowledgePointLevel;
  evidence?: string;
};

export type KnowledgeGapPayload = {
  points: KnowledgePointRow[];
  summary?: string;
  practiceSuggestions?: string[];
};

function heuristicAnalysis(
  hw: Homework,
  sub: HomeworkSubmission,
): KnowledgeGapPayload {
  const fb = (sub.feedback ?? "").toLowerCase();
  const points: KnowledgePointRow[] = [];
  const tags = ["算法", "数据结构", "复杂度", "代码规范", "文档", "测试"];
  for (const t of tags) {
    if (fb.includes(t.toLowerCase()) || (sub.score != null && sub.score < 70)) {
      points.push({
        name: t,
        level: sub.score != null && sub.score < 60 ? "weak" : "fair",
        evidence: sub.feedback?.slice(0, 120) || "根据得分与评语推断",
      });
    }
  }
  if (points.length === 0) {
    points.push({
      name: hw.title,
      level: sub.score != null && sub.score >= 85 ? "good" : sub.score != null && sub.score >= 70 ? "fair" : "weak",
      evidence: sub.feedback || "综合本次作业得分",
    });
  }
  return {
    points,
    summary: "基于批改结果生成的知识掌握概览（本地启发式）。",
    practiceSuggestions: ["复习课程讲义相关章节", "完成课程实验巩固"],
  };
}

async function aiAnalysis(
  hw: Homework,
  sub: HomeworkSubmission,
): Promise<KnowledgeGapPayload | null> {
  const cfg = resolveHomeworkAi();
  if (!cfg.apiKey && !cfg.baseUrl) return null;

  const prompt = `你是教学助教。根据作业批改结果分析学生知识薄弱点，只输出 JSON：
{"points":[{"name":"知识点","level":"weak|fair|good","evidence":"依据"}],"summary":"一句话","practiceSuggestions":["建议1"]}
作业：${hw.title}
得分：${sub.score ?? "未评"}
评语：${sub.feedback ?? "无"}
作答摘要：${sub.content.slice(0, 1500)}`;

  try {
    const base = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey && !cfg.omitBearerAuth) headers.Authorization = `Bearer ${cfg.apiKey}`;

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model ?? "gpt-4o-mini",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as KnowledgeGapPayload;
  } catch {
    return null;
  }
}

export async function buildKnowledgeGap(
  hw: Homework,
  sub: HomeworkSubmission,
): Promise<KnowledgeGapPayload> {
  const ai = await aiAnalysis(hw, sub);
  if (ai?.points?.length) return ai;
  return heuristicAnalysis(hw, sub);
}

export async function explainWrongQuestion(input: {
  homeworkTitle: string;
  question: string;
  submissionContent: string;
  feedback?: string | null;
}): Promise<string> {
  const cfg = resolveHomeworkAi();
  const fallback = `针对「${input.question}」：请对照作业要求与教师评语（${input.feedback ?? "暂无"}）检查解题步骤与关键概念是否遗漏。`;

  if (!cfg.apiKey && !cfg.baseUrl) return fallback;

  try {
    const base = (cfg.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cfg.apiKey && !cfg.omitBearerAuth) headers.Authorization = `Bearer ${cfg.apiKey}`;

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: cfg.model ?? "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "user",
            content: `作业：${input.homeworkTitle}\n学生问题：${input.question}\n作答：${input.submissionContent.slice(0, 2000)}\n教师评语：${input.feedback ?? "无"}\n请解析错误原因并给出正确思路（中文，条理清晰）。`,
          },
        ],
      }),
    });
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}
