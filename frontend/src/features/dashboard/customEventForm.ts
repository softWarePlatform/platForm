import type { CustomScheduleEvent } from "./types";

export const CUSTOM_EVENT_COLORS = [
  { value: "#fef3c7", label: "琥珀" },
  { value: "#dbeafe", label: "蓝色" },
  { value: "#dcfce7", label: "绿色" },
  { value: "#fce7f3", label: "粉色" },
  { value: "#e0e7ff", label: "靛蓝" },
  { value: "#ffedd5", label: "橙色" },
  { value: "#f3e8ff", label: "紫色" },
  { value: "#f1f5f9", label: "灰色" },
];

export type CustomEventDraft = {
  title: string;
  dayOfWeek: number;
  periodStart: number;
  periodEnd: number;
  room: string;
  note: string;
  color: string;
  weekParity: "all" | "odd" | "even";
};

export function emptyCustomEventDraft(
  defaults?: Partial<CustomEventDraft>,
): CustomEventDraft {
  return {
    title: "",
    dayOfWeek: 1,
    periodStart: 3,
    periodEnd: 4,
    room: "",
    note: "",
    color: "#fef3c7",
    weekParity: "all",
    ...defaults,
  };
}

export function draftFromEvent(ev: CustomScheduleEvent): CustomEventDraft {
  return {
    title: ev.title,
    dayOfWeek: ev.dayOfWeek,
    periodStart: ev.periodStart,
    periodEnd: ev.periodEnd,
    room: ev.room ?? "",
    note: ev.note ?? "",
    color: ev.color,
    weekParity: ev.weekParity ?? "all",
  };
}

export function draftToEvent(id: string, draft: CustomEventDraft): CustomScheduleEvent {
  return {
    id,
    title: draft.title.trim(),
    dayOfWeek: draft.dayOfWeek,
    periodStart: draft.periodStart,
    periodEnd: Math.max(draft.periodEnd, draft.periodStart),
    room: draft.room.trim() || undefined,
    note: draft.note.trim() || undefined,
    color: draft.color,
    weekParity: draft.weekParity,
  };
}
