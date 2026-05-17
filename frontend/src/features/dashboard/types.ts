export type ScheduleSlot = {
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  room: string;
};

export type DashboardCourse = {
  id: string;
  title: string;
  category: string | null;
  teacherName: string;
  startAt: string | null;
  endAt: string | null;
  progressPercent: number;
  pendingHomework: number;
  pendingLabs: number;
  announcementCount: number;
  isHistory: boolean;
  scheduleSlots: ScheduleSlot[];
};

export type DashboardDeadline = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  type: "homework" | "labSet";
  dueAt: string;
};

export type DashboardPayload = {
  role: "STUDENT" | "TEACHER" | "ADMIN";
  semester: { key: string; label: string };
  courses: DashboardCourse[];
  deadlines: DashboardDeadline[];
};

export type CustomScheduleEvent = {
  id: string;
  title: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  room?: string;
  color: string;
  weekParity?: "all" | "odd" | "even";
};

export type CourseGroupKey =
  | "core"
  | "elective"
  | "general"
  | "lab"
  | "cross"
  | "other"
  | "history";

export const COURSE_GROUP_META: Record<
  CourseGroupKey,
  { label: string; hint: string }
> = {
  core: { label: "核心专业课", hint: "本专业必修核心课程" },
  elective: { label: "专业选修课", hint: "专业方向内选修" },
  general: { label: "基础通识课", hint: "数学、英语、思政等" },
  lab: { label: "实验实践课", hint: "独立设课的实验/实践" },
  cross: { label: "跨专业/公选课", hint: "全校公选或跨专业选修" },
  other: { label: "其他课程", hint: "未分类课程" },
  history: { label: "历史课程", hint: "已结束学期归档" },
};
