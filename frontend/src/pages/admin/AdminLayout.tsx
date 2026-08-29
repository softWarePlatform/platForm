import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import styles from "./admin.module.css";

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

const MENU = [
  { to: "/admin", label: "控制台", end: true },
  { to: "/admin/users", label: "用户管理" },
  { to: "/admin/classserve", label: "班级目录" },
  { to: "/admin/homework-completion", label: "作业完成情况" },
  { to: "/admin/logs", label: "管理员操作日志" },
  { to: "/teaching", label: "课程运维" },
  { to: "/profile", label: "个人中心" },
];

export default function AdminLayout({ title, subtitle, children }: Props) {
  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <div className={styles.brandMark}>A</div>
          <div>
            <div className={styles.brandLabel}>超级管理员</div>
            <div className={styles.brandSub}>Admin Console</div>
          </div>
        </div>

        <nav className={styles.menu} aria-label="超级管理员导航">
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `${styles.menuItem} ${isActive ? styles.menuItemActive : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className={styles.main}>
        <section className={styles.topbar}>
          <div>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
          <div className={styles.topbarBadge}>2026 - 2027 春学期</div>
        </section>

        {children}
      </main>
    </div>
  );
}
