/** 构建选课目录查询串（数组用重复 key，保证后端 AND 收到全部筛选条件） */
export function buildCatalogQueryString(input: {
  courseCode?: string;
  teacher?: string;
  className?: string;
  scheduleTime?: string;
  scheduleRoom?: string;
  courseNatures?: string[];
  subjectCategories?: string[];
  offeringColleges?: string[];
}) {
  const sp = new URLSearchParams();
  const set = (k: string, v: string) => {
    if (v.trim()) sp.set(k, v.trim());
  };
  set("courseCode", input.courseCode ?? "");
  set("teacher", input.teacher ?? "");
  set("className", input.className ?? "");
  set("scheduleTime", input.scheduleTime ?? "");
  set("scheduleRoom", input.scheduleRoom ?? "");
  for (const v of input.courseNatures ?? []) sp.append("courseNature", v);
  for (const v of input.subjectCategories ?? []) sp.append("subjectCategory", v);
  for (const v of input.offeringColleges ?? []) sp.append("offeringCollege", v);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
