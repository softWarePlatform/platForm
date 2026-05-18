import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? join(process.cwd(), "uploads");

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, "_").slice(0, 180) || "file";
}

export async function saveCourseMaterialFile(
  courseId: string,
  originalName: string,
  data: Buffer,
): Promise<{ storedPath: string; fileName: string }> {
  const dir = join(UPLOAD_ROOT, "courses", courseId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalName);
  const id = randomUUID();
  const diskName = `${id}_${safe}`;
  await writeFile(join(dir, diskName), data);
  const storedPath = `courses/${courseId}/${diskName}`;
  return { storedPath, fileName: originalName };
}

export async function saveHomeworkFile(
  homeworkId: string,
  originalName: string,
  data: Buffer,
): Promise<{ storedPath: string; fileName: string }> {
  const dir = join(UPLOAD_ROOT, "homework", homeworkId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalName);
  const id = randomUUID();
  const diskName = `${id}_${safe}`;
  await writeFile(join(dir, diskName), data);
  const storedPath = `homework/${homeworkId}/${diskName}`;
  return { storedPath, fileName: originalName };
}

export async function saveStudentHomeworkFile(
  submissionId: string,
  originalName: string,
  data: Buffer,
): Promise<{ storedPath: string; fileName: string }> {
  const dir = join(UPLOAD_ROOT, "homework-submissions", submissionId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalName);
  const id = randomUUID();
  const diskName = `${id}_${safe}`;
  await writeFile(join(dir, diskName), data);
  const storedPath = `homework-submissions/${submissionId}/${diskName}`;
  return { storedPath, fileName: originalName };
}

export async function saveLabFile(
  labId: string,
  originalName: string,
  data: Buffer,
): Promise<{ storedPath: string; fileName: string }> {
  const dir = join(UPLOAD_ROOT, "labs", labId);
  await mkdir(dir, { recursive: true });
  const safe = sanitizeFilename(originalName);
  const id = randomUUID();
  const diskName = `${id}_${safe}`;
  await writeFile(join(dir, diskName), data);
  const storedPath = `labs/${labId}/${diskName}`;
  return { storedPath, fileName: originalName };
}
