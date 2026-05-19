import type { CustomScheduleEvent } from "./types";

const SCHEDULE_KEY_PREFIX = "tp-custom-schedule-v1";
const ORDER_KEY_PREFIX = "tp-course-order-v1";

function scheduleKey(userId: string | null | undefined) {
  return userId ? `${SCHEDULE_KEY_PREFIX}-${userId}` : `${SCHEDULE_KEY_PREFIX}-anonymous`;
}

function orderKey(userId: string | null | undefined) {
  return userId ? `${ORDER_KEY_PREFIX}-${userId}` : `${ORDER_KEY_PREFIX}-anonymous`;
}

export function loadCustomEvents(userId: string | null | undefined): CustomScheduleEvent[] {
  try {
    const raw = localStorage.getItem(scheduleKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomScheduleEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomEvents(userId: string | null | undefined, events: CustomScheduleEvent[]) {
  localStorage.setItem(scheduleKey(userId), JSON.stringify(events));
}

export function loadCourseOrder(userId: string | null | undefined): string[] {
  try {
    const raw = localStorage.getItem(orderKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCourseOrder(userId: string | null | undefined, ids: string[]) {
  localStorage.setItem(orderKey(userId), JSON.stringify(ids));
}
