import { config } from "./config.js";

export type LabGradebook = {
  labStatus: "OK" | "UNAVAILABLE";
  labAverage: number | null;
  students: Array<{ userId: string; labAverage: number | null }>;
};

const emptyLab = (): LabGradebook => ({ labStatus: "UNAVAILABLE", labAverage: null, students: [] });

export async function fetchLabGradebook(courseId: string): Promise<LabGradebook> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await Promise.race([
      fetch(`${config.labServiceUrl}/internal/courses/${courseId}/lab-gradebook`, {
        headers: { "x-internal-service-token": config.internalServiceToken },
        signal: controller.signal,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("lab-service-timeout")), 3050);
      }),
    ]);
    if (!response.ok) return emptyLab();
    const body = await Promise.race([
      response.json() as Promise<{
        labStatus?: "OK" | "UNAVAILABLE";
        labAverage?: number | null;
        students?: Array<{ userId: string; labAverage: number | null }>;
      }>,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("lab-service-body-timeout")), 3000);
      }),
    ]);
    if (body.labStatus === "UNAVAILABLE") return emptyLab();
    return {
      labStatus: "OK",
      labAverage: body.labAverage ?? null,
      students: body.students ?? [],
    };
  } catch {
    return emptyLab();
  } finally {
    clearTimeout(timer);
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
  if (labAverage == null && homeworkAverage == null) return { totalScore: null, labAverage, provisionalTotal: null };
  const total = (labAverage ?? 0) * labWeight + (homeworkAverage ?? 0) * homeworkWeight;
  return { totalScore: total, labAverage, provisionalTotal: null as number | null };
}
