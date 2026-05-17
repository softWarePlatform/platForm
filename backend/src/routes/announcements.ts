import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { getCourseAccess } from "../lib/courseAccess.js";
import {
  appendEditHistory,
  isEdited,
  notifyStudentsOfAnnouncement,
} from "../lib/announcements.js";

const authorSelect = { id: true, name: true } as const;

function serializeAnnouncement(
  row: {
    id: string;
    courseId: string;
    title: string;
    content: string;
    pinned: boolean;
    createdAt: Date;
    updatedAt: Date;
    editHistoryJson: string | null;
    author: { id: string; name: string };
  },
  opts: { read: boolean; marked: boolean },
) {
  return {
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    content: row.content,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    edited: isEdited(row.createdAt, row.updatedAt, row.editHistoryJson),
    read: opts.read,
    marked: opts.marked,
    author: row.author,
  };
}

async function markAnnouncementRead(announcementId: string, userId: string) {
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId, userId } },
    create: { announcementId, userId },
    update: { readAt: new Date() },
  });
}

const announcementsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses/:courseId/announcements", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const query = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(50).default(15),
      })
      .safeParse(req.query);
    if (!query.success) return reply.code(400).send({ error: "参数无效" });

    const access = await getCourseAccess(req.auth!.sub, req.auth!.role, courseId);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.canView) return reply.code(403).send({ error: "未选课或无权查看" });

    const { page, pageSize } = query.data;
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prisma.courseAnnouncement.count({ where: { courseId } }),
      prisma.courseAnnouncement.findMany({
        where: { courseId },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        include: { author: { select: authorSelect } },
      }),
    ]);

    const ids = rows.map((r) => r.id);
    const [reads, marks] =
      ids.length > 0
        ? await Promise.all([
            prisma.announcementRead.findMany({
              where: { userId: req.auth!.sub, announcementId: { in: ids } },
              select: { announcementId: true },
            }),
            prisma.announcementMark.findMany({
              where: { userId: req.auth!.sub, announcementId: { in: ids } },
              select: { announcementId: true },
            }),
          ])
        : [[], []];
    const readSet = new Set(reads.map((r) => r.announcementId));
    const markSet = new Set(marks.map((m) => m.announcementId));
    const isTeacherView = access.isTeacher;

    return {
      announcements: rows.map((r) =>
        serializeAnnouncement(r, {
          read: isTeacherView || readSet.has(r.id),
          marked: markSet.has(r.id),
        }),
      ),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  });

  app.get(
    "/courses/:courseId/announcements/:announcementId",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId, announcementId } = req.params as {
        courseId: string;
        announcementId: string;
      };

      const access = await getCourseAccess(req.auth!.sub, req.auth!.role, courseId);
      if (!access.course) return reply.code(404).send({ error: "课程不存在" });
      if (!access.canView) return reply.code(403).send({ error: "未选课或无权查看" });

      const row = await prisma.courseAnnouncement.findFirst({
        where: { id: announcementId, courseId },
        include: { author: { select: authorSelect } },
      });
      if (!row) {
        return reply.code(404).send({ error: "公告已删除", deleted: true });
      }

      await markAnnouncementRead(announcementId, req.auth!.sub);

      const marked = await prisma.announcementMark.findUnique({
        where: {
          announcementId_userId: { announcementId, userId: req.auth!.sub },
        },
      });

      return {
        announcement: {
          ...serializeAnnouncement(row, { read: true, marked: !!marked }),
          editHistory: row.editHistoryJson
            ? (() => {
                try {
                  return JSON.parse(row.editHistoryJson);
                } catch {
                  return [];
                }
              })()
            : [],
        },
      };
    },
  );

  app.post("/courses/:courseId/announcements", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const access = await getCourseAccess(req.auth!.sub, req.auth!.role, courseId);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.isTeacher) return reply.code(403).send({ error: "仅教师可发布公告" });

    const body = z
      .object({
        title: z.string().min(1).max(100),
        content: z.string().min(1),
        pinned: z.boolean().optional().default(false),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "标题 1–100 字，内容不能为空" });

    const row = await prisma.courseAnnouncement.create({
      data: {
        courseId,
        authorId: req.auth!.sub,
        title: body.data.title.trim(),
        content: body.data.content,
        pinned: body.data.pinned,
      },
      include: { author: { select: authorSelect } },
    });

    await notifyStudentsOfAnnouncement(courseId, row.id, row.title);

    return {
      announcement: serializeAnnouncement(row, { read: true, marked: false }),
    };
  });

  app.post(
    "/courses/:courseId/announcements/read-all",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const access = await getCourseAccess(req.auth!.sub, req.auth!.role, courseId);
      if (!access.course) return reply.code(404).send({ error: "课程不存在" });
      if (!access.canView) return reply.code(403).send({ error: "未选课或无权查看" });
      if (access.isTeacher) return reply.code(403).send({ error: "仅学生可使用" });

      const announcements = await prisma.courseAnnouncement.findMany({
        where: { courseId },
        select: { id: true },
      });
      if (announcements.length === 0) return { ok: true, marked: 0 };

      const userId = req.auth!.sub;
      await prisma.$transaction(
        announcements.map((a) =>
          prisma.announcementRead.upsert({
            where: { announcementId_userId: { announcementId: a.id, userId } },
            create: { announcementId: a.id, userId },
            update: { readAt: new Date() },
          }),
        ),
      );

      return { ok: true, marked: announcements.length };
    },
  );

  app.post(
    "/announcements/:announcementId/read-status",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { announcementId } = req.params as { announcementId: string };
      const body = z.object({ read: z.boolean() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const existing = await prisma.courseAnnouncement.findUnique({
        where: { id: announcementId },
      });
      if (!existing) return reply.code(404).send({ error: "公告不存在" });

      const access = await getCourseAccess(req.auth!.sub, req.auth!.role, existing.courseId);
      if (!access.canView) return reply.code(403).send({ error: "未选课或无权查看" });
      if (access.isTeacher) return reply.code(403).send({ error: "仅学生可使用" });

      const userId = req.auth!.sub;
      if (body.data.read) {
        await markAnnouncementRead(announcementId, userId);
      } else {
        await prisma.announcementRead.deleteMany({
          where: { announcementId, userId },
        });
      }

      return { ok: true, read: body.data.read };
    },
  );

  app.post(
    "/announcements/:announcementId/mark",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { announcementId } = req.params as { announcementId: string };
      const body = z.object({ marked: z.boolean() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const existing = await prisma.courseAnnouncement.findUnique({
        where: { id: announcementId },
      });
      if (!existing) return reply.code(404).send({ error: "公告不存在" });

      const access = await getCourseAccess(req.auth!.sub, req.auth!.role, existing.courseId);
      if (!access.canView) return reply.code(403).send({ error: "未选课或无权查看" });
      if (access.isTeacher) return reply.code(403).send({ error: "仅学生可使用" });

      const userId = req.auth!.sub;
      if (body.data.marked) {
        await prisma.announcementMark.upsert({
          where: { announcementId_userId: { announcementId, userId } },
          create: { announcementId, userId },
          update: {},
        });
      } else {
        await prisma.announcementMark.deleteMany({
          where: { announcementId, userId },
        });
      }

      return { ok: true, marked: body.data.marked };
    },
  );

  app.patch("/announcements/:announcementId", { preHandler: authRequired() }, async (req, reply) => {
    const { announcementId } = req.params as { announcementId: string };
    const existing = await prisma.courseAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!existing) return reply.code(404).send({ error: "公告不存在" });

    const access = await getCourseAccess(req.auth!.sub, req.auth!.role, existing.courseId);
    if (!access.isTeacher && existing.authorId !== req.auth!.sub) {
      return reply.code(403).send({ error: "无权编辑该公告" });
    }
    if (existing.authorId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
      return reply.code(403).send({ error: "仅发布者可编辑" });
    }

    const body = z
      .object({
        title: z.string().min(1).max(100).optional(),
        content: z.string().min(1).optional(),
        pinned: z.boolean().optional(),
        notifyAgain: z.boolean().optional().default(false),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const patch: { title?: string; content?: string; pinned?: boolean; editHistoryJson?: string } = {};
    const historyPatch: { title?: string; content?: string; pinned?: boolean } = {};

    if (body.data.title !== undefined) {
      patch.title = body.data.title.trim();
      historyPatch.title = patch.title;
    }
    if (body.data.content !== undefined) {
      patch.content = body.data.content;
      historyPatch.content = "(已更新)";
    }
    if (body.data.pinned !== undefined) {
      patch.pinned = body.data.pinned;
      historyPatch.pinned = body.data.pinned;
    }

    if (Object.keys(historyPatch).length > 0) {
      patch.editHistoryJson = appendEditHistory(existing.editHistoryJson, historyPatch);
    }

    const row = await prisma.courseAnnouncement.update({
      where: { id: announcementId },
      data: patch,
      include: { author: { select: authorSelect } },
    });

    if (body.data.notifyAgain) {
      await notifyStudentsOfAnnouncement(existing.courseId, row.id, row.title);
    }

    const marked = await prisma.announcementMark.findUnique({
      where: {
        announcementId_userId: { announcementId, userId: req.auth!.sub },
      },
    });

    return {
      announcement: serializeAnnouncement(row, { read: true, marked: !!marked }),
    };
  });

  app.delete("/announcements/:announcementId", { preHandler: authRequired() }, async (req, reply) => {
    const { announcementId } = req.params as { announcementId: string };
    const existing = await prisma.courseAnnouncement.findUnique({
      where: { id: announcementId },
    });
    if (!existing) return reply.code(404).send({ error: "公告不存在" });

    const access = await getCourseAccess(req.auth!.sub, req.auth!.role, existing.courseId);
    if (existing.authorId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
      return reply.code(403).send({ error: "仅发布者可删除" });
    }
    if (!access.isTeacher && req.auth!.role !== "ADMIN") {
      return reply.code(403).send({ error: "无权删除" });
    }

    await prisma.courseAnnouncement.delete({ where: { id: announcementId } });
    return { ok: true };
  });

  app.post(
    "/announcements/:announcementId/pin",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { announcementId } = req.params as { announcementId: string };
      const body = z.object({ pinned: z.boolean() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const existing = await prisma.courseAnnouncement.findUnique({
        where: { id: announcementId },
      });
      if (!existing) return reply.code(404).send({ error: "公告不存在" });

      const access = await getCourseAccess(req.auth!.sub, req.auth!.role, existing.courseId);
      if (!access.isTeacher) return reply.code(403).send({ error: "仅教师可置顶" });
      if (existing.authorId !== req.auth!.sub && req.auth!.role !== "ADMIN") {
        return reply.code(403).send({ error: "仅发布者可置顶" });
      }

      const row = await prisma.courseAnnouncement.update({
        where: { id: announcementId },
        data: {
          pinned: body.data.pinned,
          editHistoryJson: appendEditHistory(existing.editHistoryJson, {
            pinned: body.data.pinned,
          }),
        },
        include: { author: { select: authorSelect } },
      });

      const marked = await prisma.announcementMark.findUnique({
        where: {
          announcementId_userId: { announcementId, userId: req.auth!.sub },
        },
      });

      return { announcement: serializeAnnouncement(row, { read: true, marked: !!marked }) };
    },
  );
};

export default announcementsRoutes;
