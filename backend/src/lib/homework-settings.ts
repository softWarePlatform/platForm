import { z } from "zod";

export const HOMEWORK_ATTACHMENT_EXT = [".pdf", ".doc", ".docx", ".zip", ".rar"] as const;
export const HOMEWORK_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const HOMEWORK_ATTACHMENT_MAX_COUNT = 10;

const rubricItemSchema = z.object({
  name: z.string().min(1).max(80),
  maxScore: z.number().min(0).max(1000),
});

export const homeworkSettingsSchema = z.object({
  descriptionMd: z.string().max(50000).optional().nullable(),
  allowLate: z.boolean().optional(),
  latePenaltyPercentPerDay: z.number().min(0).max(100).optional().nullable(),
  lateMaxDays: z.number().int().min(1).max(365).optional().nullable(),
  allowRedo: z.boolean().optional(),
  maxRedoCount: z.number().int().min(-1).max(999).optional().nullable(),
  submissionType: z.enum(["INDIVIDUAL", "GROUP"]).optional(),
  maxGroupSize: z.number().int().min(2).max(50).optional().nullable(),
  answerMode: z.enum(["RICH_TEXT", "FILE", "RICH_TEXT_OR_FILE"]).optional(),
  allowMultipleSubmits: z.boolean().optional(),
  requireAttachment: z.boolean().optional(),
  redoReasonRequired: z.boolean().optional(),
  redoGradePolicy: z.enum(["REPLACE", "KEEP_MAX"]).optional(),
  rubricJson: z
    .union([
      z.array(rubricItemSchema),
      z.string().transform((s, ctx) => {
        try {
          const parsed = JSON.parse(s) as unknown;
          const r = z.array(rubricItemSchema).safeParse(parsed);
          if (!r.success) {
            ctx.addIssue({ code: "custom", message: "评分维度 JSON 无效" });
            return z.NEVER;
          }
          return r.data;
        } catch {
          ctx.addIssue({ code: "custom", message: "评分维度 JSON 无效" });
          return z.NEVER;
        }
      }),
    ])
    .optional()
    .nullable(),
});

export const homeworkCreateSchema = z
  .object({
    title: z.string().min(1).max(100),
    description: z.string().max(50000).optional(),
    dueAt: z.coerce.date().optional().nullable(),
    targetClassId: z.string().uuid().optional().nullable(),
    published: z.boolean().optional(),
  })
  .merge(homeworkSettingsSchema);

export const homeworkPatchSchema = z
  .object({
    title: z.string().min(1).max(100).optional(),
    description: z.string().max(50000).nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
    targetClassId: z.string().uuid().nullable().optional(),
  })
  .merge(homeworkSettingsSchema.partial());

export type RubricItem = z.infer<typeof rubricItemSchema>;

export function normalizeHomeworkSettingsInput(data: z.infer<typeof homeworkSettingsSchema>) {
  const rubric =
    data.rubricJson == null
      ? undefined
      : Array.isArray(data.rubricJson)
        ? data.rubricJson
        : undefined;
  const rubricJson = rubric && rubric.length > 0 ? JSON.stringify(rubric) : null;

  let maxRedoCount: number | null = data.maxRedoCount ?? null;
  const allowRedo = data.allowRedo ?? false;
  if (!allowRedo) maxRedoCount = null;
  else if (maxRedoCount == null) maxRedoCount = 1;

  const submissionType = data.submissionType ?? "INDIVIDUAL";
  let maxGroupSize: number | null = data.maxGroupSize ?? null;
  if (submissionType === "GROUP") {
    if (!maxGroupSize || maxGroupSize < 2) maxGroupSize = 4;
  } else {
    maxGroupSize = null;
  }

  const allowLate = data.allowLate ?? false;
  let latePenaltyPercentPerDay: number | null = data.latePenaltyPercentPerDay ?? null;
  let lateMaxDays: number | null = data.lateMaxDays ?? null;
  if (!allowLate) {
    latePenaltyPercentPerDay = null;
    lateMaxDays = null;
  } else {
    if (latePenaltyPercentPerDay == null) latePenaltyPercentPerDay = 10;
    if (lateMaxDays == null) lateMaxDays = 3;
  }

  const descriptionMd = data.descriptionMd?.trim() || null;

  return {
    descriptionMd,
    description: descriptionMd,
    allowLate,
    latePenaltyPercentPerDay,
    lateMaxDays,
    allowRedo,
    maxRedoCount,
    submissionType,
    maxGroupSize,
    rubricJson,
    answerMode: data.answerMode ?? "RICH_TEXT",
    allowMultipleSubmits: data.allowMultipleSubmits ?? false,
    requireAttachment: data.requireAttachment ?? false,
    redoReasonRequired: data.redoReasonRequired ?? false,
    redoGradePolicy: data.redoGradePolicy ?? "KEEP_MAX",
  };
}

export function attachmentExtAllowed(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return HOMEWORK_ATTACHMENT_EXT.some((ext) => lower.endsWith(ext));
}

export function revisionSummary(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string {
  const keys = [
    "descriptionMd",
    "dueAt",
    "allowLate",
    "latePenaltyPercentPerDay",
    "lateMaxDays",
    "allowRedo",
    "maxRedoCount",
    "submissionType",
    "maxGroupSize",
    "rubricJson",
    "targetClassId",
    "answerMode",
    "allowMultipleSubmits",
    "requireAttachment",
    "redoReasonRequired",
    "redoGradePolicy",
  ];
  const changed = keys.filter((k) => JSON.stringify(prev[k]) !== JSON.stringify(next[k]));
  if (changed.length === 0) return "更新作业设置";
  return `更新：${changed.join("、")}`;
}
