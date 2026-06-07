import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import PageShell from "../components/layout/PageShell";
import Reveal from "../components/motion/Reveal";
import DashboardCalendar from "../features/dashboard/DashboardCalendar";
import DashboardCourseGrid from "../features/dashboard/DashboardCourseGrid";
import DashboardStats from "../features/dashboard/DashboardStats";
import DashboardWelcome from "../features/dashboard/DashboardWelcome";
import WeeklySchedule from "../features/dashboard/WeeklySchedule";
import LabReminderBanner from "../features/dashboard/LabReminderBanner";
import type { DashboardPayload } from "../features/dashboard/types";
import { DASHBOARD_REFRESH } from "../lib/appEvents";

export default function Dashboard() {
  const { user, token } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

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

  return (
    <PageShell className="dash-page">
      {!data ? (
        <div className="panel-loading muted">加载课表与课程…</div>
      ) : (
        <div className="dash-home">
          <Reveal>
            <DashboardWelcome
              name={user.name}
              role={user.role}
              semesterLabel={data.semester.label}
            />
          </Reveal>

          <Reveal delay={0.04}>
            <div className="dash-home__quick-actions row" style={{ gap: 8, flexWrap: "wrap" }}>
              {user.role === "TEACHER" || user.role === "ADMIN" ? (
                <Link className="btn primary" to="/teaching">
                  教学台
                </Link>
              ) : null}
              {user.role === "STUDENT" ? (
                <Link className="btn primary" to="/enrollment">
                  选课
                </Link>
              ) : null}
              {user.role === "ADMIN" ? (
                <Link className="btn" to="/admin/users">
                  用户管理
                </Link>
              ) : null}
            </div>
          </Reveal>

          {err ? <div className="page-alert err">{err}</div> : null}

          {user.role === "STUDENT" && (data.activeLabReminders?.length ?? 0) > 0 ? (
            <LabReminderBanner reminders={data.activeLabReminders ?? []} />
          ) : null}

          <Reveal delay={0.06}>
            <DashboardStats data={data} role={user.role} />
          </Reveal>

          <div className="dash-home__grid">
            <div className="dash-home__main">
              <Reveal delay={0.08}>
                <DashboardCourseGrid courses={data.courses} />
              </Reveal>
            </div>
            <div className="dash-home__aside">
              <Reveal delay={0.1}>
                <DashboardCalendar courses={data.courses} deadlines={data.deadlines} />
              </Reveal>
            </div>
          </div>

          <div className="dash-home__schedule">
            <button
              type="button"
              className="dash-schedule-toggle"
              onClick={() => setScheduleOpen((v) => !v)}
              aria-expanded={scheduleOpen}
            >
              <span>{scheduleOpen ? "收起完整周课表" : "展开完整周课表"}</span>
              <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>
                {scheduleOpen ? "▴" : "▾"}
              </span>
            </button>
            {scheduleOpen ? (
              <Reveal>
                <WeeklySchedule
                  courses={data.courses}
                  deadlines={data.deadlines}
                  semesterLabel={data.semester.label}
                  userName={user.name}
                />
              </Reveal>
            ) : null}
          </div>
        </div>
      )}
    </PageShell>
  );
}
