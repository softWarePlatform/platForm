import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { createCourseNotifications, fetchCourseAccess, fetchCourseInfo, fetchCourseRoster, fetchCourseUsers } from "../course-client.js";
import { readStoredFileAbs, saveDiscussionAttachment } from "../lib/uploads.js";

type Viewer = { id: string; role: string; requestId: string };
type Scope = { courseId: string; labId?: string | null; labSetId?: string | null };

async function authorize(viewer: Viewer, courseId: string) {
  const course = await fetchCourseInfo(courseId, viewer.requestId);
  if (!course) return { ok: false as const, status: 404, message: "课程不存在" };
  const isTeacher = viewer.role === "ADMIN" || course.teacherId === viewer.id;
  if (isTeacher) return { ok: true as const, course, isTeacher };
  const access = await fetchCourseAccess(courseId, viewer.id, viewer.requestId);
  if (!access?.canView) return { ok: false as const, status: 403, message: "未选课或无权访问" };
  return { ok: true as const, course, isTeacher: false };
}

function displayAuthor(
  post: { userId: string; anonymous: boolean },
  viewerId: string,
  teacherId: string,
  names: Map<string, string>,
) {
  if (post.anonymous && post.userId !== viewerId) {
    return { id: null, name: "匿名同学", isTeacher: false, isAnonymous: true };
  }
  return {
    id: post.userId,
    name: names.get(post.userId) ?? "未知用户",
    isTeacher: post.userId === teacherId,
    isAnonymous: post.anonymous,
  };
}

async function authorNames(ids: string[], requestId: string) {
  const result = await fetchCourseUsers([...new Set(ids)], requestId);
  return new Map(result.users.map((user) => [user.id, user.name]));
}

async function notifyMentions(input: {
  userIds: string[];
  viewer: Viewer;
  courseId: string;
  title: string;
  linkPath: string;
}) {
  const userIds = [...new Set(input.userIds.filter((id) => id && id !== input.viewer.id))];
  if (!userIds.length) return;
  await createCourseNotifications({
    userIds,
    type: "DISCUSSION",
    title: input.title,
    body: "有人在讨论区 @ 了你",
    linkPath: input.linkPath,
    idempotencyKey: `lab-discussion:${input.courseId}:${input.linkPath}:${input.title}`,
    requestId: input.viewer.requestId,
  });
}

function postWhere(scope: Scope) {
  return {
    courseId: scope.courseId,
    labId: scope.labId ?? null,
    labSetId: scope.labSetId ?? null,
  };
}

async function listPosts(viewer: Viewer, scope: Scope, sort: string) {
  const gate = await authorize(viewer, scope.courseId);
  if (!gate.ok) return gate;
  const posts = await prisma.discussionPost.findMany({
    where: postWhere(scope),
    include: { _count: { select: { comments: true } } },
  });
  const names = await authorNames(posts.map((post) => post.userId), viewer.requestId);
  const mapped = posts.map((post) => ({
    id: post.id,
    title: post.title,
    body: post.body.slice(0, 200),
    pinned: post.pinned,
    resolved: post.resolved,
    viewCount: post.viewCount,
    commentCount: post._count.comments,
    createdAt: post.createdAt,
    author: displayAuthor(post, viewer.id, gate.course.teacherId, names),
  }));
  mapped.sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (sort === "new") return right.createdAt.getTime() - left.createdAt.getTime();
    return right.viewCount + right.commentCount * 3 - left.viewCount - left.commentCount * 3;
  });
  return {
    ok: true as const,
    posts: mapped,
    hot: mapped.filter((post) => !post.pinned).slice().sort((a, b) => b.viewCount + b.commentCount * 3 - a.viewCount - a.commentCount * 3).slice(0, 5),
  };
}

const postSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(50_000),
  anonymous: z.boolean().optional(),
  mentionUserIds: z.array(z.string().uuid()).optional(),
});

const discussionsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/labs/:labId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const lab = await prisma.lab.findUnique({ where: { id: (req.params as { labId: string }).labId } });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });
    const result = await listPosts({ id: req.auth!.sub, role: req.auth!.role, requestId: req.id }, { courseId: lab.courseId, labId: lab.id }, String((req.query as { sort?: string }).sort ?? "hot"));
    if (!result.ok) return reply.code(result.status).send({ error: result.message });
    return { posts: result.posts, hot: result.hot };
  });

  app.get("/courses/:courseId/lab-sets/:labSetId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
    const labSet = await prisma.labSet.findFirst({ where: { id: labSetId, courseId } });
    if (!labSet) return reply.code(404).send({ error: "实验集不存在" });
    const result = await listPosts({ id: req.auth!.sub, role: req.auth!.role, requestId: req.id }, { courseId, labSetId }, String((req.query as { sort?: string }).sort ?? "hot"));
    if (!result.ok) return reply.code(result.status).send({ error: result.message });
    return { posts: result.posts, hot: result.hot };
  });

  app.get("/courses/:courseId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const result = await listPosts({ id: req.auth!.sub, role: req.auth!.role, requestId: req.id }, { courseId }, String((req.query as { sort?: string }).sort ?? "new"));
    if (!result.ok) return reply.code(result.status).send({ error: result.message });
    return { posts: result.posts, hot: result.hot };
  });

  async function createPost(req: Parameters<FastifyPluginAsync>[0] extends never ? never : any, reply: any, scope: Scope) {
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, scope.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const parsed = postSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "参数无效" });
    const post = await prisma.discussionPost.create({
      data: { ...postWhere(scope), userId: viewer.id, title: parsed.data.title, body: parsed.data.body, anonymous: parsed.data.anonymous ?? false },
    });
    const linkPath = scope.labId
      ? `/courses/${scope.courseId}/labs/${scope.labId}/discussions/${post.id}`
      : `/courses/${scope.courseId}/lab-sets/${scope.labSetId ?? ""}/discussions/${post.id}`;
    await notifyMentions({ userIds: parsed.data.mentionUserIds ?? [], viewer, courseId: scope.courseId, title: `讨论：${post.title}`, linkPath });
    return { post: { ...post, linkPath } };
  }

  app.post("/labs/:labId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const lab = await prisma.lab.findUnique({ where: { id: (req.params as { labId: string }).labId } });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });
    return createPost(req, reply, { courseId: lab.courseId, labId: lab.id });
  });
  app.post("/courses/:courseId/lab-sets/:labSetId/discussions", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId, labSetId } = req.params as { courseId: string; labSetId: string };
    const labSet = await prisma.labSet.findFirst({ where: { id: labSetId, courseId } });
    if (!labSet) return reply.code(404).send({ error: "实验集不存在" });
    return createPost(req, reply, { courseId, labSetId });
  });
  app.post("/courses/:courseId/discussions", { preHandler: authRequired() }, async (req, reply) => createPost(req, reply, { courseId: (req.params as { courseId: string }).courseId }));

  app.get("/labs/:labId/discussions/:postId", { preHandler: authRequired() }, async (req, reply) => {
    const { labId, postId } = req.params as { labId: string; postId: string };
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, lab.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId }, include: { attachments: true, comments: { orderBy: { createdAt: "asc" }, include: { attachments: true } } } });
    if (!post) return reply.code(404).send({ error: "帖子不存在" });
    await prisma.discussionPost.update({ where: { id: post.id }, data: { viewCount: { increment: 1 } } });
    const names = await authorNames([post.userId, ...post.comments.map((comment) => comment.userId)], req.id);
    const canModerate = gate.isTeacher;
    return { post: { ...post, viewCount: post.viewCount + 1, author: displayAuthor(post, viewer.id, gate.course.teacherId, names), canEdit: post.userId === viewer.id || canModerate, canDelete: post.userId === viewer.id || canModerate, canPin: canModerate, canResolve: post.userId === viewer.id || canModerate, comments: post.comments.map((comment) => ({ ...comment, author: displayAuthor(comment, viewer.id, gate.course.teacherId, names), canEdit: comment.userId === viewer.id || canModerate, canDelete: comment.userId === viewer.id || canModerate })) } };
  });

  app.patch("/labs/:labId/discussions/:postId", { preHandler: authRequired() }, async (req, reply) => {
    const { labId, postId } = req.params as { labId: string; postId: string };
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, lab.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
    if (!post) return reply.code(404).send({ error: "帖子不存在" });
    const parsed = z.object({ title: z.string().min(1).optional(), body: z.string().min(1).optional(), pinned: z.boolean().optional(), resolved: z.boolean().optional() }).safeParse(req.body);
    if (!parsed.success || !Object.keys(parsed.data).length) return reply.code(400).send({ error: "参数无效" });
    if (!gate.isTeacher && post.userId !== viewer.id) return reply.code(403).send({ error: "无权编辑" });
    if ((parsed.data.pinned !== undefined || parsed.data.resolved !== undefined) && !gate.isTeacher && post.userId !== viewer.id) return reply.code(403).send({ error: "无权更新状态" });
    if (parsed.data.pinned !== undefined && !gate.isTeacher) return reply.code(403).send({ error: "仅教师可置顶" });
    return { post: await prisma.discussionPost.update({ where: { id: postId }, data: parsed.data }) };
  });

  app.delete("/labs/:labId/discussions/:postId", { preHandler: authRequired() }, async (req, reply) => {
    const { labId, postId } = req.params as { labId: string; postId: string };
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, lab.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
    if (!post) return reply.code(404).send({ error: "帖子不存在" });
    if (!gate.isTeacher && post.userId !== viewer.id) return reply.code(403).send({ error: "无权删除" });
    await prisma.discussionPost.delete({ where: { id: postId } });
    return { ok: true };
  });

  app.post("/labs/:labId/discussions/:postId/comments", { preHandler: authRequired() }, async (req, reply) => {
    const { labId, postId } = req.params as { labId: string; postId: string };
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab) return reply.code(404).send({ error: "实验不存在" });
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, lab.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const post = await prisma.discussionPost.findFirst({ where: { id: postId, labId } });
    if (!post) return reply.code(404).send({ error: "帖子不存在" });
    const parsed = z.object({ body: z.string().min(1).max(20_000), parentId: z.string().uuid().nullable().optional(), anonymous: z.boolean().optional(), mentionUserIds: z.array(z.string().uuid()).optional() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "参数无效" });
    if (parsed.data.parentId && !await prisma.discussionComment.findFirst({ where: { id: parsed.data.parentId, postId } })) return reply.code(400).send({ error: "被回复的评论不存在" });
    const comment = await prisma.discussionComment.create({ data: { postId, userId: viewer.id, parentId: parsed.data.parentId ?? null, body: parsed.data.body, anonymous: parsed.data.anonymous ?? false } });
    await notifyMentions({ userIds: parsed.data.mentionUserIds ?? [], viewer, courseId: lab.courseId, title: `回复：${post.title}`, linkPath: `/courses/${lab.courseId}/labs/${labId}/discussions/${postId}` });
    return { comment };
  });

  app.post("/labs/:labId/discussions/:postId/attachments", { preHandler: authRequired() }, async (req, reply) => {
    const { labId, postId } = req.params as { labId: string; postId: string };
    const lab = await prisma.lab.findUnique({ where: { id: labId } });
    if (!lab || !await prisma.discussionPost.findFirst({ where: { id: postId, labId } })) return reply.code(404).send({ error: "讨论不存在" });
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, lab.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "请上传 file 字段" });
    const data = await part.toBuffer();
    const stored = await saveDiscussionAttachment("posts", postId, part.filename, data);
    return { attachment: await prisma.discussionAttachment.create({ data: { postId, fileName: stored.fileName, storedPath: stored.storedPath, mimeType: part.mimetype, sizeBytes: data.length, uploadedById: viewer.id } }) };
  });

  app.get("/discussion-attachments/:attachmentId/download", { preHandler: authRequired() }, async (req, reply) => {
    const row = await prisma.discussionAttachment.findUnique({ where: { id: (req.params as { attachmentId: string }).attachmentId }, include: { post: true } });
    if (!row?.post) return reply.code(404).send({ error: "附件不存在" });
    const gate = await authorize({ id: req.auth!.sub, role: req.auth!.role, requestId: req.id }, row.post.courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const absolutePath = readStoredFileAbs(row.storedPath);
    try { await access(absolutePath); } catch { return reply.code(404).send({ error: "文件已丢失" }); }
    return reply.header("Content-Type", row.mimeType ?? "application/octet-stream").header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`).send(createReadStream(absolutePath));
  });

  app.get("/courses/:courseId/discussion-members", { preHandler: authRequired() }, async (req, reply) => {
    const { courseId } = req.params as { courseId: string };
    const viewer: Viewer = { id: req.auth!.sub, role: req.auth!.role, requestId: req.id };
    const gate = await authorize(viewer, courseId);
    if (!gate.ok) return reply.code(gate.status).send({ error: gate.message });
    const roster = await fetchCourseRoster(courseId, req.id);
    return { members: [{ id: gate.course.teacherId, name: gate.course.teacher?.name ?? "教师", role: "TEACHER", isTeacher: true }, ...roster.filter((user) => user.id !== gate.course.teacherId).map((user) => ({ id: user.id, name: user.name, role: user.role, isTeacher: false }))] };
  });
};

export default discussionsRoutes;
