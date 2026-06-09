export type RubricItem = { name: string; maxScore: number };

export type HomeworkAttachmentRow = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

export type HomeworkFormValues = {
  title: string;
  descriptionMd: string;
  dueAt: string;
  audience: "all" | "class";
  targetClassId: string;
  publishNow: boolean;
  allowLate: boolean;
  latePenaltyPercentPerDay: number;
  lateMaxDays: number;
  allowRedo: boolean;
  maxRedoOption: "1" | "3" | "5" | "unlimited";
  submissionType: "INDIVIDUAL" | "GROUP";
  maxGroupSize: number;
  answerMode: "RICH_TEXT" | "FILE" | "RICH_TEXT_OR_FILE";
  allowMultipleSubmits: boolean;
  requireAttachment: boolean;
  redoReasonRequired: boolean;
  redoGradePolicy: "REPLACE" | "KEEP_MAX";
  rubric: RubricItem[];
};

export const emptyHomeworkForm = (): HomeworkFormValues => ({
  title: "",
  descriptionMd: "",
  dueAt: "",
  audience: "all",
  targetClassId: "",
  publishNow: false,
  allowLate: false,
  latePenaltyPercentPerDay: 10,
  lateMaxDays: 3,
  allowRedo: false,
  maxRedoOption: "1",
  submissionType: "INDIVIDUAL",
  maxGroupSize: 4,
  answerMode: "RICH_TEXT",
  allowMultipleSubmits: false,
  requireAttachment: false,
  redoReasonRequired: false,
  redoGradePolicy: "KEEP_MAX",
  rubric: [],
});

export function homeworkToFormValues(hw: any): HomeworkFormValues {
  let rubric: RubricItem[] = hw.rubric ?? [];
  if (!rubric.length && hw.rubricJson) {
    try {
      rubric = JSON.parse(hw.rubricJson);
    } catch {
      rubric = [];
    }
  }
  let maxRedoOption: HomeworkFormValues["maxRedoOption"] = "1";
  if (hw.maxRedoCount === -1) maxRedoOption = "unlimited";
  else if (hw.maxRedoCount === 3) maxRedoOption = "3";
  else if (hw.maxRedoCount === 5) maxRedoOption = "5";

  return {
    title: hw.title ?? "",
    descriptionMd: hw.descriptionMd ?? hw.description ?? "",
    dueAt: hw.dueAt ? toLocalInput(hw.dueAt) : "",
    audience: hw.targetClassId ? "class" : "all",
    targetClassId: hw.targetClassId ?? "",
    publishNow: false,
    allowLate: Boolean(hw.allowLate),
    latePenaltyPercentPerDay: hw.latePenaltyPercentPerDay ?? 10,
    lateMaxDays: hw.lateMaxDays ?? 3,
    allowRedo: Boolean(hw.allowRedo),
    maxRedoOption,
    submissionType: hw.submissionType ?? "INDIVIDUAL",
    maxGroupSize: hw.maxGroupSize ?? 4,
    answerMode: hw.answerMode ?? "RICH_TEXT",
    allowMultipleSubmits: Boolean(hw.allowMultipleSubmits),
    requireAttachment: Boolean(hw.requireAttachment),
    redoReasonRequired: Boolean(hw.redoReasonRequired),
    redoGradePolicy: hw.redoGradePolicy ?? "KEEP_MAX",
    rubric,
  };
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formValuesToPayload(v: HomeworkFormValues, opts?: { includePublish?: boolean }) {
  const maxRedoCount = !v.allowRedo
    ? null
    : v.maxRedoOption === "unlimited"
      ? -1
      : Number(v.maxRedoOption);

  const body: Record<string, unknown> = {
    title: v.title.trim(),
    descriptionMd: v.descriptionMd.trim() || null,
    dueAt: v.dueAt ? new Date(v.dueAt).toISOString() : null,
    targetClassId: v.audience === "class" ? v.targetClassId : null,
    allowLate: v.allowLate,
    latePenaltyPercentPerDay: v.allowLate ? v.latePenaltyPercentPerDay : null,
    lateMaxDays: v.allowLate ? v.lateMaxDays : null,
    allowRedo: v.allowRedo,
    maxRedoCount,
    submissionType: v.submissionType,
    maxGroupSize: v.submissionType === "GROUP" ? v.maxGroupSize : null,
    answerMode: v.answerMode,
    allowMultipleSubmits: v.allowMultipleSubmits,
    requireAttachment: v.requireAttachment,
    redoReasonRequired: v.allowRedo ? v.redoReasonRequired : false,
    redoGradePolicy: v.redoGradePolicy,
    rubricJson: v.rubric.filter((r) => r.name.trim()).length ? v.rubric : null,
  };
  if (opts?.includePublish) body.published = v.publishNow;
  return body;
}
