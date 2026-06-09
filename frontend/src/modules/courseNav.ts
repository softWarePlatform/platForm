/** 课程主页模块（仅保留产品要求的六项） */

export type CourseModuleStatus = "implemented" | "partial" | "planned";

export type CourseModule = {
  id: string;
  label: string;
  segment: string;
  status: CourseModuleStatus;
};

export const COURSE_MODULES: CourseModule[] = [
  { id: "announcements", label: "课程公告", segment: "announcements", status: "implemented" },
  { id: "homework", label: "作业管理", segment: "homework", status: "implemented" },
  { id: "labs", label: "实验管理", segment: "labs", status: "implemented" },
  { id: "grades", label: "成绩统计", segment: "grades", status: "implemented" },
  { id: "practice", label: "练习", segment: "practice", status: "implemented" },
  { id: "materials", label: "课程资料管理", segment: "materials", status: "implemented" },
];

export function courseModulesForNav() {
  return COURSE_MODULES;
}
