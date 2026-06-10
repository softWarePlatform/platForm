import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";
import { emitNotificationToUsers } from "./notification-events.js";

export const MATERIAL_VISIBILITY = ["ALL", "CLASS", "TEACHER_ONLY"] as const;
export type MaterialVisibility = (typeof MATERIAL_VISIBILITY)[number];

export const MAX_MATERIAL_BYTES = Number(process.env.MATERIAL_MAX_BYTES ?? 50 * 1024 * 1024);
export const MAX_VIDEO_BYTES = Number(process.env.MATERIAL_VIDEO_MAX_BYTES ?? 200 * 1024 * 1024);

const VIDEO_EXT = new Set(["mp4", "webm", "mov", "avi", "mkv"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const DOC_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md"]);
const CODE_EXT = new Set([
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "java",
  "c",
  "cpp",
  "h",
  "go",
  "rs",
  "sql",
  "json",
  "xml",
  "html",
  "css",
  "sh",
]);
const ARCHIVE_EXT = new Set(["zip", "rar", "7z", "tar", "gz"]);

export type MaterialFileCategory = "slides" | "video" | "document" | "code" | "image" | "archive" | "other";

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function classifyMaterial(name: string, mime?: string | null): MaterialFileCategory {
  const ext = extOf(name);
  if (VIDEO_EXT.has(ext) || (mime?.startsWith("video/") ?? false)) return "video";
  if (IMAGE_EXT.has(ext) || (mime?.startsWith("image/") ?? false)) return "image";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (CODE_EXT.has(ext)) return "code";
  if (DOC_EXT.has(ext) || mime?.includes("pdf") || mime?.includes("presentation")) {
    if (["ppt", "pptx"].includes(ext) || mime?.includes("presentation")) return "slides";
    return "document";
  }
  return "other";
}

export function normalizeFolderPath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

export function isPreviewable(name: string, mime?: string | null): boolean {
  const cat = classifyMaterial(name, mime);
  return cat === "document" || cat === "image" || cat === "code" || cat === "slides";
}

export function maxBytesForFile(name: string, mime?: string | null): number {
  return classifyMaterial(name, mime) === "video" ? MAX_VIDEO_BYTES : MAX_MATERIAL_BYTES;
}

export async function canViewMaterials(
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

export function canManageMaterials(
  userId: string,
  role: string,
  course: { teacherId: string },
): boolean {
  return role === "ADMIN" || course.teacherId === userId;
}

export async function getEnrollmentClassId(userId: string, courseId: string) {
  const en = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
    select: { classId: true },
  });
  return en?.classId ?? null;
}

export function materialVisibleToUser(
  mat: {
    visibility: string;
    targetClassId: string | null;
  },
  opts: { isManager: boolean; enrollmentClassId: string | null },
): boolean {
  if (opts.isManager) return true;
  if (mat.visibility === "TEACHER_ONLY") return false;
  if (mat.visibility === "CLASS") {
    if (!mat.targetClassId) return false;
    return mat.targetClassId === opts.enrollmentClassId;
  }
  return true;
}

export async function notifyStudentsOfMaterial(
  courseId: string,
  materialId: string,
  title: string,
) {
  const enrollments = await prisma.enrollment.findMany({
    where: { courseId },
    select: { userId: true },
  });
  if (enrollments.length === 0) return;

  const notifTitle = `【课程资料】${title}`;
  const linkPath = `/courses/${courseId}/materials`;

  await prisma.siteNotification.createMany({
    data: enrollments.map((e) => ({
      userId: e.userId,
      type: "MATERIAL",
      title: notifTitle,
      body: title,
      linkPath,
      materialId,
    })),
  });
  emitNotificationToUsers(enrollments.map((e) => e.userId));
}

export function newMaterialGroupId(): string {
  return randomUUID();
}
