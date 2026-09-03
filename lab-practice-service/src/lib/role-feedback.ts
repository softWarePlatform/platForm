import { createCourseNotifications, fetchCourseAdmins, fetchCourseInfo } from "../course-client.js";

export async function notifyCourseStaffAndAdmins(opts: {
  courseId: string;
  actorUserId?: string;
  type: string;
  title: string;
  body?: string | null;
  linkPath?: string | null;
  homeworkId?: string | null;
  labSetId?: string | null;
  requestId?: string;
}) {
  const [course, admins] = await Promise.all([
    fetchCourseInfo(opts.courseId, opts.requestId),
    fetchCourseAdmins(opts.requestId),
  ]);
  const userIds = new Set<string>();
  if (course?.teacherId) userIds.add(course.teacherId);
  for (const admin of admins) userIds.add(admin.id);
  if (opts.actorUserId) userIds.delete(opts.actorUserId);
  if (userIds.size === 0) return;

  await createCourseNotifications({
    userIds: [...userIds],
    type: opts.type,
    title: opts.title,
    body: opts.body ?? undefined,
    linkPath: opts.linkPath ?? undefined,
    labSetId: opts.labSetId ?? undefined,
    idempotencyKey: `lab-role-feedback:${opts.type}:${opts.courseId}:${opts.linkPath ?? ""}:${opts.title}`,
    requestId: opts.requestId,
  });
}

