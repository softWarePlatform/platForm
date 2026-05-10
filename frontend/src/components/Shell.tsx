import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  textDecoration: "none",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid transparent",
  color: "inherit",
  background: isActive ? "#e8eefc" : "transparent",
});

export default function Shell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
            <nav className="row" style={{ marginLeft: 8 }}>
              <NavLink to="/" end style={linkStyle}>
                首页
              </NavLink>
              <NavLink to="/courses" style={linkStyle}>
                课程中心
              </NavLink>
              {user?.role === "TEACHER" || user?.role === "ADMIN" ? (
                <>
                  <NavLink to="/teaching" style={linkStyle}>
                    教学台
                  </NavLink>
                  <NavLink to="/teaching/homework" style={linkStyle}>
                    作业测评
                  </NavLink>
                </>
              ) : null}
              {user?.role === "STUDENT" || user?.role === "ADMIN" ? (
                <NavLink to="/my-homework" style={linkStyle}>
                  我的作业
                </NavLink>
              ) : null}
              {user ? (
                <NavLink to="/profile" style={linkStyle}>
                  个人中心
                </NavLink>
              ) : null}
              {user?.role === "ADMIN" ? (
                <NavLink to="/admin/users" style={linkStyle}>
                  用户管理
                </NavLink>
              ) : null}
            </nav>
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
