import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import WeeklySchedule from "../features/dashboard/WeeklySchedule";
import CourseListPanel from "../features/dashboard/CourseListPanel";
import type { DashboardPayload } from "../features/dashboard/types";
import { DASHBOARD_REFRESH } from "../lib/appEvents";

export default function Dashboard() {
  const { user, token } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function loadDashboard() {
      try {
        const { data: d } = await api.get<DashboardPayload>("/dashboard/me");
        if (!cancelled) setData(d);
      } catch {
        if (!cancelled) setErr("无法加载主界面数据");
      }
    }

    void loadDashboard();

    const onRefresh = () => void loadDashboard();
    window.addEventListener(DASHBOARD_REFRESH, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(DASHBOARD_REFRESH, onRefresh);
    };
  }, [token]);

  if (!user) return <div className="container muted">加载中…</div>;
  const greeting =
    user.role === "TEACHER" ? "教师工作台" : user.role === "ADMIN" ? "管理员" : "学习中心";

  return (
    <div className="dashboard-layout">
      <div className="container" style={{ paddingTop: 20, paddingBottom: 32 }}>
        <div style={{ marginBottom: 20 }}>
          <div className="spread" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ margin: "0 0 6px", fontSize: 26 }}>主界面</h1>
              <p className="muted" style={{ margin: 0 }}>
                {greeting} · {user.name}
                {data ? ` · ${data.semester.label}` : ""}
              </p>
            </div>
            {user.role === "TEACHER" || user.role === "ADMIN" ? (
              <Link className="btn primary" to="/teaching">
                教学台
              </Link>
            ) : user.role === "STUDENT" ? (
              <Link className="btn primary" to="/enrollment">
                选课系统
              </Link>
            ) : null}
          </div>
        </div>

        {err ? <div className="err" style={{ marginBottom: 12 }}>{err}</div> : null}

        {!data ? (
          <div className="muted" style={{ marginTop: 16 }}>加载课表与课程…</div>
        ) : (
          <>
            <WeeklySchedule
              courses={data.courses}
              deadlines={data.deadlines}
              semesterLabel={data.semester.label}
              userName={user.name}
            />
            <CourseListPanel courses={data.courses} semesterLabel={data.semester.label} />
          </>
        )}
      </div>
    </div>
  );
}
