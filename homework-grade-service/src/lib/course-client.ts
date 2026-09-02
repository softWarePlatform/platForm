import { config } from "./config.js";
import type { Role } from "./auth.js";
import { sendError } from "./http-error.js";
import { httpJson } from "./http.js";
import { raceTimeoutFallback } from "./timeout.js";

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
  isEnrolled: boolean;
  classIds: string[];
  accessStatus: "OK" | "UNAVAILABLE";
  rosterStatus: "OK" | "UNAVAILABLE";
  students: CourseUser[];
};

export type AccessDenial = { status: 403 | 404 | 503; code: string; error: string };

type Json = Record<string, unknown>;

const ACCESS_TIMEOUT_MS = 1000;
const ROSTER_TIMEOUT_MS = 2000;
const NOTIFY_TIMEOUT_MS = 2000;

function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "x-internal-service-token": config.internalServiceToken, ...extra };
}

function emptyAccess(accessStatus: "OK" | "UNAVAILABLE"): CourseAccess {
  return {
    course: null,
    canView: false,
    isTeacher: false,
    isEnrolled: false,
    classIds: [],
    accessStatus,
    rosterStatus: "UNAVAILABLE",
    students: [],
  };
}

async function courseFetch(path: string, init: RequestInit = {}, timeoutMs = 2000): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });
  try {
    return await httpJson(`${config.courseServiceUrl}${path}`, {
      method: typeof init.method === "string" ? init.method : "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
      timeoutMs,
    });
  } catch {
    return { status: 503, body: { error: "course-service-unavailable" } };
  }
}

export async function fetchMe(authorization: string): Promise<CourseUser | null> {
  const result = await courseFetch("/auth/me", { headers: { authorization } });
  if (result.status !== 200) return null;
  const user = result.body.user as CourseUser | undefined;
  if (!user?.id || !user.role) return null;
  return user;
}

export function parseInternalCourse(body: Json): CourseInfo | null {
  const raw = body.course;
  if (!raw || typeof raw !== "object") return null;
  const course = raw as Record<string, unknown>;
  const id = String(course.id ?? "");
  if (!id) return null;
  const teacher = course.teacher && typeof course.teacher === "object" ? (course.teacher as CourseInfo["teacher"]) : undefined;
  return {
    id,
    title: String(course.title ?? id),
    teacherId: String(course.teacherId ?? ""),
    published: Boolean(course.published),
    teacher,
  };
}

async function loadCourse(courseId: string): Promise<CourseInfo | null> {
  const result = await courseFetch(`/internal/courses/${courseId}`, { headers: internalHeaders() }, ACCESS_TIMEOUT_MS);
  if (result.status !== 200) return null;
  return parseInternalCourse(result.body);
}

export async function fetchCourse(courseId: string): Promise<CourseInfo | null> {
  return raceTimeoutFallback(loadCourse(courseId), ACCESS_TIMEOUT_MS, null);
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

export function parseInternalAccess(body: Json): {
  canView: boolean;
  isTeacher: boolean;
  isEnrolled: boolean;
  classIds: string[];
  courseId: string;
} | null {
  const raw = (body.access && typeof body.access === "object" ? body.access : body) as Record<string, unknown>;
  if (typeof raw.canView !== "boolean" || typeof raw.isTeacher !== "boolean") return null;
  const classIds = Array.isArray(raw.classIds)
    ? raw.classIds.map((value) => String(value)).filter(Boolean)
    : raw.classId
      ? [String(raw.classId)]
      : [];
  return {
    canView: raw.canView,
    isTeacher: raw.isTeacher,
    isEnrolled: Boolean(raw.isEnrolled),
    classIds,
    courseId: String(raw.courseId ?? ""),
  };
}

async function loadRoster(courseId: string): Promise<{ status: "OK" | "UNAVAILABLE"; students: CourseUser[] }> {
  const result = await courseFetch(
    `/internal/courses/${courseId}/enrollments?page=1&pageSize=200`,
    { headers: internalHeaders() },
    ROSTER_TIMEOUT_MS,
  );
  if (result.status !== 200) return { status: "UNAVAILABLE", students: [] };
  return { status: "OK", students: parseEnrollmentRoster(result.body) };
}

export async function fetchRoster(courseId: string): Promise<{ status: "OK" | "UNAVAILABLE"; students: CourseUser[] }> {
  return raceTimeoutFallback(loadRoster(courseId), ROSTER_TIMEOUT_MS, { status: "UNAVAILABLE", students: [] });
}

function courseStub(courseId: string): CourseInfo {
  return { id: courseId, title: courseId, teacherId: "", published: true };
}

export async function resolveCourseAccess(userId: string, courseId: string): Promise<CourseAccess> {
  const [accessResult, course] = await Promise.all([
    courseFetch(`/internal/courses/${courseId}/access/${userId}`, { headers: internalHeaders() }, ACCESS_TIMEOUT_MS),
    fetchCourse(courseId),
  ]);

  if (accessResult.status === 404) return emptyAccess("OK");
  if (accessResult.status !== 200) return emptyAccess("UNAVAILABLE");

  const parsed = parseInternalAccess(accessResult.body);
  if (!parsed) return emptyAccess("UNAVAILABLE");

  const roster = parsed.isTeacher ? await fetchRoster(courseId) : { status: "UNAVAILABLE" as const, students: [] };
  return {
    course: course ?? courseStub(parsed.courseId || courseId),
    canView: parsed.canView,
    isTeacher: parsed.isTeacher,
    isEnrolled: parsed.isEnrolled,
    classIds: parsed.classIds,
    accessStatus: "OK",
    rosterStatus: roster.status,
    students: roster.students,
  };
}

export function teacherAccessDenial(access: CourseAccess): AccessDenial | null {
  if (access.accessStatus === "UNAVAILABLE") return { status: 503, code: "COURSE_UNAVAILABLE", error: "课程服务暂时不可用" };
  if (!access.course) return { status: 404, code: "NOT_FOUND", error: "课程不存在" };
  if (!access.isTeacher) return { status: 403, code: "FORBIDDEN", error: "无权操作" };
  return null;
}

export function viewAccessDenial(access: CourseAccess, forbidden = "无权查看"): AccessDenial | null {
  if (access.accessStatus === "UNAVAILABLE") return { status: 503, code: "COURSE_UNAVAILABLE", error: "课程服务暂时不可用" };
  if (!access.course) return { status: 404, code: "NOT_FOUND", error: "课程不存在" };
  if (!access.canView) return { status: 403, code: "FORBIDDEN", error: forbidden };
  return null;
}

export function sendAccessDenial(
  reply: Parameters<typeof sendError>[0],
  request: Parameters<typeof sendError>[1],
  denied: AccessDenial | null,
): boolean {
  if (!denied) return false;
  void sendError(reply, request, denied.status, denied.code, denied.error);
  return true;
}

export async function notifyUsers(payload: {
  userIds: string[];
  title: string;
  body: string;
  homeworkId?: string;
  requestId?: string;
}): Promise<void> {
  if (payload.userIds.length === 0) return;
  const rawKey = payload.requestId ?? `${payload.homeworkId}:${payload.title}:${payload.userIds.join(",")}`;
  const idempotencyKey = rawKey.length >= 8 ? rawKey.slice(0, 200) : rawKey.padEnd(8, "0");
  const result = await courseFetch(
    "/internal/notifications",
    {
      method: "POST",
      headers: internalHeaders({
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        ...(payload.requestId ? { "x-request-id": payload.requestId } : {}),
      }),
      body: JSON.stringify({
        userIds: payload.userIds,
        type: "HOMEWORK",
        title: payload.title,
        body: payload.body,
        homeworkId: payload.homeworkId,
        idempotencyKey,
      }),
    },
    NOTIFY_TIMEOUT_MS,
  );
  if (result.status >= 400) {
    console.warn("course-service notification skipped", result.status, result.body);
  }
}
