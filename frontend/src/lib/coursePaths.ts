import type { Role } from "../auth/AuthContext";

export type CoursePortal = "student" | "teacher" | "admin";

export function portalForRole(role?: Role | null): CoursePortal {
  if (role === "ADMIN") return "admin";
  if (role === "TEACHER") return "teacher";
  return "student";
}

export function coursePortalPrefix(portal: CoursePortal) {
  return `/${portal}/courses`;
}

export function coursePath(
  courseId: string,
  segment = "announcements",
  portal: CoursePortal = "student",
) {
  const clean = segment.replace(/^\/+/, "");
  return `${coursePortalPrefix(portal)}/${courseId}${clean ? `/${clean}` : ""}`;
}

export function coursePathForRole(courseId: string, segment = "announcements", role?: Role | null) {
  return coursePath(courseId, segment, portalForRole(role));
}

export function courseManagePathForRole(courseId: string, role?: Role | null) {
  return coursePathForRole(courseId, "manage", role);
}

export function legacyCoursePathToRolePath(pathname: string, role?: Role | null) {
  const portal = portalForRole(role);
  return pathname.replace(/^\/courses(?=\/|$)/, coursePortalPrefix(portal));
}
