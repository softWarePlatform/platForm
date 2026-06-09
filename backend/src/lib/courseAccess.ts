import { prisma } from "./prisma.js";

export async function getCourseAccess(userId: string, role: string, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true, published: true },
  });
  if (!course) return { course: null, canView: false, isTeacher: false };

  const isTeacher = role === "ADMIN" || course.teacherId === userId;
  if (isTeacher) return { course, canView: true, isTeacher: true };

  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  const canView = Boolean(enrollment) && course.published;
  return { course, canView, isTeacher: false };
}
