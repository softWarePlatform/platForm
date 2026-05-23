import type { FastifyBaseLogger } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

/** 与 schema 对齐；避免 IDE 使用未 regenerate 的 Client 时报缺 delegate / 字段 */
type LabReminderSentDelegate = {
  findUnique(args: {
    where: { labSetId_userId_kind: { labSetId: string; userId: string; kind: string } };
  }): Promise<{ id: string } | null>;
  create(args: { data: { labSetId: string; userId: string; kind: string } }): Promise<{ id: string }>;
};

function labReminderSentDb(): LabReminderSentDelegate {
  return (prisma as unknown as { labReminderSent: LabReminderSentDelegate }).labReminderSent;
}

function labReminderNotificationData(input: {
  userId: string;
  title: string;
  body: string;
  linkPath: string;
  labSetId: string;
}): Prisma.SiteNotificationUncheckedCreateInput {
  return {
    userId: input.userId,
    type: LAB_REMINDER_TYPE,
    title: input.title,
    body: input.body,
    linkPath: input.linkPath,
    labSetId: input.labSetId,
  } as Prisma.SiteNotificationUncheckedCreateInput;
}

export const LAB_REMINDER_TYPE = "LAB_REMINDER";
export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

export type LabReminderKind = "BEFORE_START" | "BEFORE_END";

export type ActiveLabReminderDto = {
  kind: LabReminderKind;
  labSetId: string;
  courseId: string;
  courseTitle: string;
  labSetTitle: string;
  eventAt: string;
  title: string;
  body: string;
  linkPath: string;
};

type LabSetReminderRow = {
  id: string;
  courseId: string;
  title: string;
  startAt: Date | null;
  dueAt: Date | null;
  course: { title: string };
};

/** 事件前 2 小时内且尚未到点 */
export function isInLabReminderWindow(eventAt: Date, now: Date): boolean {
  const t = eventAt.getTime();
  const n = now.getTime();
  return n >= t - REMINDER_LEAD_MS && n < t;
}

function formatEventTime(d: Date): string {
  return d.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function buildLabReminderCopy(
  labSet: { title: string; course: { title: string } },
  kind: LabReminderKind,
  eventAt: Date,
): { title: string; body: string } {
  const when = formatEventTime(eventAt);
  if (kind === "BEFORE_START") {
    return {
      title: `实验即将开始：${labSet.title}`,
      body: `课程「${labSet.course.title}」的实验集「${labSet.title}」将于 ${when} 开始，请提前准备。`,
    };
  }
  return {
    title: `实验即将截止：${labSet.title}`,
    body: `课程「${labSet.course.title}」的实验集「${labSet.title}」将于 ${when} 截止，请尽快完成提交。`,
  };
}

function linkPath(courseId: string, labSetId: string): string {
  return `/courses/${courseId}/lab-sets/${labSetId}`;
}

function toActiveDto(
  ls: LabSetReminderRow,
  kind: LabReminderKind,
  eventAt: Date,
): ActiveLabReminderDto {
  const { title, body } = buildLabReminderCopy(ls, kind, eventAt);
  return {
    kind,
    labSetId: ls.id,
    courseId: ls.courseId,
    courseTitle: ls.course.title,
    labSetTitle: ls.title,
    eventAt: eventAt.toISOString(),
    title,
    body,
    linkPath: linkPath(ls.courseId, ls.id),
  };
}

export function collectActiveRemindersForLabSets(
  labSets: LabSetReminderRow[],
  now: Date,
): ActiveLabReminderDto[] {
  const out: ActiveLabReminderDto[] = [];
  for (const ls of labSets) {
    if (ls.startAt && isInLabReminderWindow(ls.startAt, now)) {
      out.push(toActiveDto(ls, "BEFORE_START", ls.startAt));
    }
    if (ls.dueAt && isInLabReminderWindow(ls.dueAt, now)) {
      out.push(toActiveDto(ls, "BEFORE_END", ls.dueAt));
    }
  }
  out.sort((a, b) => a.eventAt.localeCompare(b.eventAt));
  return out;
}

/** 学生主界面：当前仍在 2h 提醒窗内的实验集 */
export async function getActiveLabRemindersForUser(
  userId: string,
  now = new Date(),
): Promise<ActiveLabReminderDto[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    select: {
      course: {
        select: {
          id: true,
          title: true,
          labSets: {
            select: {
              id: true,
              courseId: true,
              title: true,
              startAt: true,
              dueAt: true,
              course: { select: { title: true } },
            },
          },
        },
      },
    },
  });

  const labSets: LabSetReminderRow[] = [];
  for (const e of enrollments) {
    for (const ls of e.course.labSets) {
      labSets.push(ls);
    }
  }
  return collectActiveRemindersForLabSets(labSets, now);
}

async function sendReminderIfNeeded(
  labSet: LabSetReminderRow,
  userId: string,
  kind: LabReminderKind,
  eventAt: Date,
): Promise<boolean> {
  const reminderDb = labReminderSentDb();
  const existing = await reminderDb.findUnique({
    where: {
      labSetId_userId_kind: { labSetId: labSet.id, userId, kind },
    },
  });
  if (existing) return false;

  const { title, body } = buildLabReminderCopy(labSet, kind, eventAt);
  const path = linkPath(labSet.courseId, labSet.id);

  await prisma.$transaction(async (tx) => {
    const txReminder = (tx as unknown as { labReminderSent: LabReminderSentDelegate }).labReminderSent;
    await txReminder.create({
      data: { labSetId: labSet.id, userId, kind },
    });
    await tx.siteNotification.create({
      data: labReminderNotificationData({
        userId,
        title,
        body,
        linkPath: path,
        labSetId: labSet.id,
      }),
    });
  });
  return true;
}

/** 扫描所有实验集，在 2h 窗口内为选课学生创建站内通知（去重） */
export async function scanAndSendLabReminders(log?: FastifyBaseLogger): Promise<number> {
  const now = new Date();
  const labSets = await prisma.labSet.findMany({
    where: {
      OR: [{ startAt: { not: null } }, { dueAt: { not: null } }],
    },
    select: {
      id: true,
      courseId: true,
      title: true,
      startAt: true,
      dueAt: true,
      course: { select: { title: true } },
    },
  });

  let sent = 0;
  for (const ls of labSets) {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: ls.courseId },
      select: { userId: true },
    });
    const userIds = enrollments.map((e) => e.userId);
    if (userIds.length === 0) continue;

    const tasks: Array<{ kind: LabReminderKind; eventAt: Date }> = [];
    if (ls.startAt && isInLabReminderWindow(ls.startAt, now)) {
      tasks.push({ kind: "BEFORE_START", eventAt: ls.startAt });
    }
    if (ls.dueAt && isInLabReminderWindow(ls.dueAt, now)) {
      tasks.push({ kind: "BEFORE_END", eventAt: ls.dueAt });
    }

    for (const userId of userIds) {
      for (const t of tasks) {
        try {
          const ok = await sendReminderIfNeeded(ls, userId, t.kind, t.eventAt);
          if (ok) sent += 1;
        } catch (err) {
          log?.warn(
            { err, labSetId: ls.id, userId, kind: t.kind },
            "lab-reminder send failed",
          );
        }
      }
    }
  }

  if (sent > 0) {
    log?.info({ sent }, "lab-reminders scan sent notifications");
  }
  return sent;
}

export const LAB_REMINDER_SCAN_INTERVAL_MS = 5 * 60 * 1000;

export function startLabReminderScheduler(log: FastifyBaseLogger): () => void {
  const run = () => {
    void scanAndSendLabReminders(log);
  };
  run();
  const timer = setInterval(run, LAB_REMINDER_SCAN_INTERVAL_MS);
  return () => clearInterval(timer);
}
