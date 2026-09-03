import { readFile } from "node:fs/promises";
import type { FastifyReply } from "fastify";
import { SubmissionStatus, type Prisma } from "@lab/prisma-client-v2";
import { fetchCourseInfo } from "../course-client.js";
import { prisma } from "./prisma.js";
import { tryEnqueueJudgeSubmission } from "./judge-dispatcher.js";
import {
  extensionAllowed,
  labJudgeSelect,
  requireAllowedJudgeLanguage,
  resolveLabJudgeConfig,
  type LabJudgeConfig,
  type LabJudgeSource,
} from "./lab-judge-config.js";
import { readStoredFileAbs, saveSubmissionFile } from "./uploads.js";
import { canBrowseAt, canSubmitAt } from "./lab-set-status.js";
import { labSetJudgeSelect } from "./lab-set-status.js";
import { assertReturnQuota } from "./lab-return.js";

const labSetAccessSelect = {
  id: true,
  title: true,
  startAt: true,
  dueAt: true,
  allowMakeup: true,
  makeupDueAt: true,
  outsideAccessMode: true,
  createdAt: true,
  ...labSetJudgeSelect,
} as const;

export async function loadLabForSubmit(labId: string, requestId?: string) {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    select: {
      id: true,
      courseId: true,
      labSetId: true,
      title: true,
      language: true,
      ...labJudgeSelect,
      labSet: { select: labSetAccessSelect },
    },
  });
  if (!lab) return null;
  const course = await fetchCourseInfo(lab.courseId, requestId);
  if (!course) return null;
  return { ...lab, course };
}

export function assertCanSubmitLab(
  lab: NonNullable<Awaited<ReturnType<typeof loadLabForSubmit>>>,
  role: string,
  userId: string,
  reply: FastifyReply,
): boolean {
  const privileged = role === "ADMIN" || lab.course.teacherId === userId;
  if (privileged) return true;
  if (!canBrowseAt(Date.now(), lab.labSet, false)) {
    reply.code(403).send({ error: "不在可访问时间内" });
    return false;
  }
  if (!canSubmitAt(Date.now(), lab.labSet, false)) {
    reply.code(403).send({
      error: "当前不在可提交时间窗内（正式或补交时段），无法提交",
    });
    return false;
  }
  return true;
}

function asJudgeSources(lab: {
  language: string;
  judgeMode?: unknown;
  allowedLanguages?: unknown;
  allowedFileExtensions?: unknown;
  labSet: LabJudgeSource;
}): { lab: LabJudgeSource; labSet: LabJudgeSource } {
  return {
    lab: {
      language: lab.language,
      judgeMode: lab.judgeMode as LabJudgeSource["judgeMode"],
      allowedLanguages: lab.allowedLanguages as string[] | undefined,
      allowedFileExtensions: lab.allowedFileExtensions as string[] | undefined,
    },
    labSet: lab.labSet,
  };
}

export function getJudgeConfigFromLab(
  lab: NonNullable<Awaited<ReturnType<typeof loadLabForSubmit>>>,
): LabJudgeConfig {
  const { lab: l, labSet } = asJudgeSources(lab);
  return resolveLabJudgeConfig(l, labSet);
}

async function checkReturnQuotaBeforeSubmit(
  lab: NonNullable<Awaited<ReturnType<typeof loadLabForSubmit>>>,
  userId: string,
): Promise<void> {
  await assertReturnQuota(lab.id, userId, lab.labSet.maxReturnCount);
}

export async function createCodeSubmission(opts: {
  labId: string;
  userId: string;
  code: string;
  language?: string;
  judgeConfig: LabJudgeConfig;
}) {
  const { labId, userId, code, language, judgeConfig } = opts;
  const lab = await loadLabForSubmit(labId);
  if (lab) await checkReturnQuotaBeforeSubmit(lab, userId);
  const selectedLanguage = requireAllowedJudgeLanguage(
    language ?? lab?.language ?? "",
    judgeConfig.allowedLanguages,
  );
  if (judgeConfig.judgeMode === "MANUAL") {
    const data = {
      labId,
      userId,
      submissionKind: "CODE",
      code,
      language: selectedLanguage,
      status: "PENDING_REVIEW" as SubmissionStatus,
      resultJson: JSON.stringify({ note: "等待教师手动批改" }),
    } as Prisma.SubmissionUncheckedCreateInput;
    return prisma.submission.create({ data });
  }
  const data = {
    labId,
    userId,
    submissionKind: "CODE",
    code,
    language: selectedLanguage,
    status: SubmissionStatus.PENDING,
  } as Prisma.SubmissionUncheckedCreateInput;
  const submission = await prisma.submission.create({ data });
  await tryEnqueueJudgeSubmission(submission.id);
  return submission;
}

export async function createFileSubmission(opts: {
  labId: string;
  userId: string;
  language: string;
  fileName: string;
  fileBuf: Buffer;
  judgeConfig: LabJudgeConfig;
}) {
  const { labId, userId, language, fileName, fileBuf, judgeConfig } = opts;

  const labRow = await loadLabForSubmit(labId);
  if (labRow) await checkReturnQuotaBeforeSubmit(labRow, userId);

  const selectedLanguage = requireAllowedJudgeLanguage(language, judgeConfig.allowedLanguages);
  if (!extensionAllowed(fileName, judgeConfig.allowedFileExtensions)) {
    throw new Error("不允许的文件类型");
  }

  const finalStatus: SubmissionStatus =
    judgeConfig.judgeMode === "MANUAL"
      ? ("PENDING_REVIEW" as SubmissionStatus)
      : SubmissionStatus.PENDING;

  const data = {
    labId,
    userId,
    submissionKind: "FILE",
    language: selectedLanguage,
    code: "",
    fileName,
    // 文件尚未持久化时不能暴露为可入队的 PENDING。
    status: "PENDING_REVIEW" as SubmissionStatus,
    resultJson:
      judgeConfig.judgeMode === "MANUAL"
        ? JSON.stringify({ note: "等待教师手动批改" })
        : null,
  } as Prisma.SubmissionUncheckedCreateInput;

  const submission = await prisma.submission.create({ data });

  let storedPath: string;
  let storedName: string;
  try {
    const saved = await saveSubmissionFile(submission.id, fileName, fileBuf);
    storedPath = saved.storedPath;
    storedName = saved.fileName;
  } catch (error) {
    await prisma.submission.update({
      where: { id: submission.id },
      data: {
        status: "ERROR",
        resultJson: JSON.stringify({ error: "提交文件保存失败" }),
      },
    });
    throw error;
  }
  const patch = {
    fileStoredPath: storedPath,
    fileName: storedName,
    status: finalStatus,
  } as Prisma.SubmissionUncheckedUpdateInput;
  await prisma.submission.update({
    where: { id: submission.id },
    data: patch,
  });

  if (judgeConfig.judgeMode === "AUTO") {
    await tryEnqueueJudgeSubmission(submission.id);
  }

  return prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
}

export async function readSubmissionCodeForJudge(submission: {
  submissionKind: string;
  code: string;
  fileStoredPath: string | null;
  language: string | null;
  lab: { language: string };
}): Promise<{ code: string; language: string }> {
  const language = submission.language ?? submission.lab.language;
  if (submission.submissionKind === "FILE" && submission.fileStoredPath) {
    const abs = readStoredFileAbs(submission.fileStoredPath);
    const code = await readFile(abs, "utf8");
    return { code, language };
  }
  return { code: submission.code, language };
}

export function attachJudgeConfigToLab<T extends { language: string; labSet: LabJudgeSource }>(
  lab: T & {
    judgeMode?: unknown;
    allowedLanguages?: unknown;
    allowedFileExtensions?: unknown;
  },
) {
  const { lab: l, labSet } = asJudgeSources(lab);
  const judgeConfig = resolveLabJudgeConfig(l, labSet);
  return { ...lab, judgeConfig };
}
