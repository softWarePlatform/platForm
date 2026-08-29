import type { FastifyPluginAsync } from "fastify";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { emitNotificationToUser } from "../lib/notification-events.js";

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get("/admin/homework-completion", { preHandler: authRequired("ADMIN") }, async (req, reply) => {
    const { courseId } = req.query as { courseId?: string };
    if (!courseId) return reply.code(400).send({ error: "courseId 必填" });

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        enrollments: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            class: { select: { id: true, name: true } },
          },
          orderBy: { user: { name: "asc" } },
        },
        homeworks: {
          orderBy: [{ dueAt: "asc" }, { publishedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            dueAt: true,
            published: true,
            targetClassId: true,
            targetClass: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const homeworkIds = course.homeworks.map((h) => h.id);
    const studentIds = course.enrollments.map((e) => e.userId);

    const [submissions, redoRequests, versions] = await Promise.all([
      prisma.homeworkSubmission.findMany({
        where: { homeworkId: { in: homeworkIds }, userId: { in: studentIds } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          homework: { select: { id: true, title: true } },
        },
      }),
      prisma.homeworkRedoRequest.findMany({
        where: { homeworkId: { in: homeworkIds }, userId: { in: studentIds } },
        include: {
          user: { select: { id: true, name: true, email: true } },
          homework: { select: { id: true, title: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.homeworkSubmissionVersion.findMany({
        where: { submission: { homeworkId: { in: homeworkIds }, userId: { in: studentIds } } },
        include: {
          submission: {
            include: {
              user: { select: { id: true, name: true, email: true } },
              homework: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { submittedAt: "desc" },
        take: 200,
      }),
    ]);

    const submissionMap = new Map(submissions.map((s) => [`${s.homeworkId}:${s.userId}`, s]));
    const pendingRedo = new Set(
      redoRequests.filter((r) => r.status === "PENDING").map((r) => `${r.homeworkId}:${r.userId}`),
    );

    const students = course.enrollments.map((enrollment) => {
      const cells = course.homeworks.map((homework) => {
        const applicable = !homework.targetClassId || homework.targetClassId === enrollment.classId;
        if (!applicable) {
          return {
            homeworkId: homework.id,
            status: "NOT_APPLICABLE",
            statusLabel: "不适用",
            submittedAt: null,
            score: null,
            released: false,
            redoPending: false,
          };
        }
        const sub = submissionMap.get(`${homework.id}:${enrollment.userId}`);
        const redoPending = pendingRedo.has(`${homework.id}:${enrollment.userId}`);
        const status = redoPending
          ? "REDO_PENDING"
          : sub?.released
            ? "RELEASED"
            : sub?.graded
              ? "GRADED"
              : sub?.submittedAt
                ? "SUBMITTED"
                : sub?.draftContent
                  ? "DRAFT"
                  : "NOT_STARTED";
        const statusLabel: Record<string, string> = {
          REDO_PENDING: "重做待审批",
          RELEASED: "已发布成绩",
          GRADED: "已批改",
          SUBMITTED: "已提交",
          DRAFT: "草稿",
          NOT_STARTED: "未开始",
        };
        return {
          homeworkId: homework.id,
          status,
          statusLabel: statusLabel[status],
          submittedAt: sub?.submittedAt?.toISOString() ?? null,
          score: sub?.score ?? null,
          released: Boolean(sub?.released),
          redoPending,
        };
      });
      const applicable = cells.filter((c) => c.status !== "NOT_APPLICABLE");
      const submitted = applicable.filter((c) =>
        ["SUBMITTED", "GRADED", "RELEASED", "REDO_PENDING"].includes(c.status),
      ).length;
      const released = applicable.filter((c) => c.status === "RELEASED").length;
      return {
        user: enrollment.user,
        className: enrollment.class?.name ?? null,
        submitted,
        released,
        total: applicable.length,
        completionRate: applicable.length ? submitted / applicable.length : null,
        cells,
      };
    });

    const logs = [
      ...versions.map((v) => ({
        id: `version-${v.id}`,
        time: v.submittedAt.toISOString(),
        type: "HOMEWORK_SUBMIT",
        title: "学生提交作业",
        studentName: v.submission.user.name,
        studentEmail: v.submission.user.email,
        homeworkTitle: v.submission.homework.title,
        detail: `第 ${v.version} 次提交${v.isLate ? `，迟交 ${v.lateDays ?? 0} 天` : ""}`,
      })),
      ...submissions
        .filter((s) => s.graded)
        .map((s) => ({
          id: `graded-${s.id}`,
          time: s.updatedAt.toISOString(),
          type: s.released ? "HOMEWORK_RELEASED" : "HOMEWORK_GRADED",
          title: s.released ? "成绩已发布" : "作业已批改",
          studentName: s.user.name,
          studentEmail: s.user.email,
          homeworkTitle: s.homework.title,
          detail: s.score == null ? "已批改" : `分数 ${Number(s.score).toFixed(1)}`,
        })),
      ...redoRequests.map((r) => ({
        id: `redo-${r.id}`,
        time: r.createdAt.toISOString(),
        type: "HOMEWORK_REDO_REQUEST",
        title: "学生申请重做",
        studentName: r.user.name,
        studentEmail: r.user.email,
        homeworkTitle: r.homework.title,
        detail: `${r.status}${r.reason ? `：${r.reason}` : ""}${r.reviewedBy ? `；审批人：${r.reviewedBy.name}` : ""}`,
      })),
    ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 300);

    return {
      course: {
        id: course.id,
        title: course.title,
        teacher: course.teacher,
      },
      homeworks: course.homeworks.map((h) => ({
        id: h.id,
        title: h.title,
        dueAt: h.dueAt?.toISOString() ?? null,
        published: h.published,
        targetClassName: h.targetClass?.name ?? null,
      })),
      students,
      logs,
      summary: {
        studentCount: students.length,
        homeworkCount: course.homeworks.length,
        submittedCount: students.reduce((sum, s) => sum + s.submitted, 0),
        totalRequiredCount: students.reduce((sum, s) => sum + s.total, 0),
      },
    };
  });

  app.get("/admin/audit", { preHandler: authRequired("ADMIN") }, async () => {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true, name: true, email: true, role: true },
    });

    const notifications = await prisma.siteNotification.findMany({
      where: { type: "ADMIN_ACTION" },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    const logs = notifications.map((item) => ({
      id: item.id,
      time: item.createdAt.toISOString(),
      type: item.title === "删除用户" ? "ADMIN_DELETE_USER" : item.type,
      title: item.title,
      detail: [item.body, item.user ? `接收人：${item.user.name}` : null, item.readAt ? `已读于 ${item.readAt.toISOString()}` : "未读"]
        .filter(Boolean)
        .join(" · "),
    }));

    return { user: admins[0] ?? null, logs };
  });

  app.get("/admin/users/:userId/logs", { preHandler: authRequired("ADMIN") }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) return reply.code(404).send({ error: "用户不存在" });

    const [enrollmentLogs, announcements, notifications] = await Promise.all([
      prisma.enrollmentLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          course: { select: { id: true, title: true } },
          operator: { select: { id: true, name: true } },
        },
      }),
      prisma.courseAnnouncement.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { course: { select: { id: true, title: true } } },
      }),
      prisma.siteNotification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      user,
      logs: {
        enrollment: enrollmentLogs.map((log) => ({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          action: log.action,
          courseId: log.courseId,
          courseTitle: log.course.title,
          operatorName: log.operator?.name ?? null,
          note: log.note,
        })),
        announcements: announcements.map((item) => ({
          id: item.id,
          createdAt: item.createdAt.toISOString(),
          title: item.title,
          courseId: item.courseId,
          courseTitle: item.course.title,
        })),
        notifications: notifications.map((item) => ({
          id: item.id,
          createdAt: item.createdAt.toISOString(),
          title: item.title,
          body: item.body,
          type: item.type,
          readAt: item.readAt?.toISOString() ?? null,
        })),
      },
    };
  });

  app.delete("/admin/users/:userId", { preHandler: authRequired("ADMIN") }, async (req, reply) => {
    const { userId } = req.params as { userId: string };
    const currentUserId = req.auth!.sub;
    if (userId === currentUserId) return reply.code(400).send({ error: "不能删除当前登录的管理员账号" });

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, name: true, email: true } });
    if (!target) return reply.code(404).send({ error: "用户不存在" });
    if (target.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
      if (adminCount <= 1) return reply.code(400).send({ error: "至少保留一名管理员" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id: userId } });
      await tx.siteNotification.create({
        data: {
          userId: currentUserId,
          type: "ADMIN_ACTION",
          title: "删除用户",
          body: `删除了用户「${target.name}」(${target.email})`,
          linkPath: "/admin/logs",
        },
      });
    });
    emitNotificationToUser(currentUserId);
    return { ok: true };
  });
};

export default adminRoutes;
