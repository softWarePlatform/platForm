import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

export async function courseAccess(userId: string, role: Role, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { course: null, canView: false, isTeacher: false, enrollment: null };
  const isTeacher = role === "ADMIN" || course.teacherId === userId;
  const enrollment = isTeacher
    ? null
    : await prisma.enrollment.findUnique({ where: { userId_courseId: { userId, courseId } } });
  return { course, isTeacher, canView: isTeacher || Boolean(enrollment), enrollment };
}

export function semesterKey(now = new Date()) {
  return `${now.getFullYear()}-${now.getMonth() >= 7 ? "fall" : "spring"}`;
}
