export type Downstream = "homework" | "course" | "lab" | "monolith" | "none";

const homeworkCourseChild = /^\/api\/courses\/[^/]+\/(homework|grading-config|gradebook)(\/|$)/;
const labCourseChild = /^\/api\/courses\/[^/]+\/(labs|lab-sets|practice|discussions)(\/|$)/;
const labPrefixes = [
  "/api/lab-sets",
  "/api/labs",
  "/api/submissions",
  "/api/testcases",
  "/api/practice",
  "/api/wrong-book",
  "/api/discussion-attachments",
];
const coursePrefixes = [
  "/api/auth",
  "/api/enrollment",
  "/api/announcements",
  "/api/notifications",
  "/api/materials",
  "/api/admin",
  "/api/dashboard",
];

export function classifyApiPath(pathname: string): Downstream {
  const path = pathname.split("?")[0] ?? pathname;
  if (path.startsWith("/internal")) return "none";
  if (!path.startsWith("/api/")) return "none";
  if (path.startsWith("/api/homework") || path.startsWith("/api/grades")) return "homework";
  if (homeworkCourseChild.test(path)) return "homework";
  if (labCourseChild.test(path) || path.startsWith("/api/labs/") && path.includes("/discussions")) return "lab";
  if (labPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return "lab";
  if (coursePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return "course";
  if (path === "/api/courses" || path.startsWith("/api/courses/")) return "course";
  return "monolith";
}

export function downstreamPath(pathname: string): string {
  if (!pathname.startsWith("/api")) return pathname;
  const stripped = pathname.slice("/api".length);
  return stripped.length === 0 ? "/" : stripped;
}
