/** 与后端 lab-set-status 返回的 access 字段对齐（展示用） */

export type LabSetAccess = {
  canSubmit: boolean;
  canBrowse: boolean;
  teacherStatus: string;
  studentStatus: string;
  statusLabel: string;
  inMainPeriod: boolean;
  inMakeupPeriod: boolean;
};

export type LabSetTimeFields = {
  startAt?: string | null;
  dueAt?: string | null;
  allowMakeup?: boolean;
  makeupDueAt?: string | null;
  outsideAccessMode?: string;
  access?: LabSetAccess;
};

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "未设置";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "未设置";
  return d.toLocaleString();
}

export function labSetTimeBannerStyle(access: LabSetAccess | undefined) {
  if (!access) return { background: "rgba(80, 120, 200, 0.08)" };
  if (access.studentStatus === "NOT_STARTED" || access.teacherStatus === "NOT_STARTED") {
    return { background: "rgba(120, 120, 120, 0.1)" };
  }
  if (access.inMakeupPeriod || access.studentStatus === "NEEDS_MAKEUP") {
    return { background: "rgba(200, 140, 40, 0.12)", color: "var(--warn, #9a6700)" };
  }
  if (access.studentStatus === "CLOSED" || access.teacherStatus === "CLOSED") {
    return { background: "rgba(180, 60, 60, 0.09)", color: "var(--err, #c44)" };
  }
  return { background: "rgba(80, 120, 200, 0.08)" };
}
