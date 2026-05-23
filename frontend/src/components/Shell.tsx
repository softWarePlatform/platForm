import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth, type Role } from "../auth/AuthContext";
import { NOTIFICATIONS_REFRESH } from "../lib/appEvents";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  textDecoration: "none",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid transparent",
  color: "inherit",
  background: isActive ? "#e8eefc" : "transparent",
  whiteSpace: "nowrap" as const,
});

type NavItem = { to: string; label: string; end?: boolean; roles: Role[]; className?: string };

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "主界面", end: true, roles: ["STUDENT", "TEACHER", "ADMIN"] },
  { to: "/enrollment", label: "选课系统", roles: ["STUDENT", "ADMIN"] },
  { to: "/teaching", label: "教学台", roles: ["TEACHER", "ADMIN"] },
  { to: "/my-homework", label: "我的作业", roles: ["STUDENT", "ADMIN"] },
  { to: "/my-labs", label: "我的实验", roles: ["STUDENT", "ADMIN"] },
  { to: "/teaching/homework", label: "作业批改", roles: ["TEACHER", "ADMIN"] },
  { to: "/teaching/labs", label: "实验管理", roles: ["TEACHER", "ADMIN"] },
  { to: "/messages", label: "站内消息", roles: ["STUDENT", "TEACHER", "ADMIN"], className: "nav-messages" },
  { to: "/profile", label: "个人中心", roles: ["STUDENT", "TEACHER", "ADMIN"] },
  { to: "/admin/users", label: "用户管理", roles: ["ADMIN"] },
];

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

  const role = user?.role;
  const visibleNav = role ? NAV_ITEMS.filter((item) => item.roles.includes(role)) : [];

  return (
    <div>
      <header className="app-header">
        <div className="container app-header__inner">
          <div className="app-header__top spread">
            <Link to="/" className="app-header__brand">
              教学实训平台
            </Link>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              {user ? (
                <>
                  <span className="muted app-header__user">
                    {user.name}（
                    {user.role === "TEACHER" ? "教师" : user.role === "ADMIN" ? "管理员" : "学生"}）
                  </span>
                  {!user.emailVerified ? <span className="err">邮箱未验证</span> : null}
                  <button
                    className="btn"
                    type="button"
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

          {user ? (
            <nav className="app-header__nav row" aria-label="站点导航">
              {visibleNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  style={linkStyle}
                  className={item.className}
                >
                  {item.label}
                  {item.to === "/messages" && unreadCount > 0 ? (
                    <span className="nav-badge" aria-label={`${unreadCount} 条未读`}>
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </nav>
          ) : null}
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
