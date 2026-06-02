/** 与 Prisma Lab / LabSet 批改字段对齐（避免 Client 未 generate 时 Pick<Lab> 报错） */

export type JudgeModeValue = "AUTO" | "MANUAL";

export type LabJudgeSource = {
  judgeMode?: JudgeModeValue | null;
  allowedLanguages?: string[] | null;
  allowedFileExtensions?: string[] | null;
  language?: string;
};

export type LabJudgeConfig = {
  judgeMode: JudgeModeValue;
  allowedLanguages: string[];
  allowedFileExtensions: string[];
};

const DEFAULT_EXTENSIONS = [".py", ".js", ".ts", ".java", ".cpp", ".c", ".txt"];
const DEFAULT_LANGUAGES = ["python", "javascript"];

function arrOrEmpty(v: string[] | null | undefined): string[] {
  return Array.isArray(v) ? v : [];
}

export function resolveLabJudgeConfig(lab: LabJudgeSource, labSet: LabJudgeSource): LabJudgeConfig {
  const labLangs = arrOrEmpty(lab.allowedLanguages);
  const setLangs = arrOrEmpty(labSet.allowedLanguages);
  const labExts = arrOrEmpty(lab.allowedFileExtensions);
  const setExts = arrOrEmpty(labSet.allowedFileExtensions);

  const judgeMode = (lab.judgeMode ?? labSet.judgeMode ?? "AUTO") as JudgeModeValue;
  const allowedLanguages =
    labLangs.length > 0 ? labLangs : setLangs.length > 0 ? setLangs : DEFAULT_LANGUAGES;
  const allowedFileExtensions =
    labExts.length > 0 ? labExts : setExts.length > 0 ? setExts : DEFAULT_EXTENSIONS;
  return { judgeMode, allowedLanguages, allowedFileExtensions };
}

export function extensionAllowed(fileName: string, allowed: string[]): boolean {
  const lower = fileName.toLowerCase();
  const exts = allowed.map((e) => (e.startsWith(".") ? e.toLowerCase() : `.${e.toLowerCase()}`));
  return exts.some((ext) => lower.endsWith(ext));
}

export function serializeJudgeConfig(config: LabJudgeConfig) {
  return {
    judgeMode: config.judgeMode,
    allowedLanguages: config.allowedLanguages,
    allowedFileExtensions: config.allowedFileExtensions,
  };
}

/** Lab findUnique / findFirst 显式选出批改相关字段 */
export const labJudgeSelect = {
  judgeMode: true,
  allowedLanguages: true,
  allowedFileExtensions: true,
} as const;
