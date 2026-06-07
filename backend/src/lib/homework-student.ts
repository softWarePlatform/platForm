import type { Homework, HomeworkRedoRequest, HomeworkSubmission } from "@prisma/client";

export type StudentHomeworkStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "LOCKED"
  | "OVERDUE"
  | "RETURNED"
  | "REDO_PENDING";

export function computeLateMeta(hw: Homework, at: Date = new Date()) {
  if (!hw.dueAt || at <= hw.dueAt) {
    return { isLate: false, lateDays: 0, canSubmit: true, lateHint: null as string | null };
  }
  const lateDays = Math.ceil((at.getTime() - hw.dueAt.getTime()) / 86400000);
  if (!hw.allowLate) {
    return {
      isLate: true,
      lateDays,
      canSubmit: false,
      lateHint: "已过截止时间，不允许提交",
    };
  }
  if (hw.lateMaxDays != null && lateDays > hw.lateMaxDays) {
    return {
      isLate: true,
      lateDays,
      canSubmit: false,
      lateHint: `已超过迟交最长期限（${hw.lateMaxDays} 天）`,
    };
  }
  const pct = hw.latePenaltyPercentPerDay ?? 10;
  const hint = `本次提交已超时 ${lateDays} 天，将按规则每日扣减最高分的 ${pct}%（超过 ${hw.lateMaxDays ?? 3} 天按 0 分计）`;
  return { isLate: true, lateDays, canSubmit: true, lateHint: hint };
}

/** 是否已正式提交（含 seed 遗留：有内容且已批改但未写 submittedAt） */
export function isSubmissionFinalized(sub: HomeworkSubmission | null): boolean {
  if (!sub) return false;
  if (sub.returnReason && !sub.locked) return false;
  return Boolean(
    sub.locked || sub.submittedAt || (sub.graded && Boolean(sub.content?.trim())),
  );
}

export function remainingRedoCount(hw: Homework, sub: HomeworkSubmission | null): number | null {
  if (!hw.allowRedo) return null;
  if (hw.maxRedoCount === -1) return null;
  const max = hw.maxRedoCount ?? 1;
  const used = sub?.redoUsedCount ?? 0;
  return Math.max(0, max - used);
}

export function computeStudentStatus(
  hw: Homework,
  sub: HomeworkSubmission | null,
  pendingRedo: HomeworkRedoRequest | null,
  now: Date = new Date(),
): StudentHomeworkStatus {
  if (pendingRedo?.status === "PENDING") return "REDO_PENDING";
  if (sub?.returnReason && !sub.locked) return "RETURNED";

  const finalized = isSubmissionFinalized(sub);
  const hasDraft = Boolean(
    sub?.draftContent?.trim() || (!finalized && sub?.content?.trim()),
  );

  if (finalized) {
    if (sub?.graded) return "LOCKED";
    return sub?.locked || sub?.submittedAt ? "SUBMITTED" : "LOCKED";
  }

  if (sub?.locked) return "LOCKED";

  const late = computeLateMeta(hw, now);
  if (!hasDraft && hw.dueAt && now > hw.dueAt && !late.canSubmit) {
    return "OVERDUE";
  }
  if (!hasDraft) return "NOT_STARTED";
  return "IN_PROGRESS";
}

export const STATUS_LABELS: Record<StudentHomeworkStatus, string> = {
  NOT_STARTED: "未开始",
  IN_PROGRESS: "进行中",
  SUBMITTED: "已提交",
  LOCKED: "已提交",
  OVERDUE: "已逾期",
  RETURNED: "已打回",
  REDO_PENDING: "重做申请待审批",
};

export function statusBadgeClass(status: StudentHomeworkStatus): string {
  switch (status) {
    case "RETURNED":
      return "hw-status hw-status--returned";
    case "OVERDUE":
      return "hw-status hw-status--overdue";
    case "REDO_PENDING":
      return "hw-status hw-status--pending";
    case "SUBMITTED":
    case "LOCKED":
      return "hw-status hw-status--submitted";
    case "IN_PROGRESS":
      return "hw-status hw-status--progress";
    default:
      return "hw-status";
  }
}
