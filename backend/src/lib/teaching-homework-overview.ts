import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

/**
 * 作业测评列表：教师名下课程中的作业（按课程上的 teacherId 关联，避免两步查询 courseIds 不一致）。
 * ADMIN：查看全库作业。
 */
export async function teachingHomeworkOverviewForTeacher(teacherId: string, role?: Role) {
  const homeworkRows = await prisma.homework.findMany({
    where:
      role === "ADMIN"
        ? {}
        : {
            course: { teacherId },
          },
    include: {
      course: { select: { id: true, title: true } },
      targetClass: { select: { id: true, name: true } },
    },
    orderBy: [{ dueAt: "asc" }, { title: "asc" }],
  });

  if (homeworkRows.length === 0) return { homework: [] };

  const ids = homeworkRows.map((h) => h.id);

  const [submitAgg, gradedAgg, releasedAgg] = await Promise.all([
    prisma.homeworkSubmission.groupBy({
      by: ["homeworkId"],
      where: { homeworkId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.homeworkSubmission.groupBy({
      by: ["homeworkId"],
      where: { homeworkId: { in: ids }, graded: true },
      _count: { _all: true },
    }),
    prisma.homeworkSubmission.groupBy({
      by: ["homeworkId"],
      where: { homeworkId: { in: ids }, released: true },
      _count: { _all: true },
    }),
  ]);
  const toMap = (rows: { homeworkId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.homeworkId, r._count._all]));
  const sm = toMap(submitAgg);
  const gm = toMap(gradedAgg);
  const rm = toMap(releasedAgg);

  return {
    homework: homeworkRows.map((h) => ({
      id: h.id,
      title: h.title,
      courseId: h.course.id,
      courseTitle: h.course.title,
      dueAt: h.dueAt,
      published: h.published,
      targetClassName: h.targetClass?.name ?? null,
      submissionCount: sm.get(h.id) ?? 0,
      gradedCount: gm.get(h.id) ?? 0,
      releasedCount: rm.get(h.id) ?? 0,
    })),
  };
}
