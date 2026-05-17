import { z } from "zod";

export type ScheduleSlot = {
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  room: string;
};

const slotSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    periodStart: z.number().int().min(1).max(12),
    periodEnd: z.number().int().min(1).max(12),
    room: z.string().max(64).optional().default(""),
  })
  .refine((s) => s.periodEnd >= s.periodStart, { message: "结束节次不能早于开始节次" });

export const scheduleSlotsBodySchema = z.array(slotSchema).max(8);

/** 无课表数据时由课程 id 生成稳定占位（兼容旧数据） */
export function deriveScheduleSlots(courseId: string): ScheduleSlot[] {
  let h = 0;
  for (let i = 0; i < courseId.length; i++) h = (h * 31 + courseId.charCodeAt(i)) >>> 0;
  const dayOfWeek = (h % 5) + 1;
  const periodStart = (h % 4) + 1;
  const roomNo = (h % 5) + 1;
  return [
    {
      dayOfWeek,
      periodStart,
      periodEnd: periodStart + 1,
      room: `教学楼 A${roomNo}0${((h >> 4) % 4) + 1}`,
    },
  ];
}

export function parseScheduleSlotsJson(
  json: string | null | undefined,
  courseId: string,
): ScheduleSlot[] {
  if (!json?.trim()) return deriveScheduleSlots(courseId);
  try {
    const raw = JSON.parse(json) as unknown;
    const parsed = scheduleSlotsBodySchema.safeParse(raw);
    if (parsed.success && parsed.data.length > 0) {
      return parsed.data.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        periodStart: s.periodStart,
        periodEnd: s.periodEnd,
        room: s.room?.trim() ?? "",
      }));
    }
  } catch {
    /* fall through */
  }
  return deriveScheduleSlots(courseId);
}

export function serializeScheduleSlots(slots: ScheduleSlot[]): string | null {
  if (slots.length === 0) return null;
  return JSON.stringify(slots);
}
