import { prisma } from "./prisma.js";
import { emitNotificationToUsers } from "./notification-events.js";

type EditEntry = {
  at: string;
  title?: string;
  content?: string;
  pinned?: boolean;
};

export function parseEditHistory(json: string | null): EditEntry[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as EditEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function appendEditHistory(
  existing: string | null,
  patch: Omit<EditEntry, "at">,
): string {
  const history = parseEditHistory(existing);
  history.push({ at: new Date().toISOString(), ...patch });
  return JSON.stringify(history);
}

export function isEdited(createdAt: Date, updatedAt: Date, editHistoryJson: string | null) {
  if (parseEditHistory(editHistoryJson).length > 0) return true;
  return updatedAt.getTime() - createdAt.getTime() > 2000;
}

export function isNewAnnouncement(createdAt: Date) {
  return Date.now() - createdAt.getTime() < 24 * 60 * 60 * 1000;
}

export async function notifyStudentsOfAnnouncement(
  courseId: string,
  announcementId: string,
  title: string,
) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    select: { userId: true },
  });
  if (enrollments.length === 0) return;

  const notifTitle = `【课程公告】${title}`;
  const linkPath = `/courses/${courseId}/announcements/${announcementId}`;

  await prisma.siteNotification.createMany({
    data: enrollments.map((e) => ({
      userId: e.userId,
      type: "ANNOUNCEMENT",
      title: notifTitle,
      body: title,
      linkPath,
      announcementId,
    })),
  });
  emitNotificationToUsers(enrollments.map((e) => e.userId));
}

export async function countUnreadAnnouncementsForUser(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    select: { courseId: true },
  });
  const courseIds = enrollments.map((e) => e.courseId);
  if (courseIds.length === 0) return 0;

  const announcements = await prisma.courseAnnouncement.findMany({
    where: { courseId: { in: courseIds } },
    select: { id: true },
  });
  const ids = announcements.map((a) => a.id);
  if (ids.length === 0) return 0;

  const read = await prisma.announcementRead.findMany({
    where: { userId, announcementId: { in: ids } },
    select: { announcementId: true },
  });
  const readSet = new Set(read.map((r) => r.announcementId));
  return ids.filter((id) => !readSet.has(id)).length;
}
