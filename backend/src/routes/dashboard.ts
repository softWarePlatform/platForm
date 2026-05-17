import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { parseScheduleSlotsJson, type ScheduleSlot } from "../lib/scheduleSlots.js";

function currentSemesterLabel() {
  const now = new Date();
  const y = now.getFullYear();
  const spring = now.getMonth() >= 1 && now.getMonth() <= 7;
  return {
    key: `${y}-${spring ? "spring" : "fall"}`,
    label: `${y}-${y + 1} ${spring ? "春季" : "秋季"}学期`,
  };
}

const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/me", { preHandler: authRequired() }, async (req) => {
    const uid = req.auth!.sub;
    const role = req.auth!.role;
    const now = new Date();

    type CourseRow = {
      id: string;
      title: string;
      category: string | null;
      teacherName: string;
      startAt: string | null;
      endAt: string | null;
      progressPercent: number;
      pendingHomework: number;
      pendingLabs: number;
      announcementCount: number;
      isHistory: boolean;
      scheduleSlots: ScheduleSlot[];
    };

    const deadlines: Array<{
      id: string;
      courseId: string;
      courseTitle: string;
      title: string;
      type: "homework" | "labSet";
      dueAt: string;
    }> = [];

    const buildCourseRow = async (
      course: {
        id: string;
        title: string;
        category: string | null;
        startAt: Date | null;
        endAt: Date | null;
        scheduleSlotsJson: string | null;
        teacher: { name: string };
        homeworks: Array<{ id: string; title: string; dueAt: Date | null; published: boolean }>;
        labSets: Array<{ id: string; title: string; dueAt: Date | null; labs: Array<{ id: string }> }>;
      },
      opts: { forStudent: boolean },
    ): Promise<CourseRow> => {
      const isHistory = !!(course.endAt && course.endAt < now);

      let progressPercent = 0;
      let pendingHomework = 0;
      let pendingLabs = 0;

      const publishedHw = course.homeworks.filter((h) => h.published);
      const labIds = course.labSets.flatMap((s) => s.labs.map((l) => l.id));

      if (opts.forStudent) {
        const [hwSubs, labSubs] = await Promise.all([
          prisma.homeworkSubmission.findMany({
            where: { userId: uid, homeworkId: { in: publishedHw.map((h) => h.id) } },
            select: { homeworkId: true, content: true, graded: true },
          }),
          prisma.submission.findMany({
            where: { userId: uid, labId: { in: labIds } },
            select: { labId: true, status: true },
          }),
        ]);
        const hwDone = new Set(
          hwSubs.filter((s) => s.content.trim().length > 0).map((s) => s.homeworkId),
        );
        pendingHomework = publishedHw.filter((h) => !hwDone.has(h.id)).length;

        const acLabs = new Set(
          labSubs.filter((s) => s.status === "ACCEPTED").map((s) => s.labId),
        );
        pendingLabs = labIds.filter((id) => !acLabs.has(id)).length;

        const hwPart = publishedHw.length ? (hwDone.size / publishedHw.length) * 50 : 50;
        const labPart = labIds.length ? (acLabs.size / labIds.length) * 50 : 50;
        progressPercent = Math.round(hwPart + labPart);
      }

      for (const h of publishedHw) {
        if (h.dueAt && h.dueAt >= now) {
          deadlines.push({
            id: h.id,
            courseId: course.id,
            courseTitle: course.title,
            title: h.title,
            type: "homework",
            dueAt: h.dueAt.toISOString(),
          });
        }
      }
      for (const s of course.labSets) {
        if (s.dueAt && s.dueAt >= now) {
          deadlines.push({
            id: s.id,
            courseId: course.id,
            courseTitle: course.title,
            title: s.title,
            type: "labSet",
            dueAt: s.dueAt.toISOString(),
          });
        }
      }

      let announcementCount = 0;
      if (opts.forStudent) {
        const ann = await prisma.courseAnnouncement.findMany({
          where: { courseId: course.id },
          select: { id: true },
        });
        if (ann.length > 0) {
          const readCount = await prisma.announcementRead.count({
            where: {
              userId: uid,
              announcementId: { in: ann.map((a) => a.id) },
            },
          });
          announcementCount = ann.length - readCount;
        }
      }

      return {
        id: course.id,
        title: course.title,
        category: course.category,
        teacherName: course.teacher.name,
        startAt: course.startAt?.toISOString() ?? null,
        endAt: course.endAt?.toISOString() ?? null,
        progressPercent,
        pendingHomework,
        pendingLabs,
        announcementCount,
        isHistory,
        scheduleSlots: parseScheduleSlotsJson(course.scheduleSlotsJson, course.id),
      };
    };

    const courseInclude = {
      teacher: { select: { name: true } },
      homeworks: { select: { id: true, title: true, dueAt: true, published: true } },
      labSets: {
        select: {
          id: true,
          title: true,
          dueAt: true,
          labs: { select: { id: true } },
        },
      },
    } as const;

    let courses: CourseRow[] = [];

    if (role === "TEACHER" || role === "ADMIN") {
      const teaching = await prisma.course.findMany({
        where: role === "ADMIN" ? {} : { teacherId: uid },
        orderBy: { createdAt: "desc" },
        include: courseInclude,
      });
      courses = await Promise.all(
        teaching.map((c) => buildCourseRow(c, { forStudent: false })),
      );
    } else {
      const enrollments = await prisma.enrollment.findMany({
        where: { userId: uid },
        include: { course: { include: courseInclude } },
        orderBy: { course: { createdAt: "desc" } },
      });
      courses = await Promise.all(
        enrollments.map((e) => buildCourseRow(e.course, { forStudent: true })),
      );
    }

    deadlines.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    return {
      role,
      semester: currentSemesterLabel(),
      courses,
      deadlines: deadlines.slice(0, 30),
    };
  });
};

export default dashboardRoutes;
