import { labConfig } from "./config.js";

type RosterBody = {
  items?: Array<{ id: string }>;
  students?: Array<{ id: string }>;
};

export async function fetchCourseUserIds(courseId: string): Promise<string[]> {
  const response = await fetch(
    `${labConfig.courseServiceUrl}/internal/courses/${courseId}/enrollments?page=1&pageSize=500`,
    {
      headers: { "x-internal-service-token": labConfig.internalServiceToken },
      signal: AbortSignal.timeout(2000),
    },
  );
  if (!response.ok) throw new Error(`course-roster-${response.status}`);
  const body = (await response.json()) as RosterBody;
  return [...new Set((body.items ?? body.students ?? []).map((student) => student.id))];
}
