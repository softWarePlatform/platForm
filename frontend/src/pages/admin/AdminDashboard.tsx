import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import "./admin.css";

type AdminOverview = {
  semester: { key: string; label: string };
  users: { total: number; student: number; teacher: number; admin: number };
  courses: { total: number; published: number; currentSemester: number };
  enrollments: { currentSemester: number };
  enrollmentPeriod: {
    phase: string;
    label: string | null;
    openAt: string;
    closeAt: string;
    confirmDeadline: string | null;
  } | null;
};

const PHASE_LABEL: Record<string, string> = {
  PRESELECT: "预选",
  FORMAL: "正选",
  ADD_DROP: "补退选",
  CLOSED: "已关闭",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: overview } = await api.get<AdminOverview>("/admin/overview");
        if (!cancelled) setData(overview);
      } catch {
        if (!cancelled) setErr("无法加载控制台数据");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const period = data?.enrollmentPeriod;
  const periodOpen =
    period && new Date() >= new Date(period.openAt) && new Date() <= new Date(period.closeAt);

  return (
    <>
      <header className="admin-page-header">
        <h1>管理控制台</h1>
        <p className="muted" style={{ margin: 0 }}>
          超级管理员 · {user?.name}
          {data ? ` · ${data.semester.label}` : ""}
        </p>
      </header>

      {err ? <div className="err" style={{ marginBottom: 14 }}>{err}</div> : null}

      {!data ? (
        <div className="muted">加载概览…</div>
      ) : (
        <>
          <div className="admin-stats">
            <div className="card admin-stat-card">
              <div className="admin-stat-card__label">注册用户</div>
              <div className="admin-stat-card__value">{data.users.total}</div>
              <div className="admin-stat-card__hint">
                学生 {data.users.student} · 教师 {data.users.teacher} · 管理员 {data.users.admin}
              </div>
            </div>
            <div className="card admin-stat-card">
              <div className="admin-stat-card__label">课程总数</div>
              <div className="admin-stat-card__value">{data.courses.total}</div>
              <div className="admin-stat-card__hint">
                已发布 {data.courses.published} · 本学期 {data.courses.currentSemester}
              </div>
            </div>
            <div className="card admin-stat-card">
              <div className="admin-stat-card__label">本学期选课</div>
              <div className="admin-stat-card__value">{data.enrollments.currentSemester}</div>
              <div className="admin-stat-card__hint">人次（含重复选多门）</div>
            </div>
            <div className="card admin-stat-card">
              <div className="admin-stat-card__label">选课阶段</div>
              <div className="admin-stat-card__value" style={{ fontSize: 22 }}>
                {period ? PHASE_LABEL[period.phase] ?? period.phase : "未配置"}
              </div>
              <div className="admin-stat-card__hint">
                {period
                  ? periodOpen
                    ? "当前在开放时段内"
                    : "当前不在开放时段"
                  : "请前往选课配置"}
              </div>
            </div>
          </div>

          {period ? (
            <div className="card" style={{ marginBottom: 20, fontSize: 14 }}>
              <strong>选课时段</strong>
              <span className="muted" style={{ marginLeft: 8 }}>
                {period.label ?? data.semester.label}
              </span>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>
                开放：{fmtDate(period.openAt)} — {fmtDate(period.closeAt)}
                {period.confirmDeadline
                  ? ` · 确认截止：${fmtDate(period.confirmDeadline)}`
                  : null}
              </div>
            </div>
          ) : null}

          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>快捷入口</h2>
          <div className="admin-quick-links">
            <Link to="/admin/users" className="card admin-quick-link">
              <div className="admin-quick-link__title">用户管理</div>
              <div className="admin-quick-link__desc">查看全站用户、角色与邮箱验证状态</div>
            </Link>
            <Link to="/admin/enrollment" className="card admin-quick-link">
              <div className="admin-quick-link__title">选课配置</div>
              <div className="admin-quick-link__desc">设置选课阶段、时段，手动加退课与容量</div>
            </Link>
            <Link to="/admin/courses" className="card admin-quick-link">
              <div className="admin-quick-link__title">课程运维</div>
              <div className="admin-quick-link__desc">调整课程容量与选课相关字段</div>
            </Link>
            <Link to="/teaching" className="card admin-quick-link">
              <div className="admin-quick-link__title">教学台预览</div>
              <div className="admin-quick-link__desc">以管理员身份查看全部授课课程与教学模块</div>
            </Link>
          </div>
        </>
      )}
    </>
  );
}
