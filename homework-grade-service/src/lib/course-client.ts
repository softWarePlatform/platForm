import { config } from "./config.js";
import type { Role } from "./auth.js";

export type CourseUser = { id: string; email: string; name: string; role: Role };

export type CourseInfo = {
  id: string;
  title: string;
  teacherId: string;
  published: boolean;
  teacher?: { id: string; name: string; email?: string };
};

export type CourseAccess = {
  course: CourseInfo | null;
  canView: boolean;
  isTeacher: boolean;
  rosterStatus: "OK" | "UNAVAILABLE";
  students: CourseUser[];
};

type Json = Record<string, unknown>;

async function courseFetch(path: string, init: RequestInit = {}, timeoutMs = 2000): Promise<{ status: number; body: Json }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await Promise.race([
      fetch(`${config.courseServiceUrl}${path}`, { ...init, signal: controller.signal }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("course-service-timeout")), timeoutMs);
      }),
    ]);
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) return { status: response.status, body: {} };
    const body = await Promise.race([
      response.json() as Promise<Json>,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("course-service-body-timeout")), timeoutMs);
      }),
    ]);
    return { status: response.status, body };
  } catch {
    return { status: 503, body: { error: "course-service-unavailable" } };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchMe(authorization: string): Promise<CourseUser | null> {
  const result = await courseFetch("/auth/me", { headers: { authorization } });
  if (result.status !== 200) return null;
  const user = result.body.user as CourseUser | undefined;
  if (!user?.id || !user.role) return null;
  return user;
}

export async function fetchCourse(courseId: string, authorization?: string): Promise<CourseInfo | null> {
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  const result = await courseFetch(`/courses/${courseId}`, { headers });
  if (result.status !== 200) return null;
  const course = result.body.course as CourseInfo | undefined;
  if (!course?.id) return null;
  return course;
}

async function studentEnrolled(courseId: string, authorization: string): Promise<boolean> {
  const result = await courseFetch("/enrollment/catalog", { headers: { authorization } });
  if (result.status !== 200) return false;
  const courses = (result.body.courses as Array<{ id: string; enrolled?: boolean }> | undefined) ?? [];
  return courses.some((course) => course.id === courseId && course.enrolled);
}

const roles: Role[] = ["STUDENT", "TEACHER", "ADMIN"];

export function parseEnrollmentRoster(body: Json): CourseUser[] {
  const raw = body.items ?? body.students;
  if (!Array.isArray(raw)) return [];
  const students: CourseUser[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = String(record.id ?? record.userId ?? "");
    if (!id) continue;
    const role = roles.includes(record.role as Role) ? (record.role as Role) : "STUDENT";
    students.push({
      id,
      email: String(record.email ?? ""),
      name: String(record.name ?? id),
      role,
    });
  }
  return students;
}

export async function fetchRoster(courseId: string): Promise<{ status: "OK" | "UNAVAILABLE"; students: CourseUser[] }> {
  const result = await courseFetch(
    `/internal/courses/${courseId}/enrollments`,
    { headers: { "x-internal-service-token": config.internalServiceToken } },
  );
  if (result.status !== 200) return { status: "UNAVAILABLE", students: [] };
  return { status: "OK", students: parseEnrollmentRoster(result.body) };
}

export async function resolveCourseAccess(
  userId: string,
  role: Role,
  courseId: string,
  authorization?: string,
): Promise<CourseAccess> {
  const course = await fetchCourse(courseId, authorization);
  if (!course) return { course: null, canView: false, isTeacher: false, rosterStatus: "UNAVAILABLE", students: [] };
  const isTeacher = role === "ADMIN" || course.teacherId === userId;
  let canView = isTeacher;
  if (!canView && authorization) canView = await studentEnrolled(courseId, authorization);
  const roster = isTeacher ? await fetchRoster(courseId) : { status: "UNAVAILABLE" as const, students: [] };
  return { course, canView, isTeacher, rosterStatus: roster.status, students: roster.students };
}

export async function notifyUsers(payload: {
  userIds: string[];
  title: string;
  body: string;
  homeworkId?: string;
  requestId?: string;
}): Promise<void> {
  const idempotencyKey = payload.requestId ?? `${payload.homeworkId}:${payload.title}:${payload.userIds.join(",")}`;
  const result = await courseFetch("/internal/notifications", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-internal-service-token": config.internalServiceToken,
      "idempotency-key": idempotencyKey,
      ...(payload.requestId ? { "x-request-id": payload.requestId } : {}),
    },
    body: JSON.stringify({
      userIds: payload.userIds,
      type: "HOMEWORK",
      title: payload.title,
      body: payload.body,
      homeworkId: payload.homeworkId,
      idempotencyKey,
    }),
  });
  if (result.status >= 400) {
    console.warn("course-service notification skipped", result.status, result.body);
  }
}
