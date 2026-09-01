import { createReadStream } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { authRequired } from "../lib/auth.js";
import { courseAccess } from "../lib/course-access.js";
import { config } from "../lib/config.js";
import { prisma } from "../lib/prisma.js";

const uploadRoot = resolve(config.uploadDir);

const materialsRoutes: FastifyPluginAsync = async (app) => {
  app.get("/courses/:courseId/materials", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const access = await courseAccess(request.auth!.sub, request.auth!.role, params.data.courseId);
    if (!access.course) return reply.code(404).send({ error: "课程不存在" });
    if (!access.canView) return reply.code(403).send({ error: "无权查看课程资料" });
    const materials = await prisma.courseMaterial.findMany({ where: { courseId: access.course.id, isCurrent: true }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], include: { uploadedBy: { select: { id: true, name: true } }, favorites: { where: { userId: request.auth!.sub }, select: { id: true } } } });
    return { materials: materials.filter((material) => material.visibility === "ALL" || access.isTeacher || material.targetClassId === access.enrollment?.classId).map((material) => ({ id: material.id, title: material.title, fileName: material.fileName, mimeType: material.mimeType, sizeBytes: material.sizeBytes, folderPath: material.folderPath, visibility: material.visibility, pinned: material.pinned, createdAt: material.createdAt, uploadedBy: material.uploadedBy, favorited: material.favorites.length > 0, downloadUrl: `/materials/${material.id}/download` })) };
  });

  app.post("/courses/:courseId/materials", { preHandler: authRequired("TEACHER", "ADMIN") }, async (request, reply) => {
    const params = z.object({ courseId: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "课程 ID 无效" });
    const accessResult = await courseAccess(request.auth!.sub, request.auth!.role, params.data.courseId);
    if (!accessResult.course) return reply.code(404).send({ error: "课程不存在" });
    if (!accessResult.isTeacher) return reply.code(403).send({ error: "仅课程教师可上传资料" });
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "请选择资料文件" });
    const fields = file.fields as Record<string, { value?: string }>;
    const title = fields.title?.value?.trim() || file.filename;
    const visibility = fields.visibility?.value ?? "ALL";
    if (!new Set(["ALL", "CLASS", "TEACHER_ONLY"]).has(visibility)) return reply.code(400).send({ error: "资料可见范围无效" });
    const bytes = await file.toBuffer();
    if (bytes.length > 50 * 1024 * 1024) return reply.code(413).send({ error: "文件不能超过 50MB" });
    const safeName = file.filename.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fa5]/g, "_");
    const storedPath = `${params.data.courseId}/${randomUUID()}-${safeName}`;
    await mkdir(join(uploadRoot, params.data.courseId), { recursive: true });
    await writeFile(join(uploadRoot, storedPath), bytes);
    const material = await prisma.courseMaterial.create({ data: { courseId: params.data.courseId, title, fileName: safeName, storedPath, mimeType: file.mimetype, sizeBytes: bytes.length, uploadedById: request.auth!.sub, visibility, targetClassId: visibility === "CLASS" ? fields.targetClassId?.value : undefined, groupId: randomUUID() } });
    return reply.code(201).send({ material: { id: material.id, title: material.title, fileName: material.fileName, sizeBytes: material.sizeBytes } });
  });

  app.post("/materials/:id/favorite", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "资料 ID 无效" });
    const material = await prisma.courseMaterial.findUnique({ where: { id: params.data.id } });
    if (!material) return reply.code(404).send({ error: "资料不存在" });
    const accessResult = await courseAccess(request.auth!.sub, request.auth!.role, material.courseId);
    if (!accessResult.canView) return reply.code(403).send({ error: "无权收藏资料" });
    await prisma.materialFavorite.upsert({ where: { userId_materialId: { userId: request.auth!.sub, materialId: material.id } }, create: { userId: request.auth!.sub, materialId: material.id }, update: {} });
    return { ok: true };
  });

  app.get("/materials/:id/download", { preHandler: authRequired() }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: "资料 ID 无效" });
    const material = await prisma.courseMaterial.findUnique({ where: { id: params.data.id } });
    if (!material) return reply.code(404).send({ error: "资料不存在" });
    const accessResult = await courseAccess(request.auth!.sub, request.auth!.role, material.courseId);
    if (!accessResult.canView) return reply.code(403).send({ error: "无权下载资料" });
    const path = join(uploadRoot, material.storedPath);
    try { await access(path); } catch { return reply.code(404).send({ error: "资料文件不存在" }); }
    await prisma.courseMaterial.update({ where: { id: material.id }, data: { downloadCount: { increment: 1 }, lastDownloadAt: new Date() } });
    reply.header("Content-Type", material.mimeType ?? "application/octet-stream");
    reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(material.fileName)}`);
    return reply.send(createReadStream(path));
  });
};

export default materialsRoutes;
