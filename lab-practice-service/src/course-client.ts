import { labConfig } from "./config.js";

type RosterBody = {
  items?: Array<{ id: string }>;
  students?: Array<{ id: string }>;
  total?: number;
};

export async function fetchCourseUserIds(courseId: string): Promise<string[]> {
  const userIds = new Set<string>();
  const pageSize = 200;

  for (let page = 1; userIds.size < 500; page += 1) {
    const response = await fetch(
      `${labConfig.courseServiceUrl}/internal/courses/${courseId}/enrollments?page=${page}&pageSize=${pageSize}`,
      {
        headers: { "x-internal-service-token": labConfig.internalServiceToken },
        signal: AbortSignal.timeout(2000),
      },
    );
    if (!response.ok) throw new Error(`course-roster-${response.status}`);

    const body = (await response.json()) as RosterBody;
    const rows = body.items ?? body.students ?? [];
    for (const student of rows) {
      if (student.id) userIds.add(student.id);
      if (userIds.size === 500) break;
    }

    const total = typeof body.total === "number" ? body.total : undefined;
    if (rows.length < pageSize || (total != null && page * pageSize >= total)) break;
  }

  return [...userIds];
}
