import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/client";
import type { StudentOverviewResponse, TeacherOverviewResponse } from "./labSetTypes";

type Mode = "student" | "teacher";

export function useLabSetOverview(mode: Mode, courseId?: string) {
  const [data, setData] = useState<StudentOverviewResponse | TeacherOverviewResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const path =
        mode === "student" ? "/lab-sets/mine/overview" : "/lab-sets/teaching/overview";
      const { data: d } = await api.get<StudentOverviewResponse | TeacherOverviewResponse>(path, {
        params: courseId ? { courseId } : {},
      });
      setData(d);
    } catch (e: unknown) {
      const msg =
        typeof e === "object" && e !== null && "response" in e
          ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
          : null;
      setErr(msg ?? "加载实验列表失败");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, err, loading, reload: load };
}
