import { createCourseNotifications, fetchCourseRoster } from "../course-client.js";

export async function notifyLabSetPublished(input: {
  courseId: string;
  labSetId: string;
  labSetTitle: string;
  courseTitle: string;
  requestId?: string;
}): Promise<void> {
  const students = await fetchCourseRoster(input.courseId, input.requestId);
  if (!students.length) return;
  await createCourseNotifications({
    userIds: students.map((student) => student.id),
    type: "LAB_PUBLISHED",
    title: `新实验：${input.labSetTitle}`,
    body: `${input.courseTitle} 发布了新的实验集`,
    linkPath: `/courses/${input.courseId}/labs/sets/${input.labSetId}`,
    labSetId: input.labSetId,
    idempotencyKey: `lab-set-published:${input.labSetId}`,
    requestId: input.requestId,
  });
}

export async function notifyLabSubmissionGraded(input: {
  userId: string; labTitle: string; courseId: string; labId: string; score: number;
  labSetId?: string | null; requestId?: string;
}): Promise<void> {
  await createCourseNotifications({
    userIds: [input.userId], type: "LAB_GRADED", title: `实验已批改：${input.labTitle}`,
    body: `你的提交已批改，得分 ${input.score} 分。`,
    linkPath: `/courses/${input.courseId}/labs/${input.labId}`,
    labSetId: input.labSetId ?? undefined,
    idempotencyKey: `lab-graded:${input.labId}:${input.userId}:${input.score}`,
    requestId: input.requestId,
  });
}

export async function notifyLabSubmissionReturned(input: {
  userId: string; labTitle: string; courseId: string; labId: string; reason: string;
  labSetId?: string | null; requestId?: string;
}): Promise<void> {
  await createCourseNotifications({
    userIds: [input.userId], type: "LAB_RETURNED", title: `实验已打回：${input.labTitle}`,
    body: input.reason.slice(0, 500), linkPath: `/courses/${input.courseId}/labs/${input.labId}`,
    labSetId: input.labSetId ?? undefined,
    idempotencyKey: `lab-returned:${input.labId}:${input.userId}:${input.reason}`,
    requestId: input.requestId,
  });
}
