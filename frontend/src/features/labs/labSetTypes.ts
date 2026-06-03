import type { LabSetAccess } from "./labSetAccess";

export type LabSetOverviewProgress = {
  done: number;
  total: number;
  attempted: number;
};

export type LabSetOverviewCompletion = {
  solved: number;
  enrolled: number;
};

export type StudentLabSetOverviewCard = {
  id: string;
  courseId: string;
  courseTitle: string;
  title: string;
  description: string | null;
  sortOrder: number;
  problemCount: number;
  startAt: string | null;
  dueAt: string | null;
  allowMakeup: boolean;
  makeupDueAt: string | null;
  outsideAccessMode: "BLOCK" | "VIEW_ONLY";
  access: LabSetAccess;
  progress: LabSetOverviewProgress;
  completed: boolean;
  score: number | null;
};

export type TeacherLabSetOverviewCard = Omit<
  StudentLabSetOverviewCard,
  "progress" | "completed" | "score"
> & {
  completion: LabSetOverviewCompletion;
};

export type LabSetOverviewGroup<T> = {
  status: string;
  label: string;
  items: T[];
};

export type StudentOverviewResponse = {
  groups: LabSetOverviewGroup<StudentLabSetOverviewCard>[];
  total: number;
};

export type TeacherOverviewResponse = {
  groups: LabSetOverviewGroup<TeacherLabSetOverviewCard>[];
  total: number;
};
