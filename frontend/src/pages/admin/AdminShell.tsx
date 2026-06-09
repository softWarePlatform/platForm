import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import styles from "./admin.module.css";

export default function AdminShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/admin" className={styles.brand}>
            教学实训平台
          </Link>
          <div className={styles.headerRight}>
            <span className={styles.userText}>
              {user?.name ?? "管理员"}（超级管理员）
            </span>
            <button
              className={styles.logoutButton}
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              退出
            </button>
          </div>
        </div>
      </header>
      <main className={styles.adminMain}>
        <Outlet />
      </main>
    </div>
  );
}
