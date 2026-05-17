import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import archiver from "archiver";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authRequired, optionalAuth } from "../lib/authGuard.js";
import { UPLOAD_ROOT, saveCourseMaterialFile } from "../lib/uploads.js";
import {
  MATERIAL_VISIBILITY,
  canManageMaterials,
  canViewMaterials,
  classifyMaterial,
  getEnrollmentClassId,
  isPreviewable,
  materialVisibleToUser,
  maxBytesForFile,
  newMaterialGroupId,
  normalizeFolderPath,
  notifyStudentsOfMaterial,
} from "../lib/course-materials.js";

const materialSelect = {
  id: true,
  title: true,
  fileName: true,
  mimeType: true,
  sizeBytes: true,
  folderPath: true,
  visibility: true,
  targetClassId: true,
  pinned: true,
  groupId: true,
  version: true,
  isCurrent: true,
  downloadCount: true,
  lastDownloadAt: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { id: true, name: true } },
  targetClass: { select: { id: true, name: true } },
} as const;

function absStoredPath(storedPath: string) {
  return join(UPLOAD_ROOT, ...storedPath.split("/").filter(Boolean));
}

async function loadCourse(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: { classes: { select: { id: true, name: true } } },
  });
}

const courseMaterialsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/courses/:courseId/materials",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const q = req.query as Record<string, string | undefined>;
      const course = await loadCourse(courseId);
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canViewMaterials(req.auth?.sub, req.auth?.role, course);
      if (!ok) return reply.code(403).send({ error: "无权查看课程资料" });

      const isManager = req.auth
        ? canManageMaterials(req.auth.sub, req.auth.role, course)
        : false;
      const enrollmentClassId =
        req.auth?.sub && !isManager
          ? await getEnrollmentClassId(req.auth.sub, courseId)
          : null;

      const searchQ = (q.q ?? "").trim().toLowerCase();
      const fileType = (q.fileType ?? "").trim();
      const folderPath = normalizeFolderPath(q.folder ?? "");
      const favoritesOnly = q.favorites === "1";
      const dateFrom = q.dateFrom ? new Date(q.dateFrom) : null;
      const dateTo = q.dateTo ? new Date(q.dateTo) : null;

      let rows = await prisma.courseMaterial.findMany({
        where: { courseId, isCurrent: true },
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        select: materialSelect,
      });

      rows = rows.filter((m) =>
        materialVisibleToUser(m, { isManager, enrollmentClassId }),
      );

      if (folderPath) {
        rows = rows.filter((m) => m.folderPath === folderPath);
      }

      if (searchQ) {
        rows = rows.filter(
          (m) =>
            m.title.toLowerCase().includes(searchQ) ||
            m.fileName.toLowerCase().includes(searchQ),
        );
      }

      if (fileType) {
        rows = rows.filter((m) => classifyMaterial(m.fileName, m.mimeType) === fileType);
      }

      if (dateFrom && !Number.isNaN(dateFrom.getTime())) {
        rows = rows.filter((m) => m.createdAt >= dateFrom);
      }
      if (dateTo && !Number.isNaN(dateTo.getTime())) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        rows = rows.filter((m) => m.createdAt <= end);
      }

      let favoriteIds = new Set<string>();
      if (req.auth?.sub) {
        const favs = await prisma.materialFavorite.findMany({
          where: { userId: req.auth.sub, materialId: { in: rows.map((r) => r.id) } },
          select: { materialId: true },
        });
        favoriteIds = new Set(favs.map((f) => f.materialId));
      }

      if (favoritesOnly) {
        rows = rows.filter((r) => favoriteIds.has(r.id));
      }

      const allForFolders = await prisma.courseMaterial.findMany({
        where: { courseId, isCurrent: true },
        select: { folderPath: true, visibility: true, targetClassId: true },
      });
      const folderSet = new Set<string>();
      for (const m of allForFolders) {
        if (!materialVisibleToUser(m, { isManager, enrollmentClassId })) continue;
        if (m.folderPath) folderSet.add(m.folderPath);
        const parts = m.folderPath.split("/");
        for (let i = 1; i < parts.length; i++) {
          folderSet.add(parts.slice(0, i).join("/"));
        }
      }

      const materials = rows.map((m) => ({
        ...m,
        fileType: classifyMaterial(m.fileName, m.mimeType),
        previewable: isPreviewable(m.fileName, m.mimeType),
        favorited: favoriteIds.has(m.id),
      }));

      return {
        materials,
        folders: [...folderSet].sort((a, b) => a.localeCompare(b, "zh-CN")),
        classes: course.classes,
        isManager,
      };
    },
  );

  app.get(
    "/courses/:courseId/materials/favorites",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      const ok = await canViewMaterials(req.auth!.sub, req.auth!.role, course);
      if (!ok) return reply.code(403).send({ error: "无权查看" });

      const favs = await prisma.materialFavorite.findMany({
        where: { userId: req.auth!.sub, material: { courseId, isCurrent: true } },
        include: {
          material: { select: materialSelect },
        },
        orderBy: { createdAt: "desc" },
      });

      const isManager = canManageMaterials(req.auth!.sub, req.auth!.role, course);
      const enrollmentClassId = isManager
        ? null
        : await getEnrollmentClassId(req.auth!.sub, courseId);

      const materials = favs
        .filter((f) =>
          materialVisibleToUser(f.material, { isManager, enrollmentClassId }),
        )
        .map((f) => ({
          ...f.material,
          fileType: classifyMaterial(f.material.fileName, f.material.mimeType),
          previewable: isPreviewable(f.material.fileName, f.material.mimeType),
          favorited: true,
        }));

      return { materials };
    },
  );

  app.get(
    "/courses/:courseId/materials/groups/:groupId/versions",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId, groupId } = req.params as { courseId: string; groupId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      const ok = await canViewMaterials(req.auth?.sub, req.auth?.role, course);
      if (!ok) return reply.code(403).send({ error: "无权查看" });

      const isManager = req.auth
        ? canManageMaterials(req.auth.sub, req.auth.role, course)
        : false;
      const enrollmentClassId =
        req.auth?.sub && !isManager
          ? await getEnrollmentClassId(req.auth.sub, courseId)
          : null;

      const versions = await prisma.courseMaterial.findMany({
        where: { courseId, groupId },
        orderBy: { version: "desc" },
        select: materialSelect,
      });

      const visible = versions.filter((m) =>
        materialVisibleToUser(m, { isManager, enrollmentClassId }),
      );
      return {
        versions: visible.map((m) => ({
          ...m,
          fileType: classifyMaterial(m.fileName, m.mimeType),
          isCurrent: m.isCurrent,
        })),
      };
    },
  );

  /** multipart：file + title, folderPath, visibility, targetClassId, replaceGroupId, notify */
  app.post(
    "/courses/:courseId/materials",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !canManageMaterials(req.auth!.sub, req.auth!.role, course)) {
        return reply.code(403).send({ error: "无权上传" });
      }

      const parts = (req as { parts: () => AsyncIterable<any> }).parts();
      const files: Array<{ buf: Buffer; name: string; mime: string }> = [];
      let title = "";
      let folderPath = "";
      let visibility: string = "ALL";
      let targetClassId: string | null = null;
      let replaceGroupId: string | null = null;
      let notify = true;
      let pinned = false;

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          const buf = await part.toBuffer();
          files.push({ buf, name: part.filename, mime: part.mimetype });
        } else if (part.type === "field") {
          const v = String(part.value);
          if (part.fieldname === "title") title = v;
          if (part.fieldname === "folderPath") folderPath = normalizeFolderPath(v);
          if (part.fieldname === "visibility") visibility = v;
          if (part.fieldname === "targetClassId") targetClassId = v || null;
          if (part.fieldname === "replaceGroupId") replaceGroupId = v || null;
          if (part.fieldname === "notify") notify = v !== "0" && v !== "false";
          if (part.fieldname === "pinned") pinned = v === "1" || v === "true";
        }
      }

      if (files.length === 0) {
        return reply.code(400).send({ error: "请上传至少一个文件（字段名 file）" });
      }
      if (!MATERIAL_VISIBILITY.includes(visibility as (typeof MATERIAL_VISIBILITY)[number])) {
        return reply.code(400).send({ error: "可见范围无效" });
      }
      if (visibility === "CLASS" && targetClassId) {
        const cls = await prisma.class.findFirst({
          where: { id: targetClassId, courseId },
        });
        if (!cls) return reply.code(400).send({ error: "指定班级不存在" });
      }

      const created: unknown[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]!;
        const limit = maxBytesForFile(f.name, f.mime);
        if (f.buf.length > limit) {
          return reply.code(400).send({
            error: `文件「${f.name}」超过大小限制（${Math.round(limit / 1024 / 1024)}MB）`,
          });
        }

        let groupId = newMaterialGroupId();
        let version = 1;
        if (replaceGroupId && i === 0) {
          const prev = await prisma.courseMaterial.findMany({
            where: { courseId, groupId: replaceGroupId },
            orderBy: { version: "desc" },
            take: 1,
          });
          if (prev.length === 0) {
            return reply.code(400).send({ error: "要更新的资料组不存在" });
          }
          groupId = replaceGroupId;
          version = prev[0]!.version + 1;
          await prisma.courseMaterial.updateMany({
            where: { courseId, groupId: replaceGroupId },
            data: { isCurrent: false },
          });
        }

        const { storedPath, fileName } = await saveCourseMaterialFile(courseId, f.name, f.buf);
        const row = await prisma.courseMaterial.create({
          data: {
            courseId,
            title: (i === 0 && title.trim()) || f.name,
            fileName,
            storedPath,
            mimeType: f.mime,
            sizeBytes: f.buf.length,
            uploadedById: req.auth!.sub,
            folderPath,
            visibility,
            targetClassId: visibility === "CLASS" ? targetClassId : null,
            pinned: i === 0 ? pinned : false,
            groupId,
            version,
            isCurrent: true,
          },
          select: materialSelect,
        });
        created.push(row);

        if (notify && (replaceGroupId || i === 0)) {
          await notifyStudentsOfMaterial(courseId, row.id, row.title);
        }
      }

      return { materials: created };
    },
  );

  const patchSchema = z.object({
    title: z.string().min(1).max(200).optional(),
    folderPath: z.string().max(300).optional(),
    visibility: z.enum(["ALL", "CLASS", "TEACHER_ONLY"]).optional(),
    targetClassId: z.string().uuid().nullable().optional(),
    pinned: z.boolean().optional(),
    notify: z.boolean().optional(),
  });

  app.patch(
    "/courses/:courseId/materials/:materialId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !canManageMaterials(req.auth!.sub, req.auth!.role, course)) {
        return reply.code(403).send({ error: "无权修改" });
      }

      const body = patchSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "参数无效" });

      const mat = await prisma.courseMaterial.findFirst({
        where: { id: materialId, courseId },
      });
      if (!mat) return reply.code(404).send({ error: "资料不存在" });

      const data: Record<string, unknown> = {};
      if (body.data.title !== undefined) data.title = body.data.title;
      if (body.data.folderPath !== undefined) {
        data.folderPath = normalizeFolderPath(body.data.folderPath);
      }
      if (body.data.visibility !== undefined) {
        data.visibility = body.data.visibility;
        if (body.data.visibility !== "CLASS") data.targetClassId = null;
      }
      if (body.data.targetClassId !== undefined) data.targetClassId = body.data.targetClassId;
      if (body.data.pinned !== undefined) data.pinned = body.data.pinned;

      const updated = await prisma.courseMaterial.update({
        where: { id: materialId },
        data,
        select: materialSelect,
      });

      if (body.data.notify) {
        await notifyStudentsOfMaterial(courseId, updated.id, updated.title);
      }

      return { material: updated };
    },
  );

  async function streamMaterialFile(
    req: { auth?: { sub: string; role: string } },
    courseId: string,
    materialId: string,
    reply: { code: (n: number) => { send: (p: unknown) => unknown } },
    opts: { inline: boolean; countDownload: boolean },
  ) {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return reply.code(404).send({ error: "课程不存在" });

    const ok = await canViewMaterials(req.auth?.sub, req.auth?.role, course);
    if (!ok) return reply.code(403).send({ error: "无权访问" });

    const mat = await prisma.courseMaterial.findFirst({
      where: { id: materialId, courseId },
    });
    if (!mat) return reply.code(404).send({ error: "文件不存在" });

    const isManager = req.auth
      ? canManageMaterials(req.auth.sub, req.auth.role, course)
      : false;
    const enrollmentClassId =
      req.auth?.sub && !isManager
        ? await getEnrollmentClassId(req.auth.sub, courseId)
        : null;
    if (!materialVisibleToUser(mat, { isManager, enrollmentClassId })) {
      return reply.code(403).send({ error: "无权访问该资料" });
    }

    const abs = absStoredPath(mat.storedPath);
    try {
      await access(abs);
    } catch {
      return reply.code(404).send({ error: "文件已丢失" });
    }

    if (opts.countDownload) {
      await prisma.courseMaterial.update({
        where: { id: mat.id },
        data: {
          downloadCount: { increment: 1 },
          lastDownloadAt: new Date(),
        },
      });
    }

    const disp = opts.inline ? "inline" : "attachment";
    const stream = createReadStream(abs);
    return (reply as any)
      .header("Content-Type", mat.mimeType ?? "application/octet-stream")
      .header(
        "Content-Disposition",
        `${disp}; filename*=UTF-8''${encodeURIComponent(mat.fileName)}`,
      )
      .send(stream);
  }

  app.get(
    "/courses/:courseId/materials/:materialId/download",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      return streamMaterialFile(req, courseId, materialId, reply, {
        inline: false,
        countDownload: true,
      });
    },
  );

  app.get(
    "/courses/:courseId/materials/:materialId/preview",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      const mat = await prisma.courseMaterial.findFirst({
        where: { id: materialId, courseId },
      });
      if (!mat || !isPreviewable(mat.fileName, mat.mimeType)) {
        return reply.code(400).send({ error: "该文件不支持在线预览" });
      }
      return streamMaterialFile(req, courseId, materialId, reply, {
        inline: true,
        countDownload: false,
      });
    },
  );

  app.post(
    "/courses/:courseId/materials/batch-download",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });
      const body = schema.safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "请选择要下载的文件" });

      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      const ok = await canViewMaterials(req.auth?.sub, req.auth?.role, course);
      if (!ok) return reply.code(403).send({ error: "无权下载" });

      const isManager = req.auth
        ? canManageMaterials(req.auth.sub, req.auth.role, course)
        : false;
      const enrollmentClassId =
        req.auth?.sub && !isManager
          ? await getEnrollmentClassId(req.auth.sub, courseId)
          : null;

      const mats = await prisma.courseMaterial.findMany({
        where: { courseId, id: { in: body.data.ids } },
      });

      const allowed = mats.filter((m) =>
        materialVisibleToUser(m, { isManager, enrollmentClassId }),
      );
      if (allowed.length === 0) {
        return reply.code(400).send({ error: "没有可下载的文件" });
      }

      const archive = archiver("zip", { zlib: { level: 6 } });
      const pass = new PassThrough();
      archive.pipe(pass);

      for (const m of allowed) {
        const abs = absStoredPath(m.storedPath);
        try {
          await access(abs);
          const prefix = m.folderPath ? `${m.folderPath}/` : "";
          archive.file(abs, { name: `${prefix}${m.fileName}` });
          await prisma.courseMaterial.update({
            where: { id: m.id },
            data: {
              downloadCount: { increment: 1 },
              lastDownloadAt: new Date(),
            },
          });
        } catch {
          /* skip missing */
        }
      }

      void archive.finalize();

      return reply
        .header("Content-Type", "application/zip")
        .header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent("课程资料.zip")}`)
        .send(pass);
    },
  );

  app.post(
    "/courses/:courseId/materials/:materialId/favorite",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });
      const ok = await canViewMaterials(req.auth!.sub, req.auth!.role, course);
      if (!ok) return reply.code(403).send({ error: "无权操作" });

      const mat = await prisma.courseMaterial.findFirst({
        where: { id: materialId, courseId, isCurrent: true },
      });
      if (!mat) return reply.code(404).send({ error: "资料不存在" });

      await prisma.materialFavorite.upsert({
        where: {
          userId_materialId: { userId: req.auth!.sub, materialId },
        },
        create: { userId: req.auth!.sub, materialId },
        update: {},
      });
      return { ok: true };
    },
  );

  app.delete(
    "/courses/:courseId/materials/:materialId/favorite",
    { preHandler: authRequired() },
    async (req) => {
      const { materialId } = req.params as { materialId: string };
      await prisma.materialFavorite.deleteMany({
        where: { userId: req.auth!.sub, materialId },
      });
      return { ok: true };
    },
  );

  app.delete(
    "/courses/:courseId/materials/:materialId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || !canManageMaterials(req.auth!.sub, req.auth!.role, course)) {
        return reply.code(403).send({ error: "无权删除" });
      }

      const mat = await prisma.courseMaterial.findFirst({
        where: { id: materialId, courseId },
      });
      if (mat) {
        const groupMats = await prisma.courseMaterial.findMany({
          where: { courseId, groupId: mat.groupId },
        });
        for (const g of groupMats) {
          try {
            await unlink(absStoredPath(g.storedPath));
          } catch {
            /* ignore */
          }
        }
        await prisma.courseMaterial.deleteMany({
          where: { courseId, groupId: mat.groupId },
        });
      }
      return { ok: true };
    },
  );
};

export default courseMaterialsRoutes;
