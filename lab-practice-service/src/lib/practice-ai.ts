import type { PracticeQuestion } from "@lab/prisma-client-v2";
import { prisma } from "./prisma.js";

export function buildPracticeHint(
  question: Pick<PracticeQuestion, "type" | "stem" | "tagPath" | "explanation">,
  level: "initial" | "more" | "example",
): string {
  const tag = question.tagPath;
  if (level === "example") {
    return `【类似例题思路】本题属于「${tag}」。可先回顾该知识点的定义与常见题型模板，再对照题干中的关键条件逐步推导。完整例题见题库中同标签题目。`;
  }
  if (level === "more") {
    return `【进一步提示】知识点：${tag}。\n1. 写出已知与未知；\n2. 选择与${question.type === "CODE" ? "编程" : "理论"}相关的公式或算法步骤；\n3. 逐步验证中间结果是否合理。\n${question.explanation ? `（可参考解析中的第一步思路，勿直接抄答案）` : ""}`;
  }
  return `【解题思路】本题考点：${tag}。\n建议先明确题目要求，列出相关概念或伪代码步骤；若卡住，可标出不确定的环节再追问「再详细一点」。`;
}

export function analyzeWrongAnswer(
  question: Pick<PracticeQuestion, "stem" | "tagPath" | "explanation" | "type">,
  studentAnswer: string,
): string {
  const short = studentAnswer.slice(0, 200);
  return `【错因分析】你在「${question.tagPath}」相关题目上的作答与预期不一致。\n可能原因：概念混淆、步骤遗漏或边界条件未考虑。\n你的作答摘要：${short || "（空）"}\n${question.explanation ? `建议对照解析：${question.explanation.slice(0, 300)}` : "建议复习该知识点章节后重试。"}`;
}

export async function findSimilarQuestions(
  question: Pick<PracticeQuestion, "id" | "courseId" | "tagPath" | "difficulty">,
  limit = 3,
) {
  const prefix = question.tagPath.split(" > ").slice(0, -1).join(" > ") || question.tagPath;
  const rows = await prisma.practiceQuestion.findMany({
    where: {
      courseId: question.courseId,
      id: { not: question.id },
      auditStatus: "APPROVED",
      tagPath: { startsWith: prefix },
      difficulty: question.difficulty,
    },
    take: limit * 4,
    orderBy: { attemptCount: "desc" },
  });
  return rows.slice(0, limit).map((q) => ({
    id: q.id,
    stem: q.stem.slice(0, 120) + (q.stem.length > 120 ? "…" : ""),
    tagPath: q.tagPath,
    difficulty: q.difficulty,
    explanation: q.explanation?.slice(0, 200),
  }));
}
