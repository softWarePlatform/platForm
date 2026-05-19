import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { NOTIFICATIONS_REFRESH } from "../lib/appEvents";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  textDecoration: "none",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid transparent",
  color: "inherit",
  background: isActive ? "#e8eefc" : "transparent",
});

export default function Shell() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;

    async function fetchUnread() {
      try {
        const { data } = await api.get<{ count: number }>("/notifications/unread-count");
        if (!cancelled) setUnreadCount(data.count);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    }

    void fetchUnread();

    const onRefresh = () => void fetchUnread();
    window.addEventListener(NOTIFICATIONS_REFRESH, onRefresh);
    const t = window.setInterval(() => void fetchUnread(), 60000);

    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_REFRESH, onRefresh);
      clearInterval(t);
    };
  }, [token]);

  return (
    <div>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div className="container spread">
          <div className="row">
            <Link to="/" style={{ textDecoration: "none", fontWeight: 800 }}>
              教学实训平台
            </Link>
            {user ? (
              <nav className="row" style={{ marginLeft: 8 }}>
                <NavLink to="/" end style={linkStyle}>
                  主界面
                </NavLink>
                {user.role === "STUDENT" || user.role === "ADMIN" ? (
                  <NavLink to="/enrollment" style={linkStyle}>
                    选课系统
                  </NavLink>
                ) : null}
                {user.role === "TEACHER" || user.role === "ADMIN" ? (
                  <NavLink to="/teaching" style={linkStyle}>
                    教学台
                  </NavLink>
                ) : null}
                {user.role === "STUDENT" || user.role === "ADMIN" ? (
                  <NavLink to="/my-homework" style={linkStyle}>
                    我的作业
                  </NavLink>
                ) : null}
                {user.role === "TEACHER" || user.role === "ADMIN" ? (
                  <NavLink to="/teaching/homework" style={linkStyle}>
                    作业批改
                  </NavLink>
                ) : null}
                <NavLink to="/messages" style={linkStyle} className="nav-messages">
                  站内消息
                  {unreadCount > 0 ? (
                    <span className="nav-badge" aria-label={`${unreadCount} 条未读`}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </NavLink>
                <NavLink to="/profile" style={linkStyle}>
                  个人中心
                </NavLink>
                {user.role === "ADMIN" ? (
                  <NavLink to="/admin/users" style={linkStyle}>
                    用户管理
                  </NavLink>
                ) : null}
              </nav>
            ) : null}
          </div>

          <div className="row">
            {user ? (
              <>
                <span className="muted">
                  {user.name}（{user.role === "TEACHER" ? "教师" : user.role === "ADMIN" ? "管理员" : "学生"}）
                </span>
                {!user.emailVerified ? <span className="err">邮箱未验证</span> : null}
                <button
                  className="btn"
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                >
                  退出
                </button>
              </>
            ) : (
              <>
                <Link className="btn" to="/login">
                  登录
                </Link>
                <Link className="btn primary" to="/register">
                  注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
