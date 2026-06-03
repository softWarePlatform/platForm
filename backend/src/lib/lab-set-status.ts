/**
 * 实验集时间窗、访问控制与展示状态（前后端逻辑一致，服务端为权威）
 */

export type LabSetOutsideAccessMode = "BLOCK" | "VIEW_ONLY";

/** Prisma findMany/findFirst 用：显式选出时间窗字段（须先执行 prisma generate） */
export const labSetTimeSelect = {
  startAt: true,
  dueAt: true,
  allowMakeup: true,
  makeupDueAt: true,
  outsideAccessMode: true,
  createdAt: true,
} as const;

export const labSetListSelect = {
  id: true,
  courseId: true,
  title: true,
  description: true,
  sortOrder: true,
  ...labSetTimeSelect,
  _count: { select: { labs: true } },
} as const;

export const labSetJudgeSelect = {
  judgeMode: true,
  allowedLanguages: true,
  allowedFileExtensions: true,
  maxReturnCount: true,
} as const;

export const labSetDetailSelect = {
  id: true,
  courseId: true,
  title: true,
  description: true,
  sortOrder: true,
  ...labSetTimeSelect,
  ...labSetJudgeSelect,
  labs: {
    orderBy: { title: "asc" as const },
    select: { id: true, title: true, language: true },
  },
  _count: { select: { labs: true } },
} as const;

export const labSetWithLabsSelect = {
  ...labSetTimeSelect,
  labs: { select: { id: true, title: true }, orderBy: { title: "asc" as const } },
} as const;

/** 与 labSet*Select 查询结果一致（不依赖 Prisma GetPayload，避免 Client 未刷新时 IDE 报错） */
export type LabSetListRow = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  startAt: Date | null;
  dueAt: Date | null;
  allowMakeup: boolean;
  makeupDueAt: Date | null;
  outsideAccessMode: string;
  createdAt: Date;
  _count: { labs: number };
};

export type LabSetDetailRow = Omit<LabSetListRow, "_count"> & {
  labs: Array<{ id: string; title: string; language: string }>;
  _count: { labs: number };
};

export type LabSetWithLabsRow = LabSetTimeRow & {
  labs: Array<{ id: string; title: string }>;
};

export type TeacherLabSetStatus = "NOT_STARTED" | "IN_PROGRESS" | "CLOSED" | "MAKEUP";

export type StudentLabSetStatus = "NOT_STARTED" | "IN_PROGRESS" | "CLOSED" | "NEEDS_MAKEUP";

export type LabSetTimeRow = {
  startAt: Date | null;
  dueAt: Date | null;
  allowMakeup: boolean;
  makeupDueAt: Date | null;
  outsideAccessMode: string;
  createdAt: Date;
};

export type LabSetAccessDto = {
  canSubmit: boolean;
  canBrowse: boolean;
  teacherStatus: TeacherLabSetStatus;
  studentStatus: StudentLabSetStatus;
  statusLabel: string;
  inMainPeriod: boolean;
  inMakeupPeriod: boolean;
};

export const PENALTY_FORMULA =
  "每道已 AC 题：max(0,⌊(首次AC−起点)/60000⌋)+20×首次AC前错误提交次数；总罚时为各题之和。起点=实验开始时间（未设置则为实验集创建时间）。";

const TEACHER_STATUS_LABEL: Record<TeacherLabSetStatus, string> = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  CLOSED: "已截止",
  MAKEUP: "补交中",
};

const STUDENT_STATUS_LABEL: Record<StudentLabSetStatus, string> = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  CLOSED: "已截止",
  NEEDS_MAKEUP: "要补交",
};

export function normalizeOutsideAccessMode(mode: string | null | undefined): LabSetOutsideAccessMode {
  return mode === "VIEW_ONLY" ? "VIEW_ONLY" : "BLOCK";
}

export function labSetTimeFromRow(row: LabSetTimeRow): LabSetTimeRow {
  return {
    startAt: row.startAt,
    dueAt: row.dueAt,
    allowMakeup: row.allowMakeup,
    makeupDueAt: row.makeupDueAt,
    outsideAccessMode: normalizeOutsideAccessMode(row.outsideAccessMode),
    createdAt: row.createdAt,
  };
}

/** 将 Prisma 行（含时间字段子集）规范为 LabSetTimeRow */
export function toLabSetTimeRow(row: {
  startAt?: Date | null;
  dueAt?: Date | null;
  allowMakeup?: boolean;
  makeupDueAt?: Date | null;
  outsideAccessMode?: string | null;
  createdAt: Date;
}): LabSetTimeRow {
  return labSetTimeFromRow({
    startAt: row.startAt ?? null,
    dueAt: row.dueAt ?? null,
    allowMakeup: row.allowMakeup ?? false,
    makeupDueAt: row.makeupDueAt ?? null,
    outsideAccessMode: row.outsideAccessMode ?? "BLOCK",
    createdAt: row.createdAt,
  });
}

/** 罚时起点：startAt ?? createdAt */
export function getPenaltyStartMs(row: Pick<LabSetTimeRow, "startAt" | "createdAt">): number {
  return (row.startAt ?? row.createdAt).getTime();
}

export function getPenaltyStartIso(row: Pick<LabSetTimeRow, "startAt" | "createdAt">): string {
  return new Date(getPenaltyStartMs(row)).toISOString();
}

export function getPenaltySource(row: Pick<LabSetTimeRow, "startAt">): string {
  return row.startAt ? "lab_set_start_at" : "lab_set_created_at";
}

function effectiveStartMs(row: LabSetTimeRow): number {
  return row.startAt?.getTime() ?? row.createdAt.getTime();
}

/** 正式窗口 [startAt, dueAt]；未设 dueAt 则截止不限 */
export function isInMainPeriod(nowMs: number, row: LabSetTimeRow): boolean {
  const t = labSetTimeFromRow(row);
  if (nowMs < effectiveStartMs(t)) return false;
  const due = t.dueAt?.getTime();
  if (due != null && nowMs > due) return false;
  return true;
}

/** 补交窗口：(dueAt, makeupDueAt]；须 allowMakeup 且已设 dueAt */
export function isInMakeupPeriod(nowMs: number, row: LabSetTimeRow): boolean {
  const t = labSetTimeFromRow(row);
  if (!t.allowMakeup || !t.dueAt) return false;
  const due = t.dueAt.getTime();
  if (nowMs <= due) return false;
  const makeupEnd = t.makeupDueAt?.getTime();
  if (makeupEnd != null && nowMs > makeupEnd) return false;
  return true;
}

export function getTeacherStatus(nowMs: number, row: LabSetTimeRow): TeacherLabSetStatus {
  const t = labSetTimeFromRow(row);
  if (nowMs < effectiveStartMs(t)) return "NOT_STARTED";
  const due = t.dueAt?.getTime();
  if (due == null || nowMs <= due) return "IN_PROGRESS";
  if (isInMakeupPeriod(nowMs, t)) return "MAKEUP";
  return "CLOSED";
}

export function getStudentStatus(
  nowMs: number,
  row: LabSetTimeRow,
  labSetCompleted: boolean,
): StudentLabSetStatus {
  const teacher = getTeacherStatus(nowMs, row);
  if (teacher === "NOT_STARTED") return "NOT_STARTED";
  if (teacher === "IN_PROGRESS") return "IN_PROGRESS";
  if (teacher === "MAKEUP" && !labSetCompleted) return "NEEDS_MAKEUP";
  return "CLOSED";
}

export function canSubmitAt(nowMs: number, row: LabSetTimeRow, isTeacher: boolean): boolean {
  if (isTeacher) return true;
  const t = labSetTimeFromRow(row);
  return isInMainPeriod(nowMs, t) || isInMakeupPeriod(nowMs, t);
}

export function canBrowseAt(nowMs: number, row: LabSetTimeRow, isTeacher: boolean): boolean {
  if (isTeacher) return true;
  const t = labSetTimeFromRow(row);
  if (canSubmitAt(nowMs, t, false)) return true;
  if (isInMainPeriod(nowMs, t) || isInMakeupPeriod(nowMs, t)) return true;
  return normalizeOutsideAccessMode(t.outsideAccessMode) === "VIEW_ONLY";
}

export function computeLabSetAccess(opts: {
  row: LabSetTimeRow;
  isTeacher: boolean;
  nowMs?: number;
  labSetCompleted?: boolean;
}): LabSetAccessDto {
  const nowMs = opts.nowMs ?? Date.now();
  const t = labSetTimeFromRow(opts.row);
  const teacherStatus = getTeacherStatus(nowMs, t);
  const studentStatus = getStudentStatus(nowMs, t, opts.labSetCompleted ?? false);
  const statusLabel = opts.isTeacher
    ? TEACHER_STATUS_LABEL[teacherStatus]
    : STUDENT_STATUS_LABEL[studentStatus];

  return {
    canSubmit: canSubmitAt(nowMs, t, opts.isTeacher),
    canBrowse: canBrowseAt(nowMs, t, opts.isTeacher),
    teacherStatus,
    studentStatus,
    statusLabel,
    inMainPeriod: isInMainPeriod(nowMs, t),
    inMakeupPeriod: isInMakeupPeriod(nowMs, t),
  };
}

export function serializeLabSetTimes(
  row: LabSetTimeRow | Parameters<typeof toLabSetTimeRow>[0],
) {
  const t = labSetTimeFromRow(toLabSetTimeRow(row));
  return {
    startAt: t.startAt?.toISOString() ?? null,
    dueAt: t.dueAt?.toISOString() ?? null,
    allowMakeup: t.allowMakeup,
    makeupDueAt: t.makeupDueAt?.toISOString() ?? null,
    outsideAccessMode: normalizeOutsideAccessMode(t.outsideAccessMode),
  };
}

export function penaltyRulePayload(row: LabSetTimeRow) {
  return {
    startAt: getPenaltyStartIso(row),
    source: getPenaltySource(row),
    wrongSubmissionPenaltyMinutes: 20,
    formula: PENALTY_FORMULA,
  };
}

/** 列表分组顺序（与产品文档一致） */
export const STUDENT_GROUP_ORDER: StudentLabSetStatus[] = [
  "NEEDS_MAKEUP",
  "IN_PROGRESS",
  "NOT_STARTED",
  "CLOSED",
];

export const TEACHER_GROUP_ORDER: TeacherLabSetStatus[] = [
  "MAKEUP",
  "IN_PROGRESS",
  "NOT_STARTED",
  "CLOSED",
];

export const STUDENT_GROUP_LABEL: Record<StudentLabSetStatus, string> = {
  NEEDS_MAKEUP: "要补交",
  IN_PROGRESS: "进行中",
  NOT_STARTED: "未开始",
  CLOSED: "已截止",
};

export const TEACHER_GROUP_LABEL: Record<TeacherLabSetStatus, string> = {
  MAKEUP: "补交中",
  IN_PROGRESS: "进行中",
  NOT_STARTED: "未开始",
  CLOSED: "已截止",
};

/** 组内排序：dueAt → startAt → 无时间排最后 */
export function getLabSetSortDueMs(row: LabSetTimeRow): number | null {
  const due = row.dueAt?.getTime();
  if (due != null) return due;
  const start = row.startAt?.getTime();
  if (start != null) return start;
  return null;
}

export function countAcceptedLabsInSet(
  labIds: string[],
  submissions: Array<{ labId: string; userId: string; status: string }>,
  userId: string,
): number {
  if (labIds.length === 0) return 0;
  const ac = new Set(
    submissions
      .filter((s) => s.userId === userId && s.status === "ACCEPTED")
      .map((s) => s.labId),
  );
  return labIds.filter((id) => ac.has(id)).length;
}

/** 至少提交过一次（任意状态）的题目数 */
export function countAttemptedLabsInSet(
  labIds: string[],
  submissions: Array<{ labId: string; userId: string; status: string }>,
  userId: string,
): number {
  if (labIds.length === 0) return 0;
  const tried = new Set(
    submissions.filter((s) => s.userId === userId && labIds.includes(s.labId)).map((s) => s.labId),
  );
  return tried.size;
}

/** 选课学生中集内全部 AC 的人数（与 stats.fullySolvedStudentCount 一致） */
export function countFullySolvedStudents(
  labIds: string[],
  submissions: Array<{ labId: string; userId: string; status: string }>,
  enrolledUserIds: string[],
): number {
  if (labIds.length === 0) return 0;
  let n = 0;
  for (const uid of enrolledUserIds) {
    if (isLabSetCompleted(labIds, submissions, uid)) n += 1;
  }
  return n;
}

/** 实验集内是否全部题目均已 AC（用于学生「要补交」） */
export function isLabSetCompleted(
  labIds: string[],
  submissions: Array<{ labId: string; userId: string; status: string }>,
  userId: string,
): boolean {
  if (labIds.length === 0) return true;
  const acLabs = new Set(
    submissions.filter((s) => s.userId === userId && s.status === "ACCEPTED").map((s) => s.labId),
  );
  return labIds.every((id) => acLabs.has(id));
}
