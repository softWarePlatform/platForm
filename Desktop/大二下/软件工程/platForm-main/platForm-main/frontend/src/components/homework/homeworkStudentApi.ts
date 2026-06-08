import { api } from "../../api/client";
import type { StudentHomeworkView } from "./homeworkStudentTypes";

export function studentFileDownloadUrl(homeworkId: string, fileId: string): string {
  return `/api/homework/${homeworkId}/submit-files/${fileId}/download`;
}

export async function fetchMyHomeworkStatus(homeworkId: string) {
  const { data } = await api.get<StudentHomeworkView>(`/homework/${homeworkId}/my-status`);
  return data;
}

export async function saveHomeworkDraft(homeworkId: string, content: string) {
  await api.put(`/homework/${homeworkId}/draft`, { content });
}


export async function uploadStudentHomeworkFile(homeworkId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  await api.post(`/homework/${homeworkId}/submit-files`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export async function deleteStudentHomeworkFile(homeworkId: string, fileId: string) {
  await api.delete(`/homework/${homeworkId}/submit-files/${fileId}`);
}

export async function submitHomework(
  homeworkId: string,
  body: { content?: string; requirementsRead: boolean },
) {
  const { data } = await api.post(`/homework/${homeworkId}/submit`, body);
  return data as { message?: string; lateHint?: string | null };
}

export async function deleteStudentHomework(homeworkId: string) {
  await api.delete(`/homework/${homeworkId}/submission`);
}

export async function requestHomeworkRedo(homeworkId: string, reason: string) {
  await api.post(`/homework/${homeworkId}/redo-request`, { reason: reason || undefined });
}

export async function fetchKnowledgeGap(homeworkId: string) {
  const { data } = await api.get<{ analysis: unknown }>(`/homework/${homeworkId}/knowledge-gap`);
  return data.analysis;
}

export async function askKnowledgeGap(homeworkId: string, question: string) {
  const { data } = await api.post<{ answer: string }>(`/homework/${homeworkId}/knowledge-gap/ask`, {
    question,
  });
  return data.answer;
}

export async function generateWrongBook(homeworkId: string) {
  const { data } = await api.post<{ count: number }>(`/homework/${homeworkId}/wrong-book`, {});
  return data.count;
}
