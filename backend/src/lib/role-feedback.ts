import { prisma } from "./prisma.js";
import { emitNotificationToUsers } from "./notification-events.js";

export async function notifyCourseStaffAndAdmins(opts: {
  courseId: string;
  actorUserId?: string;
  type: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  homeworkId?: string | null;
  labSetId?: string | null;
}) {
  const [course, admins] = await Promise.all([
    prisma.course.findUnique({ where: { id: opts.courseId }, select: { teacherId: true } }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
  ]);
  const userIds = new Set<string>();
  if (course?.teacherId) userIds.add(course.teacherId);
  for (const admin of admins) userIds.add(admin.id);
  if (opts.actorUserId) userIds.delete(opts.actorUserId);
  if (userIds.size === 0) return;

  await prisma.siteNotification.createMany({
    data: [...userIds].map((userId) => ({
      userId,
      type: opts.type,
      title: opts.title,
      body: opts.body ?? null,
      linkPath: opts.linkPath ?? null,
      homeworkId: opts.homeworkId ?? null,
      labSetId: opts.labSetId ?? null,
    })),
  });
  emitNotificationToUsers(userIds);
}
