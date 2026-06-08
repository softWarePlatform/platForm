import { useCallback, useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { LabProblemGridStatus } from "./labExplorerStatus";

export type LabMyProgressRow = {
  id: string;
  title: string;
  language: string;
  gridStatus: LabProblemGridStatus;
  bestScore: number | null;
  lastStatus: string;
  lastSubmitAt: string | null;
};

export type LabMyProgressResponse = {
  labSet: {
    id: string;
    courseId: string;
    title: string;
    startAt: string | null;
    dueAt: string | null;
    allowMakeup: boolean;
    makeupDueAt: string | null;
    outsideAccessMode: "BLOCK" | "VIEW_ONLY";
    access?: import("../labSetAccess").LabSetAccess;
    score: number | null;
    completed: boolean;
    progress: { done: number; total: number; attempted: number };
  };
  labs: LabMyProgressRow[];
};

export function useLabSetMyProgress(courseId: string | undefined, labSetId: string | undefined) {
  const [data, setData] = useState<LabMyProgressResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!courseId || !labSetId) return;
    setLoading(true);
    setErr(null);
    try {
      const { data: d } = await api.get<LabMyProgressResponse>(
        `/courses/${courseId}/lab-sets/${labSetId}/my-progress`,
      );
      setData(d);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "加载题目进度失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [courseId, labSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, err, loading, reload: load };
}
