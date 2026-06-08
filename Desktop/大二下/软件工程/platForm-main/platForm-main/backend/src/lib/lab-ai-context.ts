import { readFile } from "node:fs/promises";
import { prisma } from "./prisma.js";
import { readSubmissionCodeForJudge } from "./lab-submit.js";
import { readStoredFileAbs } from "./uploads.js";

/** 与 schema 对齐；避免 IDE 使用未 regenerate 的 @prisma/client 时报缺字段 */
type SubmissionForAiContext = {
  id: string;
  labId: string;
  userId: string;
  submissionKind: string;
  code: string;
  fileName: string | null;
  fileStoredPath: string | null;
  language: string | null;
  status: string;
  score: number | null;
  resultJson: string | null;
  teacherComment: string | null;
  createdAt: Date;
  lab: { language: string; course: { teacherId: string } };
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "排队中",
  JUDGING: "评测中",
  PENDING_REVIEW: "待教师批改",
  ACCEPTED: "通过",
  WRONG_ANSWER: "答案错误",
  TIMEOUT: "超时",
  ERROR: "运行错误",
};

/** LabFile.title 前缀，用于区分 AI 会话附件与教师资料 */
export const LAB_AI_ATTACHMENT_TITLE_PREFIX = "AI会话:";

const MAX_CODE_CHARS = 20_000;
const MAX_RESULT_CHARS = 8_000;
const MAX_ATTACH_TEXT_CHARS = 24_000;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".py",
  ".js",
  ".ts",
  ".java",
  ".cpp",
  ".c",
  ".h",
  ".md",
  ".json",
  ".csv",
  ".go",
  ".rs",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function truncate(text: string, max: number, label: string): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（${label}已截断，原文约 ${text.length} 字）`;
}

/** 对学生隐藏 hidden 用例的 I/O；教师可见完整 details */
export function maskResultJsonForAi(
  resultJson: string | null,
  isTeacherView: boolean,
): string | null {
  if (!resultJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(resultJson);
  } catch {
    return truncate(resultJson, MAX_RESULT_CHARS, "评测结果");
  }
  if (!parsed || typeof parsed !== "object") {
    return truncate(JSON.stringify(parsed), MAX_RESULT_CHARS, "评测结果");
  }
  const obj = parsed as Record<string, unknown>;
  const details = Array.isArray(obj.details) ? obj.details : [];
  const masked = details.map((d) => {
    if (!d || typeof d !== "object") return d;
    const row = d as Record<string, unknown>;
    if (row.hidden === true && !isTeacherView) {
      const { input, expected, got, stderr, ...rest } = row;
      void input;
      void expected;
      void got;
      void stderr;
      return { ...rest, hidden: true };
    }
    return row;
  });
  const out = { ...obj, details: masked };
  return truncate(JSON.stringify(out, null, 2), MAX_RESULT_CHARS, "评测结果");
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function canViewSubmission(
  userId: string,
  role: string,
  sub: { userId: string; lab: { course: { teacherId: string } } },
): boolean {
  if (sub.userId === userId) return true;
  if (role === "ADMIN") return true;
  if (role === "TEACHER" && sub.lab.course.teacherId === userId) return true;
  return false;
}

export async function buildSubmissionContextBlock(opts: {
  labId: string;
  submissionId: string;
  userId: string;
  role: string;
}): Promise<string | null> {
  const subRaw = await prisma.submission.findUnique({
    where: { id: opts.submissionId },
    include: {
      lab: { include: { course: true, testCases: { where: { hidden: false } } } },
    },
  });
  const sub = subRaw as SubmissionForAiContext | null;
  if (!sub || sub.labId !== opts.labId) return null;
  if (!canViewSubmission(opts.userId, opts.role, sub)) return null;

  const isTeacher = opts.role === "ADMIN" || sub.lab.course.teacherId === opts.userId;
  let codeBlock = "（无代码内容）";
  try {
    const { code, language } = await readSubmissionCodeForJudge({
      submissionKind: sub.submissionKind,
      code: sub.code,
      fileStoredPath: sub.fileStoredPath,
      language: sub.language,
      lab: { language: sub.lab.language },
    });
    const header =
      sub.submissionKind === "FILE"
        ? `提交文件：${sub.fileName ?? "未命名"}；评测语言：${language}`
        : `提交类型：内联代码；语言：${language}`;
    codeBlock = `${header}\n\n${truncate(code, MAX_CODE_CHARS, "提交代码")}`;
  } catch {
    codeBlock = sub.fileName
      ? `无法读取提交文件「${sub.fileName}」，请仅依据评测结果分析。`
      : "无法读取提交内容。";
  }

  const resultBlock =
    maskResultJsonForAi(sub.resultJson, isTeacher) ??
    (sub.status === "PENDING_REVIEW" ? "（等待教师批改，暂无自动评测结果）" : "（暂无评测结果）");

  const scoreLine =
    sub.score != null ? `得分：${Number(sub.score).toFixed(1)}` : "得分：未评定";
  const commentLine = sub.teacherComment?.trim()
    ? `教师评语：${sub.teacherComment.trim()}`
    : null;

  return [
    "【学生本次提交（仅供分析，勿复述隐藏用例）】",
    `提交 ID：${sub.id}`,
    `状态：${statusLabel(sub.status)}；${scoreLine}`,
    `提交时间：${sub.createdAt.toISOString()}`,
    commentLine,
    "",
    "【提交代码 / 文件内容】",
    codeBlock,
    "",
    "【评测结果 JSON（已隐藏机密用例输入输出）】",
    resultBlock,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");
}

async function readLabFileText(storedPath: string, fileName: string): Promise<string> {
  const ext = extOf(fileName);
  if (!TEXT_EXTENSIONS.has(ext)) {
    return `（非文本类附件「${fileName}」，仅提供文件名供参考）`;
  }
  const abs = readStoredFileAbs(storedPath);
  const raw = await readFile(abs, "utf8");
  return truncate(raw, MAX_ATTACH_TEXT_CHARS, `附件 ${fileName}`);
}

export async function buildAttachmentContextBlock(opts: {
  labId: string;
  userId: string;
  attachmentIds: string[];
}): Promise<string> {
  if (!opts.attachmentIds.length) return "";
  const unique = [...new Set(opts.attachmentIds)].slice(0, 5);
  const rows = await prisma.labFile.findMany({
    where: {
      id: { in: unique },
      labId: opts.labId,
      uploadedById: opts.userId,
      title: { startsWith: LAB_AI_ATTACHMENT_TITLE_PREFIX },
    },
  });
  if (rows.length === 0) return "";

  const parts: string[] = ["【用户上传的参考附件（仅当次会话）】"];
  for (const row of rows) {
    try {
      const body = await readLabFileText(row.storedPath, row.fileName);
      parts.push(`--- ${row.fileName} ---`, body, "");
    } catch {
      parts.push(`--- ${row.fileName} ---`, "（无法读取附件内容）", "");
    }
  }
  return parts.join("\n").trim();
}

export function isAiSessionLabFile(title: string): boolean {
  return title.startsWith(LAB_AI_ATTACHMENT_TITLE_PREFIX);
}
