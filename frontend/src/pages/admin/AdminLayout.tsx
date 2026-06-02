import { NavLink, Outlet } from "react-router-dom";
import "./admin.css";

const SIDEBAR_LINKS = [
  { to: "/admin", label: "控制台", end: true },
  { to: "/admin/users", label: "用户管理", end: false },
  { to: "/admin/enrollment", label: "选课配置", end: false },
  { to: "/admin/courses", label: "课程运维", end: false },
  { to: "/admin/logs", label: "操作日志", end: false },
] as const;

const sidebarLinkClass = ({ isActive }: { isActive: boolean }) =>
  `admin-sidebar__link${isActive ? " active" : ""}`;

export default function AdminLayout() {
  return (
    <div className="admin-layout container">
      <aside className="admin-sidebar card">
        <p className="admin-sidebar__title">超级管理员</p>
        <nav className="admin-sidebar__nav" aria-label="管理后台">
          {SIDEBAR_LINKS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={sidebarLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__divider" />
        <nav className="admin-sidebar__nav" aria-label="预览入口">
          <NavLink to="/teaching" className={sidebarLinkClass}>
            教学台预览
          </NavLink>
        </nav>
      </aside>
      <div className="admin-main">
        <Outlet />
      </div>
    </div>
  );
}
