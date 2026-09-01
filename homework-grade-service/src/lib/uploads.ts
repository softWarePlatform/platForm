import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

export const UPLOAD_ROOT = config.uploadDir;

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, "_").slice(0, 180) || "file";
}

export async function saveHomeworkFile(homeworkId: string, originalName: string, data: Buffer) {
  const dir = join(UPLOAD_ROOT, "homework", homeworkId);
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}_${sanitizeFilename(originalName)}`;
  await writeFile(join(dir, diskName), data);
  return { storedPath: `homework/${homeworkId}/${diskName}`, fileName: originalName };
}

export async function saveStudentHomeworkFile(submissionId: string, originalName: string, data: Buffer) {
  const dir = join(UPLOAD_ROOT, "homework-submissions", submissionId);
  await mkdir(dir, { recursive: true });
  const diskName = `${randomUUID()}_${sanitizeFilename(originalName)}`;
  await writeFile(join(dir, diskName), data);
  return { storedPath: `homework-submissions/${submissionId}/${diskName}`, fileName: originalName };
}
