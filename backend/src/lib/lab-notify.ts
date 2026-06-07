import { prisma } from "./prisma.js";

export async function notifyLabSetPublished(opts: {
  courseId: string;
  labSetId: string;
  labSetTitle: string;
  courseTitle: string;
}) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: opts.courseId },
    select: { userId: true },
  });
  if (enrollments.length === 0) return;

  await prisma.siteNotification.createMany({
    data: enrollments.map((e) => ({
      userId: e.userId,
      type: "LAB_PUBLISHED",
      title: `新实验发布：${opts.labSetTitle}`,
      body: `课程「${opts.courseTitle}」发布了实验集「${opts.labSetTitle}」，请及时查看并完成。`,
      linkPath: `/courses/${opts.courseId}/labs/sets/${opts.labSetId}`,
      labSetId: opts.labSetId,
    })),
  });
}

export async function notifyLabSubmissionGraded(opts: {
  userId: string;
  labTitle: string;
  courseId: string;
  labId: string;
  score: number;
  labSetId?: string | null;
}) {
  await prisma.siteNotification.create({
    data: {
      userId: opts.userId,
      type: "LAB_GRADED",
      title: `实验已批改：${opts.labTitle}`,
      body: `你的提交已批改，得分 ${opts.score} 分。`,
      linkPath: `/courses/${opts.courseId}/labs/${opts.labId}`,
      labSetId: opts.labSetId ?? undefined,
    },
  });
}

export async function notifyLabSubmissionReturned(opts: {
  userId: string;
  labTitle: string;
  courseId: string;
  labId: string;
  reason: string;
  labSetId?: string | null;
}) {
  await prisma.siteNotification.create({
    data: {
      userId: opts.userId,
      type: "LAB_RETURNED",
      title: `实验已打回：${opts.labTitle}`,
      body: opts.reason.slice(0, 500),
      linkPath: `/courses/${opts.courseId}/labs/${opts.labId}`,
      labSetId: opts.labSetId ?? undefined,
    },
  });
}
