import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { emitNotificationToUsers } from "../lib/notification-events.js";
import { readStoredFileAbs, saveDiscussionAttachment } from "../lib/uploads.js";

/** 列表查询结果（与 schema 字段一致，避免 Prisma Client 未刷新时 include 推断报错） */
type DiscussionPostListItem = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  resolved: boolean;
  anonymous: boolean;
  viewCount: number;
  createdAt: Date;
  userId: string;
  user: { id: string; name: string };
  _count: { comments: number };
};

type DiscussionCommentItem = {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  body: string;
  anonymous: boolean;
  createdAt: Date;
  user: { id: string; name: string };
  attachments: Array<{
    id: string;
    fileName: string;
    storedPath: string;
    mimeType: string | null;
    sizeBytes: number;
  }>;
};

type DiscussionPostDetail = DiscussionPostListItem & {
  updatedAt: Date;
  attachments: DiscussionCommentItem["attachments"];
  comments: DiscussionCommentItem[];
};

async function canDiscussLab(userId: string, role: string, labId: string) {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    include: { course: true },
  });
  if (!lab) return { ok: false as const, lab: null, course: null };
  if (role === "ADMIN" || lab.course.teacherId === userId) {
    return { ok: true as const, lab, course: lab.course, isTeacher: true };
  }
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lab.courseId } },
  });
  if (!en) return { ok: false as const, lab, course: lab.course, isTeacher: false };
  return { ok: true as const, lab, course: lab.course, isTeacher: false };
}

async function canDiscussLabSet(
  userId: string,
  role: string,
  courseId: string,
  labSetId: string,
) {
  const labSet = await prisma.labSet.findFirst({
    where: { id: labSetId, courseId },
    include: { course: true },
  });
  if (!labSet) return { ok: false as const, labSet: null, course: null, isTeacher: false };
  if (role === "ADMIN" || labSet.course.teacherId === userId) {
    return { ok: true as const, labSet, course: labSet.course, isTeacher: true };
  }
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!en) return { ok: false as const, labSet, course: labSet.course, isTeacher: false };
  return { ok: true as const, labSet, course: labSet.course, isTeacher: false };
}

function mapDiscussionPosts(
  posts: DiscussionPostListItem[],
  teacherId: string,
  viewerId: string,
) {
  return posts.map((p) => {
    const isTeacherAuthor = p.user.id === teacherId;
    return {
      id: p.id,
      title: p.title,
      body: p.body.slice(0, 200),
      pinned: p.pinned,
      resolved: p.resolved,
      viewCount: p.viewCount,
      commentCount: p._count.comments,
      createdAt: p.createdAt,
      author: displayAuthor(p, viewerId, isTeacherAuthor),
    };
  });
}

function sortDiscussionPosts(mapped: ReturnType<typeof mapDiscussionPosts>, sortKey: string) {
  mapped.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sortKey === "new") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    const hotA = a.viewCount + a.commentCount * 3;
    const hotB = b.viewCount + b.commentCount * 3;
    return hotB - hotA;
  });
  return mapped;
}

function displayAuthor(
  post: { anonymous: boolean; user: { id: string; name: string } },
  viewerId: string,
  isTeacherAuthor: boolean,
) {
  if (post.anonymous && post.user.id !== viewerId) {
    return { id: null, name: "匿名同学", isTeacher: false, isAnonymous: true };
  }
  return {
    id: post.user.id,
    name: post.user.name,
    isTeacher: isTeacherAuthor,
    isAnonymous: post.anonymous,
  };
}

async function notifyMentions(opts: {
  mentionUserIds: string[];
  fromUserId: string;
  title: string;
  linkPath: string;
}) {
  const unique = [...new Set(opts.mentionUserIds.filter((id) => id && id !== opts.fromUserId))];
  if (unique.length === 0) return;
  await prisma.siteNotification.createMany({
    data: unique.map((userId) => ({
      userId,
      type: "DISCUSSION",
      title: opts.title,
      body: "有人在讨论区 @ 了你",
      linkPath: opts.linkPath,
    })),
  });
  emitNotificationToUsers(unique);
}

const postInclude = {
  user: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
} as const;

const discussionsRoutes: FastifyPluginAsync = async (app) => {
  /** 本题讨论列表（搜索、热门、置顶） */
  app.get("/labs/:labId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { labId } = req.params as { labId: string };
    const q = req.query as { q?: string; sort?: string };
    const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
    if (!gate.lab) return reply.code(404).send({ error: "实验不存在" });
    if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

    const where: {
      labId: string;
      OR?: Array<{ title?: object; body?: object; user?: object }>;
    } = { labId };

    if (q.q?.trim()) {
      const term = q.q.trim();
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { body: { contains: term, mode: "insensitive" } },
        { user: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    const posts = (await prisma.discussionPost.findMany({
      where,
      include: postInclude as Prisma.DiscussionPostInclude,
    })) as unknown as DiscussionPostListItem[];

    const teacherId = gate.course!.teacherId;
    const mapped = mapDiscussionPosts(posts, teacherId, req.auth!.sub);

    const sortKey = q.sort ?? "hot";
    sortDiscussionPosts(mapped, sortKey);

    const hot = [...mapped]
      .filter((p) => !p.pinned)
      .sort((a, b) => b.viewCount + b.commentCount * 3 - (a.viewCount + a.commentCount * 3))
      .slice(0, 5);

    return { posts: mapped, hot };
  });

  app.get("/labs/:labId/discussions/:postId", { preHandler: authRequired() }, async (req, reply) => {
    const { labId, postId } = req.params as { labId: string; postId: string };
    const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
    if (!gate.lab) return reply.code(404).send({ error: "实验不存在" });
    if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

    const post = (await prisma.discussionPost.findFirst({
      where: { id: postId, labId },
      include: {
        user: { select: { id: true, name: true } },
        attachments: true,
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            user: { select: { id: true, name: true } },
            attachments: true,
          },
        },
      } as Prisma.DiscussionPostInclude,
    })) as DiscussionPostDetail | null;
    if (!post) return reply.code(404).send({ error: "帖子不存在" });

    await prisma.discussionPost.update({
      where: { id: postId },
      data: { viewCount: { increment: 1 } } as Prisma.DiscussionPostUpdateInput,
    });

    const teacherId = gate.course!.teacherId;
    const isTeacherAuthor = post.user.id === teacherId;

    return {
      post: {
        id: post.id,
        title: post.title,
        body: post.body,
        pinned: post.pinned,
        resolved: post.resolved,
        viewCount: post.viewCount + 1,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: displayAuthor(post, req.auth!.sub, isTeacherAuthor),
        canEdit: post.userId === req.auth!.sub,
        canDelete:
          post.userId === req.auth!.sub ||
          req.auth!.role === "ADMIN" ||
          gate.course!.teacherId === req.auth!.sub,
        canPin: gate.course!.teacherId === req.auth!.sub || req.auth!.role === "ADMIN",
        canResolve: post.userId === req.auth!.sub,
        attachments: post.attachments,
        comments: post.comments.map((c: DiscussionCommentItem) => {
          const cTeacher = c.user.id === teacherId;
          return {
            id: c.id,
            parentId: c.parentId,
            body: c.body,
            createdAt: c.createdAt,
            author: displayAuthor(c, req.auth!.sub, cTeacher),
            canEdit: c.userId === req.auth!.sub,
            canDelete:
              c.userId === req.auth!.sub ||
              req.auth!.role === "ADMIN" ||
              gate.course!.teacherId === req.auth!.sub,
            attachments: c.attachments,
          };
        }),
      },
    };
  });

  app.post("/labs/:labId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { labId } = req.params as { labId: string };
    const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
    if (!gate.lab) return reply.code(404).send({ error: "实验不存在" });
    if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

    const schema = z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(50_000),
      anonymous: z.boolean().optional(),
      mentionUserIds: z.array(z.string().uuid()).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const createData = {
      courseId: gate.lab.courseId,
      labId,
      labSetId: gate.lab.labSetId,
      userId: req.auth!.sub,
      title: body.data.title,
      body: body.data.body,
      anonymous: body.data.anonymous ?? false,
    } as Prisma.DiscussionPostUncheckedCreateInput;
    const post = (await prisma.discussionPost.create({
      data: createData,
      include: postInclude as Prisma.DiscussionPostInclude,
    })) as unknown as DiscussionPostListItem;

    const linkPath = `/courses/${gate.lab.courseId}/labs/${labId}/discussions/${post.id}`;
    if (body.data.mentionUserIds?.length) {
      await notifyMentions({
        mentionUserIds: body.data.mentionUserIds,
        fromUserId: req.auth!.sub,
        title: `讨论：${post.title}`,
        linkPath,
      });
    }

    return { post: { ...post, linkPath } };
  });

  app.patch(
    "/labs/:labId/discussions/:postId",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { labId, postId } = req.params as { labId: string; postId: string };
      const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
      if (!gate.lab) return reply.code(404).send({ error: "实验不存在" });

      const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
      if (!post) return reply.code(404).send({ error: "帖子不存在" });

      const schema = z.object({
        title: z.string().min(1).optional(),
        body: z.string().min(1).optional(),
        pinned: z.boolean().optional(),
        resolved: z.boolean().optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const isOwner = post.userId === req.auth!.sub;
      const isTeacher =
        gate.course!.teacherId === req.auth!.sub || req.auth!.role === "ADMIN";

      if (body.data.pinned !== undefined && !isTeacher) {
        return reply.code(403).send({ error: "仅教师可置顶" });
      }
      if (body.data.resolved !== undefined && !isOwner && !isTeacher) {
        return reply.code(403).send({ error: "仅作者可标记已解决" });
      }
      if ((body.data.title || body.data.body) && !isOwner && !isTeacher) {
        return reply.code(403).send({ error: "无权编辑" });
      }

      const updated = await prisma.discussionPost.update({
        where: { id: postId },
        data: body.data,
      });
      return { post: updated };
    },
  );

  app.delete(
    "/labs/:labId/discussions/:postId",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { labId, postId } = req.params as { labId: string; postId: string };
      const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
      const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
      if (!post) return reply.code(404).send({ error: "帖子不存在" });
      const isTeacher =
        gate.course?.teacherId === req.auth!.sub || req.auth!.role === "ADMIN";
      if (post.userId !== req.auth!.sub && !isTeacher) {
        return reply.code(403).send({ error: "无权删除" });
      }
      await prisma.discussionPost.delete({ where: { id: postId } });
      return { ok: true };
    },
  );

  app.post(
    "/labs/:labId/discussions/:postId/comments",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { labId, postId } = req.params as { labId: string; postId: string };
      const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
      if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

      const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
      if (!post) return reply.code(404).send({ error: "帖子不存在" });

      const schema = z.object({
        body: z.string().min(1).max(20_000),
        parentId: z.string().uuid().optional().nullable(),
        anonymous: z.boolean().optional(),
        mentionUserIds: z.array(z.string().uuid()).optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      if (body.data.parentId) {
        const parent = await prisma.discussionComment.findFirst({
          where: { id: body.data.parentId, postId },
        });
        if (!parent) return reply.code(400).send({ error: "被回复的评论不存在" });
      }

      const commentData = {
        postId,
        userId: req.auth!.sub,
        parentId: body.data.parentId ?? null,
        body: body.data.body,
        anonymous: body.data.anonymous ?? false,
      };
      const comment = await (
        prisma as unknown as {
          discussionComment: {
            create: (args: {
              data: typeof commentData;
              include: { user: { select: { id: true; name: true } } };
            }) => Promise<unknown>;
          };
        }
      ).discussionComment.create({
        data: commentData,
        include: { user: { select: { id: true, name: true } } },
      });

      const linkPath = `/courses/${gate.lab!.courseId}/labs/${labId}/discussions/${postId}`;
      if (body.data.mentionUserIds?.length) {
        await notifyMentions({
          mentionUserIds: body.data.mentionUserIds,
          fromUserId: req.auth!.sub,
          title: `回复：${post.title}`,
          linkPath,
        });
      }

      return { comment };
    },
  );

  app.post(
    "/labs/:labId/discussions/:postId/attachments",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { labId, postId } = req.params as { labId: string; postId: string };
      const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, labId);
      if (!gate.ok) return reply.code(403).send({ error: "无权访问" });

      const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
      if (!post) return reply.code(404).send({ error: "帖子不存在" });

      const parts = (req as any).parts();
      let fileBuf: Buffer | null = null;
      let origName = "file.bin";
      let mime = "application/octet-stream";

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          origName = part.filename;
          mime = part.mimetype;
          fileBuf = await part.toBuffer();
        }
      }
      if (!fileBuf) return reply.code(400).send({ error: "请上传 file 字段" });

      const { storedPath, fileName } = await saveDiscussionAttachment(
        "posts",
        postId,
        origName,
        fileBuf,
      );
      const attachData = {
        postId,
        fileName,
        storedPath,
        mimeType: mime,
        sizeBytes: fileBuf.length,
        uploadedById: req.auth!.sub,
      };
      const row = await (
        prisma as unknown as {
          discussionAttachment: {
            create: (args: { data: typeof attachData }) => Promise<unknown>;
          };
        }
      ).discussionAttachment.create({ data: attachData });
      return { attachment: row };
    },
  );

  app.get(
    "/discussion-attachments/:attachmentId/download",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { attachmentId } = req.params as { attachmentId: string };
      const row = (await (
        prisma as unknown as {
          discussionAttachment: {
            findUnique: (args: object) => Promise<{
              storedPath: string;
              mimeType: string | null;
              fileName: string;
              post: { labId: string | null } | null;
            } | null>;
          };
        }
      ).discussionAttachment.findUnique({
        where: { id: attachmentId },
        include: {
          post: { include: { lab: { include: { course: true } } } },
        },
      })) as {
        storedPath: string;
        mimeType: string | null;
        fileName: string;
        post: { labId: string | null } | null;
      } | null;
      if (!row?.post?.labId) return reply.code(404).send({ error: "附件不存在" });

      const gate = await canDiscussLab(req.auth!.sub, req.auth!.role, row.post.labId);
      if (!gate.ok) return reply.code(403).send({ error: "无权下载" });

      const abs = readStoredFileAbs(row.storedPath);
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "文件已丢失" });
      }
      return reply
        .header("Content-Type", row.mimeType ?? "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        )
        .send(createReadStream(abs));
    },
  );

  /** 课程级讨论（保留） */
  app.get("/courses/:courseId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const en = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.auth!.sub, courseId } },
    });
    const isTeacher = course.teacherId === req.auth!.sub || req.auth!.role === "ADMIN";
    if (!en && !isTeacher) return reply.code(403).send({ error: "未选课" });

    const posts = await prisma.discussionPost.findMany({
      where: { courseId, labId: null },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { id: true, name: true } } },
    });
    return { posts };
  });

  app.post("/courses/:courseId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const en = await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: req.auth!.sub, courseId } },
    });
    const isTeacher = course.teacherId === req.auth!.sub || req.auth!.role === "ADMIN";
    if (!en && !isTeacher) return reply.code(403).send({ error: "未选课" });

    const schema = z.object({
      title: z.string().min(1),
      body: z.string().min(1),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "参数无效" });

    const post = await prisma.discussionPost.create({
      data: {
        courseId,
        labId: null,
        userId: req.auth!.sub,
        title: body.data.title,
        body: body.data.body,
      },
      include: { user: { select: { id: true, name: true } } },
    });
    return { post };
  });

  /** 课程成员列表（@ 选人） */
  app.get("/courses/:courseId/lab-sets/:labSetId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
    const q = req.query as { q?: string; sort?: string };
    const gate = await canDiscussLabSet(req.auth!.sub, req.auth!.role, courseId, labSetId);
    if (!gate.labSet) return reply.code(404).send({ error: "实验集不存在" });
    if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

    const where: {
      labSetId: string;
      labId: null;
      OR?: Array<{ title?: object; body?: object; user?: object }>;
    } = { labSetId, labId: null };

    if (q.q?.trim()) {
      const term = q.q.trim();
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { body: { contains: term, mode: "insensitive" } },
        { user: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    const posts = (await prisma.discussionPost.findMany({
      where,
      include: postInclude as Prisma.DiscussionPostInclude,
    })) as unknown as DiscussionPostListItem[];

    const mapped = mapDiscussionPosts(posts, gate.course!.teacherId, req.auth!.sub);
    sortDiscussionPosts(mapped, q.sort ?? "hot");

    const hot = [...mapped]
      .filter((p) => !p.pinned)
      .sort((a, b) => b.viewCount + b.commentCount * 3 - (a.viewCount + a.commentCount * 3))
      .slice(0, 5);

    return { posts: mapped, hot };
  });

  app.post(
    "/courses/:courseId/lab-sets/:labSetId/discussions",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
      const gate = await canDiscussLabSet(req.auth!.sub, req.auth!.role, courseId, labSetId);
      if (!gate.labSet) return reply.code(404).send({ error: "实验集不存在" });
      if (!gate.ok) return reply.code(403).send({ error: "未选课或无权访问" });

      const schema = z.object({
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(50_000),
        anonymous: z.boolean().optional(),
        mentionUserIds: z.array(z.string().uuid()).optional(),
      });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const post = (await prisma.discussionPost.create({
        data: {
          courseId,
          labSetId,
          labId: null,
          userId: req.auth!.sub,
          title: body.data.title,
          body: body.data.body,
          anonymous: body.data.anonymous ?? false,
        },
        include: postInclude as Prisma.DiscussionPostInclude,
      })) as unknown as DiscussionPostListItem;

      const linkPath = `/courses/${courseId}/lab-sets/${labSetId}/discussions/${post.id}`;
      if (body.data.mentionUserIds?.length) {
        await notifyMentions({
          mentionUserIds: body.data.mentionUserIds,
          fromUserId: req.auth!.sub,
          title: `讨论：${post.title}`,
          linkPath,
        });
      }

      return { post: { ...post, linkPath } };
    },
  );

  app.get("/courses/:courseId/discussion-members", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    const teacher = await prisma.user.findUnique({
      where: { id: course.teacherId },
      select: { id: true, name: true, role: true },
    });

    const members = [
      ...(teacher ? [{ ...teacher, isTeacher: true }] : []),
      ...enrollments.map((e) => ({
        id: e.user.id,
        name: e.user.name,
        role: e.user.role,
        isTeacher: false,
      })),
    ];
    return { members };
  });
};

export default discussionsRoutes;
