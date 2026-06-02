import type { CourseGroupKey, DashboardCourse } from "./types";

const GENERAL_KW = ["数学", "英语", "思政", "马克思", "近代史", "体育", "通识"];
const LAB_KW = ["实验", "实践", "实训"];
const CROSS_KW = ["公选", "跨专业", "选修通识"];
const ELECTIVE_KW = ["选修", "方向"];

export function classifyCourse(course: DashboardCourse): CourseGroupKey {
  if (course.isHistory) return "history";
  const cat = (course.category ?? "").toLowerCase();
  const title = course.title.toLowerCase();
  const blob = `${cat} ${title}`;

  if (LAB_KW.some((k) => blob.includes(k))) return "lab";
  if (CROSS_KW.some((k) => blob.includes(k))) return "cross";
  if (ELECTIVE_KW.some((k) => blob.includes(k))) return "elective";
  if (GENERAL_KW.some((k) => blob.includes(k))) return "general";
  if (cat.includes("数据结构") || cat.includes("程序设计") || cat.includes("专业")) return "core";
  if (course.category) return "core";
  return "other";
}

export function groupCourses(courses: DashboardCourse[]) {
  const active = courses.filter((c) => !c.isHistory);
  const history = courses.filter((c) => c.isHistory);
  const buckets = new Map<CourseGroupKey, DashboardCourse[]>();

  for (const c of active) {
    const key = classifyCourse(c);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const order: CourseGroupKey[] = ["core", "elective", "general", "lab", "cross", "other"];
  const groups = order
    .filter((k) => (buckets.get(k)?.length ?? 0) > 0)
    .map((k) => ({ key: k, courses: buckets.get(k)! }));

  if (history.length > 0) {
    groups.push({ key: "history" as const, courses: history });
  }

  return groups;
}
