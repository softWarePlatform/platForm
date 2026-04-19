import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../lib/prisma.js";
import { authRequired, optionalAuth } from "../lib/authGuard.js";
import { UPLOAD_ROOT, saveCourseMaterialFile } from "../lib/uploads.js";

async function canViewMaterials(
  userId: string | undefined,
  role: string | undefined,
  course: { id: string; teacherId: string; published: boolean },
): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (course.teacherId === userId) return true;
  if (!course.published) return false;
  if (!userId) return false;
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: course.id } },
  });
  return !!en;
}

const courseMaterialsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/courses/:courseId/materials",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canViewMaterials(req.auth?.sub, req.auth?.role, course);
      if (!ok) return reply.code(403).send({ error: "无权查看课程资料" });

      const list = await (prisma as any).courseMaterial.findMany({
        where: { courseId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true } },
        },
      });
      return { materials: list };
    },
  );

  /** multipart：字段 file（文件）+ title（可选，资料标题） */
  app.post(
    "/courses/:courseId/materials",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId } = req.params as { courseId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权上传" });
      }

      const parts = (req as any).parts();
      let fileBuf: Buffer | null = null;
      let origName = "file.bin";
      let mime = "application/octet-stream";
      let title = "";

      for await (const part of parts) {
        if (part.type === "file" && part.fieldname === "file") {
          origName = part.filename;
          mime = part.mimetype;
          fileBuf = await part.toBuffer();
        } else if (part.type === "field" && part.fieldname === "title") {
          title = String(part.value);
        }
      }

      if (!fileBuf) return reply.code(400).send({ error: "请使用 multipart，字段名 file 上传文件" });

      const { storedPath, fileName } = await saveCourseMaterialFile(courseId, origName, fileBuf);
      const row = await (prisma as any).courseMaterial.create({
        data: {
          courseId,
          title: title.trim() || origName,
          fileName,
          storedPath,
          mimeType: mime,
          sizeBytes: fileBuf.length,
          uploadedById: req.auth!.sub,
        },
      });
      return { material: row };
    },
  );

  app.get(
    "/courses/:courseId/materials/:materialId/download",
    { preHandler: optionalAuth },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) return reply.code(404).send({ error: "课程不存在" });

      const ok = await canViewMaterials(req.auth?.sub, req.auth?.role, course);
      if (!ok) return reply.code(403).send({ error: "无权下载" });

      const mat = await (prisma as any).courseMaterial.findFirst({
        where: { id: materialId, courseId },
      });
      if (!mat) return reply.code(404).send({ error: "文件不存在" });

      const abs = join(UPLOAD_ROOT, ...mat.storedPath.split("/").filter(Boolean));
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "文件已丢失" });
      }

      const stream = createReadStream(abs);
      return reply
        .header("Content-Type", mat.mimeType ?? "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(mat.fileName)}`,
        )
        .send(stream);
    },
  );

  app.delete(
    "/courses/:courseId/materials/:materialId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { courseId, materialId } = req.params as { courseId: string; materialId: string };
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course || (req.auth!.role !== "ADMIN" && course.teacherId !== req.auth!.sub)) {
        return reply.code(403).send({ error: "无权删除" });
      }

      const mat = await prisma.courseMaterial.findFirst({
        where: { id: materialId, courseId },
      });
      if (mat) {
        try {
          await unlink(join(UPLOAD_ROOT, ...mat.storedPath.split("/").filter(Boolean)));
        } catch {
          /* ignore */
        }
        await (prisma as any).courseMaterial.delete({ where: { id: mat.id } });
      }
      return { ok: true };
    },
  );
};

export default courseMaterialsRoutes;
