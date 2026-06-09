import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../lib/prisma.js";
import { authRequired } from "../lib/authGuard.js";
import { UPLOAD_ROOT, saveLabFile } from "../lib/uploads.js";

async function canAccessLab(userId: string, role: string, labId: string) {
  const lab = await prisma.lab.findUnique({
    where: { id: labId },
    include: { course: true },
  });
  if (!lab) return { ok: false as const, reason: "实验不存在" };

  if (role === "ADMIN" || lab.course.teacherId === userId) {
    return { ok: true as const, lab };
  }
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lab.courseId } },
  });
  if (!en) return { ok: false as const, reason: "未选课" };
  return { ok: true as const, lab };
}

const labFilesRoutes: FastifyPluginAsync = async (app) => {
  app.get("/labs/:labId/files", { preHandler: authRequired() }, async (req, reply) => {
    const { labId } = req.params as { labId: string };
    const check = await canAccessLab(req.auth!.sub, req.auth!.role, labId);
    if (!check.ok) return reply.code(404).send({ error: check.reason });

    const rows = await (prisma as any).labFile.findMany({
      where: { labId },
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
    return { files: rows };
  });

  /** 教师：上传实验附件（multipart：file + title 可选） */
  app.post(
    "/labs/:labId/files",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { labId } = req.params as { labId: string };
      const check = await canAccessLab(req.auth!.sub, req.auth!.role, labId);
      if (!check.ok) return reply.code(404).send({ error: check.reason });
      if (req.auth!.role !== "ADMIN" && check.lab.course.teacherId !== req.auth!.sub) {
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

      const { storedPath, fileName } = await saveLabFile(labId, origName, fileBuf);
      const row = await (prisma as any).labFile.create({
        data: {
          labId,
          title: title.trim() || origName,
          fileName,
          storedPath,
          mimeType: mime,
          sizeBytes: fileBuf.length,
          uploadedById: req.auth!.sub,
        },
      });

      return { file: row };
    },
  );

  app.get(
    "/labs/:labId/files/:fileId/download",
    { preHandler: authRequired() },
    async (req, reply) => {
      const { labId, fileId } = req.params as { labId: string; fileId: string };
      const check = await canAccessLab(req.auth!.sub, req.auth!.role, labId);
      if (!check.ok) return reply.code(404).send({ error: check.reason });

      const row = await (prisma as any).labFile.findFirst({
        where: { id: fileId, labId },
      });
      if (!row) return reply.code(404).send({ error: "文件不存在" });

      const abs = join(UPLOAD_ROOT, ...String(row.storedPath).split("/").filter(Boolean));
      try {
        await access(abs);
      } catch {
        return reply.code(404).send({ error: "文件已丢失" });
      }
      const stream = createReadStream(abs);
      return reply
        .header("Content-Type", row.mimeType ?? "application/octet-stream")
        .header(
          "Content-Disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        )
        .send(stream);
    },
  );

  app.delete(
    "/labs/:labId/files/:fileId",
    { preHandler: authRequired("TEACHER", "ADMIN") },
    async (req, reply) => {
      const { labId, fileId } = req.params as { labId: string; fileId: string };
      const check = await canAccessLab(req.auth!.sub, req.auth!.role, labId);
      if (!check.ok) return reply.code(404).send({ error: check.reason });
      if (req.auth!.role !== "ADMIN" && check.lab.course.teacherId !== req.auth!.sub) {
        return reply.code(403).send({ error: "无权删除" });
      }

      const row = await (prisma as any).labFile.findFirst({
        where: { id: fileId, labId },
      });
      if (row) {
        try {
          await unlink(join(UPLOAD_ROOT, ...String(row.storedPath).split("/").filter(Boolean)));
        } catch {
          /* ignore */
        }
        await (prisma as any).labFile.delete({ where: { id: row.id } });
      }

      return { ok: true };
    },
  );
};

export default labFilesRoutes;

