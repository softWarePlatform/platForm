import { api } from "../../api/client";

const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".zip", ".rar"];

export function isAllowedHomeworkFile(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((e) => lower.endsWith(e));
}

export async function uploadHomeworkAttachments(homeworkId: string, files: File[]) {
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/homework/${homeworkId}/attachments`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
}

export async function uploadHomeworkRubricFile(homeworkId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  await api.post(`/homework/${homeworkId}/rubric-file`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function attachmentDownloadUrl(homeworkId: string, attachmentId: string): string {
  return `/api/homework/${homeworkId}/attachments/${attachmentId}/download`;
}
