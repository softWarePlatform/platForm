import { fetchCourseAccess, fetchCourseInfo } from "../course-client.js";

export async function getCourseAccess(userId: string, role: string, courseId: string, requestId?: string) {
  const course = await fetchCourseInfo(courseId, requestId);
  if (!course) return { course: null, canView: false, isTeacher: false };
  const isTeacher = role === "ADMIN" || course.teacherId === userId;
  if (isTeacher) return { course, canView: true, isTeacher: true };
  const access = await fetchCourseAccess(courseId, userId, requestId);
  return { course, canView: Boolean(access?.canView && course.published), isTeacher: false };
}
