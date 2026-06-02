import type { PracticeAnswerSource, PracticeDifficulty, PracticeQuestionType } from "@prisma/client";
import type { ParsedPracticeDraft } from "./practice-import-ai.js";

/** 无大模型时的简易题号切分（效果有限，仅供降级） */
export function heuristicExtractQuestions(documentText: string): ParsedPracticeDraft[] {
  const text = documentText.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const blocks = text
    .split(/\n(?=\s*(?:\d{1,3}[.、．)\]】]|[(（]?\d{1,3}[)）][.、．]?)\s*)/)
    .map((b) => b.trim())
    .filter((b) => b.length > 20);

  const drafts: ParsedPracticeDraft[] = [];

  for (const block of blocks.slice(0, 50)) {
    const stem = block
      .replace(/^\s*(?:\d{1,3}[.、．)\]】]|[(（]?\d{1,3}[)）][.、．]?)\s*/, "")
      .trim()
      .slice(0, 4000);
    if (stem.length < 8) continue;

    const type = guessType(stem);
    const options = type === "CHOICE" ? parseChoiceOptions(stem) : undefined;
    drafts.push({
      type,
      stem: stem.slice(0, 8000),
      options,
      answer: null,
      explanation: "（启发式导入，请教师核对并补充解析；建议配置大模型后重新识题）",
      answerSource: "AI" as PracticeAnswerSource,
      answerFromDocument: false,
      difficulty: "MEDIUM" as PracticeDifficulty,
    });
  }

  if (drafts.length === 0 && text.length > 30) {
    drafts.push({
      type: "SHORT_ANSWER",
      stem: text.slice(0, 2000),
      answer: null,
      explanation: "（整段作为单题导入，请拆分或配置 AI 识题）",
      answerSource: "AI",
      answerFromDocument: false,
      difficulty: "MEDIUM",
    });
  }

  return drafts;
}

function guessType(stem: string): PracticeQuestionType {
  if (/编程|代码|程序实现|def |class |#include|public static void/i.test(stem)) return "CODE";
  if (/_{2,}|填空|___/.test(stem)) return "FILL";
  if (/[A-DＡ-Ｄ][.、．)]\s/.test(stem) || /选项\s*[A-D]/.test(stem)) return "CHOICE";
  return "SHORT_ANSWER";
}

function parseChoiceOptions(stem: string): { id: string; text: string }[] | undefined {
  const opts: { id: string; text: string }[] = [];
  const re = /([A-DＡ-Ｄ])[.、．)\]】]\s*([^\nA-DＡ-Ｄ]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stem)) !== null) {
    const id = m[1]!.replace(/[Ａ-Ｄ]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    ).toLowerCase();
    opts.push({ id, text: m[2]!.trim().slice(0, 500) });
  }
  return opts.length >= 2 ? opts : undefined;
}
