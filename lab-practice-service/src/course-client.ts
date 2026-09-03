import { labConfig } from "./config.js";

export type CourseUser = {
  id: string;
  email: string;
  name: string;
  role: "STUDENT" | "TEACHER" | "ADMIN";
  status?: string;
};

export type CourseInfo = {
  id: string;
  title: string;
  teacherId: string;
  published: boolean;
  teacher?: { id: string; name: string; email?: string };
};

export type CourseAccess = {
  userId: string;
  courseId: string;
  role: CourseUser["role"];
  canView: boolean;
  isTeacher: boolean;
  isEnrolled: boolean;
  classId: string | null;
  classIds: string[];
};

type RosterBody = {
  items?: CourseUser[];
  students?: CourseUser[];
  total?: number;
};

type JsonObject = Record<string, unknown>;

export class CourseClientError extends Error {
  constructor(public readonly operation: string, public readonly status: number) {
    super(`${operation}-${status}`);
    this.name = "CourseClientError";
  }
}

function internalHeaders(requestId?: string, extra: Record<string, string> = {}) {
  return {
    "x-internal-service-token": labConfig.internalServiceToken,
    ...(requestId ? { "x-request-id": requestId } : {}),
    ...extra,
  };
}

async function courseJson(
  path: string,
  init: RequestInit = {},
  timeoutMs = 2000,
): Promise<{ status: number; body: JsonObject }> {
  const response = await fetch(`${labConfig.courseServiceUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({})) as JsonObject;
  return { status: response.status, body };
}

export async function fetchCourseInfo(courseId: string, requestId?: string): Promise<CourseInfo | null> {
  const result = await courseJson(`/internal/courses/${courseId}`, {
    headers: internalHeaders(requestId),
  });
  if (result.status === 404) return null;
  if (result.status !== 200) throw new CourseClientError("course-info", result.status);
  return result.body.course as CourseInfo;
}

export async function fetchCourseAccess(
  courseId: string,
  userId: string,
  requestId?: string,
): Promise<CourseAccess | null> {
  const result = await courseJson(`/internal/courses/${courseId}/access/${userId}`, {
    headers: internalHeaders(requestId),
  });
  if (result.status === 404) return null;
  if (result.status !== 200) throw new CourseClientError("course-access", result.status);
  return result.body.access as CourseAccess;
}

export async function fetchCourseRoster(courseId: string, requestId?: string): Promise<CourseUser[]> {
  const users: CourseUser[] = [];
  const pageSize = 200;
  for (let page = 1; users.length < 500; page += 1) {
    const result = await courseJson(
      `/internal/courses/${courseId}/enrollments?page=${page}&pageSize=${pageSize}`,
      { headers: internalHeaders(requestId) },
    );
    if (result.status !== 200) throw new CourseClientError("course-roster", result.status);
    const body = result.body as RosterBody;
    const rows = body.items ?? body.students ?? [];
    users.push(...rows.slice(0, 500 - users.length));
    if (rows.length < pageSize || (typeof body.total === "number" && page * pageSize >= body.total)) break;
  }
  return users;
}

export async function fetchCourseUsers(userIds: string[], requestId?: string): Promise<{
  users: CourseUser[];
  missingUserIds: string[];
}> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return { users: [], missingUserIds: [] };
  const result = await courseJson("/internal/users:batch", {
    method: "POST",
    headers: internalHeaders(requestId, { "content-type": "application/json" }),
    body: JSON.stringify({ userIds: unique }),
  });
  if (result.status !== 200) throw new CourseClientError("course-users", result.status);
  return {
    users: (result.body.users ?? []) as CourseUser[],
    missingUserIds: (result.body.missingUserIds ?? []) as string[],
  };
}

export async function fetchCourseAdmins(requestId?: string): Promise<CourseUser[]> {
  const result = await courseJson("/internal/admins", { headers: internalHeaders(requestId) });
  if (result.status !== 200) throw new CourseClientError("course-admins", result.status);
  return (result.body.users ?? []) as CourseUser[];
}

export async function createCourseNotifications(input: {
  userIds: string[];
  type?: string;
  title: string;
  body?: string;
  linkPath?: string;
  labSetId?: string;
  idempotencyKey: string;
  requestId?: string;
}): Promise<{ created: number; deduped: number; idempotentReplay: boolean }> {
  const result = await courseJson("/internal/notifications", {
    method: "POST",
    headers: internalHeaders(input.requestId, {
      "content-type": "application/json",
      "idempotency-key": input.idempotencyKey,
    }),
    body: JSON.stringify({
      userIds: [...new Set(input.userIds)],
      type: input.type ?? "LAB",
      title: input.title,
      body: input.body,
      linkPath: input.linkPath,
      labSetId: input.labSetId,
    }),
  });
  if (result.status !== 200 && result.status !== 201) {
    throw new CourseClientError("course-notification", result.status);
  }
  return result.body as { created: number; deduped: number; idempotentReplay: boolean };
}

export async function fetchCourseUserIds(courseId: string): Promise<string[]> {
  return (await fetchCourseRoster(courseId)).map((student) => student.id);
}
