import type { CustomScheduleEvent } from "./types";

const KEY = "tp-custom-schedule-v1";

export function loadCustomEvents(): CustomScheduleEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomScheduleEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomEvents(events: CustomScheduleEvent[]) {
  localStorage.setItem(KEY, JSON.stringify(events));
}

export function loadCourseOrder(): string[] {
  try {
    const raw = localStorage.getItem("tp-course-order-v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCourseOrder(ids: string[]) {
  localStorage.setItem("tp-course-order-v1", JSON.stringify(ids));
}
