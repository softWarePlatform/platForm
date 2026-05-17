import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import WeeklySchedule from "../features/dashboard/WeeklySchedule";
import CourseListPanel from "../features/dashboard/CourseListPanel";
import type { DashboardPayload } from "../features/dashboard/types";

export default function Dashboard() {
  const { user, token } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await api.get<DashboardPayload>("/dashboard/me");
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setErr("无法加载主界面数据");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!user) return <div className="container muted">加载中…</div>;
  const greeting =
    user.role === "TEACHER" ? "教师工作台" : user.role === "ADMIN" ? "管理员" : "学习中心";

  return (
    <div className="dashboard-layout">
      <div className="container" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: "0 0 6px", fontSize: 26 }}>主界面</h1>
          <p className="muted" style={{ margin: 0 }}>
            {greeting} · {user.name}
            {data ? ` · ${data.semester.label}` : ""}
          </p>
        </div>

        {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}

        {!data ? (
          <div className="muted" style={{ marginTop: 16 }}>加载课表与课程…</div>
        ) : (
          <>
            <WeeklySchedule courses={data.courses} deadlines={data.deadlines} />
            <CourseListPanel courses={data.courses} semesterLabel={data.semester.label} />
          </>
        )}
      </div>
    </div>
  );
}
