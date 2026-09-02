import { config } from "./config.js";
import { httpJson } from "./http.js";
import { raceTimeoutFallback } from "./timeout.js";

export type LabGradebook = {
  labStatus: "OK" | "UNAVAILABLE";
  labAverage: number | null;
  students: Array<{ userId: string; labAverage: number | null }>;
};

export type WrongBookEntryInput = {
  userId: string;
  courseId: string;
  sourceType: "HOMEWORK";
  sourceId: string;
  title: string;
  content: string;
};

export const LAB_GRADEBOOK_TIMEOUT_MS = 3000;
export const WRONG_BOOK_TIMEOUT_MS = 2000;

const emptyLab = (): LabGradebook => ({ labStatus: "UNAVAILABLE", labAverage: null, students: [] });

function scoreOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseLabGradebook(status: number, body: Record<string, unknown>): LabGradebook {
  if (status < 200 || status >= 300) return emptyLab();
  if (body.labStatus === "UNAVAILABLE") return emptyLab();
  const raw = Array.isArray(body.students) ? body.students : Array.isArray(body.items) ? body.items : [];
  const students: LabGradebook["students"] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const userId = String(record.userId ?? record.id ?? "");
    if (!userId) continue;
    students.push({ userId, labAverage: scoreOrNull(record.labAverage) });
  }
  return {
    labStatus: "OK",
    labAverage: scoreOrNull(body.labAverage),
    students,
  };
}

function internalHeaders(extra: Record<string, string> = {}) {
  return { "x-internal-service-token": config.internalServiceToken, ...extra };
}

export function labIdempotencyKey(raw: string) {
  const key = raw.slice(0, 200);
  return key.length >= 8 ? key : key.padEnd(8, "0");
}

export async function fetchLabGradebook(courseId: string, userIds: string[] = []): Promise<LabGradebook> {
  return raceTimeoutFallback(loadLabGradebook(courseId, userIds), LAB_GRADEBOOK_TIMEOUT_MS, emptyLab());
}

async function loadLabGradebook(courseId: string, userIds: string[]): Promise<LabGradebook> {
  try {
    const result = await httpJson(`${config.labServiceUrl}/internal/courses/${courseId}/lab-gradebook`, {
      timeoutMs: LAB_GRADEBOOK_TIMEOUT_MS,
      headers: internalHeaders(),
    });
    if (result.status === 404 && userIds.length) return loadLabGradesBatch(courseId, userIds);
    return parseLabGradebook(result.status, result.body);
  } catch {
    return emptyLab();
  }
}

async function loadLabGradesBatch(courseId: string, userIds: string[]): Promise<LabGradebook> {
  try {
    const result = await httpJson(`${config.labServiceUrl}/internal/courses/${courseId}/lab-grades:batch`, {
      method: "POST",
      timeoutMs: LAB_GRADEBOOK_TIMEOUT_MS,
      headers: internalHeaders(),
      body: JSON.stringify({ userIds: userIds.slice(0, 500) }),
    });
    return parseLabGradebook(result.status, result.body);
  } catch {
    return emptyLab();
  }
}

export async function putWrongBookEntry(entry: WrongBookEntryInput, idempotencyKey: string): Promise<{ ok: boolean; status: number }> {
  try {
    const result = await httpJson(`${config.labServiceUrl}/internal/wrong-book/entries`, {
      method: "PUT",
      timeoutMs: WRONG_BOOK_TIMEOUT_MS,
      headers: internalHeaders({
        "idempotency-key": labIdempotencyKey(idempotencyKey),
      }),
      body: JSON.stringify(entry),
    });
    return { ok: result.status >= 200 && result.status < 300, status: result.status };
  } catch {
    return { ok: false, status: 503 };
  }
}

export async function deleteWrongBookEntries(sourceType: "HOMEWORK", sourceId: string): Promise<{ ok: boolean; status: number }> {
  try {
    const result = await httpJson(`${config.labServiceUrl}/internal/wrong-book/entries/${sourceType}/${sourceId}`, {
      method: "DELETE",
      timeoutMs: WRONG_BOOK_TIMEOUT_MS,
      headers: internalHeaders({
        "idempotency-key": labIdempotencyKey(`delete:${sourceType}:${sourceId}`),
      }),
    });
    return { ok: result.status >= 200 && result.status < 300, status: result.status };
  } catch {
    return { ok: false, status: 503 };
  }
}

export function combineTotal(
  homeworkAverage: number | null,
  labAverage: number | null,
  homeworkWeight: number,
  labWeight: number,
  labStatus: "OK" | "UNAVAILABLE",
) {
  if (labStatus !== "OK") {
    return { totalScore: null as number | null, labAverage: null as number | null, provisionalTotal: homeworkAverage == null ? null : homeworkAverage * homeworkWeight };
  }
  if (labAverage == null) {
    return { totalScore: null, labAverage: null, provisionalTotal: homeworkAverage == null ? null : homeworkAverage * homeworkWeight };
  }
  const total = labAverage * labWeight + (homeworkAverage ?? 0) * homeworkWeight;
  return { totalScore: total, labAverage, provisionalTotal: null as number | null };
}
