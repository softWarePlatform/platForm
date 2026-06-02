import { api } from "../../api/client";

export const MAX_DISCUSSION_ATTACHMENTS = 5;
export const MAX_DISCUSSION_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type DiscussionAttachmentRow = {
  id: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number;
};

export function formatAttachmentSize(bytes?: number) {
  if (bytes == null || !Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileNameFromContentDisposition(header: string | undefined, fallback: string) {
  if (!header?.includes("filename*=")) return fallback;
  const m = header.match(/filename\*=UTF-8''(.+)/);
  if (!m?.[1]) return fallback;
  try {
    return decodeURIComponent(m[1].replace(/;$/, ""));
  } catch {
    return fallback;
  }
}

/** 带 Bearer 鉴权下载（不可直接用 a href，否则 401） */
export async function downloadDiscussionAttachment(attachmentId: string, fileName: string) {
  const res = await api.get(`/discussion-attachments/${attachmentId}/download`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFromContentDisposition(
    res.headers["content-disposition"] as string | undefined,
    fileName,
  );
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadDiscussionPostAttachments(
  labId: string,
  postId: string,
  files: File[],
) {
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    await api.post(`/labs/${labId}/discussions/${postId}/attachments`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
}

export function validateDiscussionAttachment(file: File): string | null {
  if (file.size > MAX_DISCUSSION_ATTACHMENT_BYTES) {
    return `「${file.name}」超过 10MB 上限`;
  }
  return null;
}
